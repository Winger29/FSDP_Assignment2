// src/services/collaborationService.ts

import { db, supabase } from "../config/database";
import { logger } from "../utils/logger";
import crypto from "crypto";
import { Response } from "express";
import { openaiStream } from "./openaiService";
import OpenAI from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

/**
 * Compute confidence score from token log probabilities
 * Uses geometric mean of token probabilities converted to percentage
 * @param logprobs - Token log probabilities from OpenAI response
 * @returns Confidence score 0-100, or null if unavailable
 */
function computeConfidenceFromLogprobs(logprobs: any): number | null {
  if (!logprobs || !logprobs.content || logprobs.content.length === 0) {
    return null;
  }

  // Extract token logprobs
  const tokenLogprobs = logprobs.content
    .map((token: any) => token.logprob)
    .filter((lp: number) => lp !== null && lp !== undefined);

  if (tokenLogprobs.length === 0) {
    return null;
  }

  // Convert logprobs to probabilities and compute geometric mean
  // Geometric mean = exp(mean(log probabilities))
  const sumLogprobs = tokenLogprobs.reduce((sum: number, lp: number) => sum + lp, 0);
  const meanLogprob = sumLogprobs / tokenLogprobs.length;
  const geometricMean = Math.exp(meanLogprob);
  
  // Convert to percentage (0-100)
  const confidenceScore = geometricMean * 100;
  
  return Math.min(100, Math.max(0, confidenceScore));
}

interface CollaborativeTask {
  id: string;
  teamId: string;
  userId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  result: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface TaskAssignment {
  id: string;
  taskId: string;
  agentId: string;
  subtaskDescription: string;
  status: string;
  result: string | null;
  startedAt: string | null;
  completedAt: string | null;
  executionOrder: number;
}

class CollaborationService {
  /**
   * Create a collaborative task and break it down into subtasks
   */
  async createCollaborativeTask(
    teamId: string,
    userId: string,
    data: {
      title: string;
      description: string;
      priority?: string;
      parentTaskId?: string;
    }
  ): Promise<CollaborativeTask> {
    try {
      const taskId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Determine version number
      let versionNumber = 1;
      if (data.parentTaskId) {
        const { data: parentTask, error: parentError } = await supabase
          .from('collaborative_tasks')
          .select('version_number')
          .eq('id', data.parentTaskId)
          .single();
        
        if (!parentError && parentTask) {
          versionNumber = parentTask.version_number + 1;
        }
      }

      // Create task
      const { error: insertError } = await supabase
        .from('collaborative_tasks')
        .insert({
          id: taskId,
          team_id: teamId,
          user_id: userId,
          title: data.title,
          description: data.description,
          status: "PENDING",
          priority: data.priority || "MEDIUM",
          version_number: versionNumber,
          parent_task_id: data.parentTaskId || null,
          created_at: now,
        });

      if (insertError) throw insertError;

      // Get team members
      const { data: members, error: membersError } = await supabase
        .from('team_members')
        .select(`
          *,
          agents!team_members_agent_id_fkey (
            name,
            type,
            capabilities,
            configuration
          )
        `)
        .eq('team_id', teamId)
        .order('is_primary_agent', { ascending: false });

      if (membersError) throw membersError;

      // Use AI to break down the task into subtasks for each agent
      const subtasks = await this.generateSubtasks(data.description, members);

      // Create task assignments
      for (let i = 0; i < subtasks.length; i++) {
        const subtask = subtasks[i];
        const { error: assignError } = await supabase
          .from('task_assignments')
          .insert({
            id: crypto.randomUUID(),
            task_id: taskId,
            agent_id: subtask.agentId,
            subtask_description: subtask.description,
            status: "PENDING",
            execution_order: i + 1,
          });

        if (assignError) throw assignError;
      }

      logger.info(`Collaborative task created: ${taskId}`);
      return await this.getTaskById(taskId, userId);
    } catch (error) {
      logger.error("Create collaborative task error:", error);
      throw error;
    }
  }

  /**
   * Use GPT to intelligently break down a task based on agent capabilities
   */
  private async generateSubtasks(
    taskDescription: string,
    members: any[]
  ): Promise<Array<{ agentId: string; description: string }>> {
    try {
      const agentProfiles = members.map((m) => ({
        id: m.agent_id, // Use snake_case from database
        name: m.agents?.name || 'Unknown Agent',
        role: m.role,
        type: m.agents?.type || 'assistant',
        isPrimary: m.is_primary_agent, // Use snake_case from database
      }));

      const prompt = `You are a task delegation expert. Given a complex task and a team of AI agents, break down the task into specific subtasks for each agent.

Task: ${taskDescription}

Team Members:
${agentProfiles.map((a) => `- ${a.name} (Role: ${a.role}, Type: ${a.type}, Primary: ${a.isPrimary})`).join("\n")}

Generate a JSON array of subtasks. Each subtask should have:
- agentId: The agent's ID
- description: Clear, specific subtask description (2-3 sentences)

The primary agent should coordinate and synthesize results. Other agents should handle specific aspects based on their roles.

Respond with ONLY valid JSON array, no other text.`;

      let response;
      try {
        response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 1000,
        });
      } catch (error: any) {
        // Check if error is model-related
        const isModelError = error?.status === 404 || 
                            error?.code === 'model_not_found' ||
                            error?.message?.toLowerCase().includes('model') ||
                            error?.error?.code === 'model_not_found';
        
        if (isModelError) {
          logger.warn(`Model "gpt-4o-mini" not available, trying fallback to gpt-3.5-turbo`);
          // Retry with gpt-3.5-turbo as ultimate fallback
          response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 1000,
          });
        } else {
          throw error;
        }
      }

      let content = response.choices[0].message.content || "[]";
      // Strip markdown code blocks if present
      content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const subtasks = JSON.parse(content);

      // Validate and ensure all agents have tasks
      const result: Array<{ agentId: string; description: string }> = [];
      for (const agent of agentProfiles) {
        const subtask = subtasks.find((s: any) => s.agentId === agent.id);
        if (subtask) {
          result.push(subtask);
        } else {
          // Generate a default subtask
          result.push({
            agentId: agent.id,
            description: `Provide analysis and insights from the perspective of ${agent.role}.`,
          });
        }
      }

      return result;
    } catch (error) {
      logger.error("Generate subtasks error:", error);
      // Fallback: Create generic subtasks using correct field names
      return members.map((m) => ({
        agentId: m.agent_id, // Use snake_case from database
        description: `Analyze the task from the perspective of ${m.role}.`,
      }));
    }
  }

  /**
   * Execute collaborative task with streaming
   */
  async executeCollaborativeTask(
    taskId: string,
    userId: string,
    res: Response
  ): Promise<void> {
    try {
      // Set up SSE
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const sendEvent = (event: string, data: any) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Update task status
      const { error: statusError } = await supabase
        .from('collaborative_tasks')
        .update({ status: 'IN_PROGRESS' })
        .eq('id', taskId);

      if (statusError) throw statusError;

      sendEvent("status", { message: "Starting collaborative task execution..." });

      // Get task and assignments - check owner or shared access
      const { data: taskRows, error: taskError } = await supabase
        .from('collaborative_tasks')
        .select('*')
        .eq('id', taskId)
        .or(`user_id.eq.${userId}`);

      if (taskError) throw taskError;

      if (!taskRows || taskRows.length === 0) {
        sendEvent("error", { message: "Task not found" });
        res.end();
        return;
      }

      const task = taskRows[0];

      // Fetch task attachments (optional - skip if table doesn't exist)
      let attachments: any[] = [];
      try {
        const { data: attachData, error: attachError } = await supabase
          .from('task_attachments')
          .select('*')
          .eq('task_id', taskId)
          .order('uploaded_at', { ascending: true });

        if (!attachError) {
          attachments = attachData || [];
        }
      } catch (err) {
        logger.warn('Task attachments table not found, skipping attachments');
      }

      logger.info(`Found ${attachments?.length || 0} attachments for task ${taskId}`);

      // Process attachments for vision
      const imageAttachments: Array<{ filename: string; base64: string; mimeType: string }> = [];
      const documentAttachments: string[] = [];

      if (attachments && attachments.length > 0) {
        for (const att of attachments) {
          // Use snake_case column names from Supabase
          logger.info(`Processing attachment: ${att.original_file_name}, fileType: ${att.file_type}`);
          const isImage = att.file_type?.startsWith('image/');
          
          if (isImage) {
            try {
              // file_path from DB is already absolute
              const fullPath = att.file_path;
              logger.info(`Attempting to read image from: ${fullPath}`);
              if (fs.existsSync(fullPath)) {
                const buffer = fs.readFileSync(fullPath);
                const base64 = buffer.toString('base64');
                imageAttachments.push({
                  filename: att.original_file_name,
                  base64,
                  mimeType: att.file_type
                });
                logger.info(`Successfully loaded image: ${att.original_file_name}`);
              } else {
                logger.warn(`Image file not found: ${fullPath}`);
              }
            } catch (err) {
              logger.warn(`Failed to read image ${att.original_file_name}:`, err);
            }
          } else {
            documentAttachments.push(`${att.original_file_name} (${att.file_type})`);
          }
        }
      }

      logger.info(`Processed attachments: ${imageAttachments.length} images, ${documentAttachments.length} documents`);

      // First get all task assignments with agent info
      const { data: assignments, error: assignError } = await supabase
        .from('task_assignments')
        .select(`
          *,
          agents!task_assignments_agent_id_fkey (
            name,
            configuration
          )
        `)
        .eq('task_id', taskId)
        .order('execution_order', { ascending: true });

      if (assignError) throw assignError;

      // Get team members separately to get roles
      const { data: teamMembers, error: tmError } = await supabase
        .from('team_members')
        .select('agent_id, role')
        .eq('team_id', task.team_id);

      if (tmError) throw tmError;

      // Create a map of agent_id to role
      const agentRoleMap = new Map(teamMembers?.map(tm => [tm.agent_id, tm.role]) || []);

      const contributions: Array<{ agentName: string; role: string; result: string }> = [];

      // Execute each agent's subtask
      for (const assignment of assignments) {
        const role = agentRoleMap.get(assignment.agent_id) || 'Agent';
        
        sendEvent("agent_start", {
          agentId: assignment.agent_id,
          agentName: assignment.agents.name,
          role: role,
          subtask: assignment.subtask_description,
        });

        // Update assignment status
        const { error: updateAssignError } = await supabase
          .from('task_assignments')
          .update({ 
            status: 'IN_PROGRESS', 
            started_at: new Date().toISOString() 
          })
          .eq('id', assignment.id);

        if (updateAssignError) throw updateAssignError;

        // Execute agent's subtask
        const { result, confidence } = await this.executeAgentSubtask(
          assignment,
          task.description,
          contributions,
          imageAttachments,
          documentAttachments,
          sendEvent
        );

        // Save result
        const { error: saveResultError } = await supabase
          .from('task_assignments')
          .update({
            status: 'COMPLETED',
            result,
            completed_at: new Date().toISOString(),
          })
          .eq('id', assignment.id);

        if (saveResultError) throw saveResultError;

        // Save contribution
        const { error: saveContribError } = await supabase
          .from('agent_contributions')
          .insert({
            id: crypto.randomUUID(),
            task_id: taskId,
            agent_id: assignment.agent_id,
            contribution: result,
            confidence: 0.85,
            created_at: new Date().toISOString(),
          });

        if (saveContribError) throw saveContribError;

        const agentRole = agentRoleMap.get(assignment.agent_id) || 'Agent';
        contributions.push({
          agentName: assignment.agents.name,
          role: agentRole,
          result,
        });

        sendEvent("agent_complete", {
          agentId: assignment.agent_id,
          agentName: assignment.agents.name,
          result,
        });
      }

      // Synthesize final result
      sendEvent("synthesis", { message: "Synthesizing team results..." });
      const finalResult = await this.synthesizeResults(task.description, contributions);

      // Update task with final result
      const { error: finalUpdateError } = await supabase
        .from('collaborative_tasks')
        .update({
          status: 'COMPLETED',
          result: finalResult,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      if (finalUpdateError) throw finalUpdateError;

      sendEvent("complete", { result: finalResult });
      res.end();
    } catch (error: any) {
      logger.error("Execute collaborative task error:", error);
      
      // Reset task status back to PENDING on error
      await supabase
        .from('collaborative_tasks')
        .update({ status: 'PENDING' })
        .eq('id', taskId);
      
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`
      );
      res.end();
    }
  }

  /**
   * Execute a single agent's subtask
   */
  private async executeAgentSubtask(
    assignment: any,
    mainTaskDescription: string,
    previousContributions: Array<{ agentName: string; role: string; result: string }>,
    imageAttachments: Array<{ filename: string; base64: string; mimeType: string }>,
    documentAttachments: string[],
    sendEvent: (event: string, data: any) => void
  ): Promise<{ result: string; confidence: number | null }> {
    try {
      const config = JSON.parse(assignment.configuration || "{}");
      const model = config.model || "gpt-4o-mini";

      const context =
        previousContributions.length > 0
          ? `\n\nPrevious team contributions:\n${previousContributions
              .map((c) => `${c.agentName} (${c.role}): ${c.result}`)
              .join("\n\n")}`
          : "";

      // Add document context if any
      const docContext = documentAttachments.length > 0
        ? `\n\n📎 Attached documents:\n${documentAttachments.map(d => `- ${d}`).join('\n')}`
        : '';

      const systemPrompt = `You are ${assignment.name}, a specialized AI agent with the role of ${assignment.role}.

Main Task: ${mainTaskDescription}${docContext}

Your specific subtask: ${assignment.subtaskDescription}${context}

Provide a focused, actionable response for your specific subtask. Be concise and professional.`;

      // Build message content with vision support
      let userContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
      
      if (imageAttachments.length > 0) {
        // Vision mode: build content array with images
        userContent = [
          { type: "text", text: `Analyze the attached image(s) and complete your subtask.\n\nImages: ${imageAttachments.map(img => img.filename).join(', ')}` }
        ];
        
        // Add each image
        for (const img of imageAttachments) {
          userContent.push({
            type: "image_url",
            image_url: {
              url: `data:${img.mimeType};base64,${img.base64}`
            }
          });
        }
      } else {
        // Text-only mode
        userContent = "Complete your assigned subtask based on the above context.";
      }

      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: userContent as any }
      ];

      // Request logprobs for confidence computation
      let response;
      try {
        response = await openai.chat.completions.create({
          model,
          messages,
          temperature: 0.7,
          stream: false,
          logprobs: true,
          top_logprobs: 1,
        });
      } catch (error: any) {
        // Check if error is model-related
        const isModelError = error?.status === 404 || 
                            error?.code === 'model_not_found' ||
                            error?.message?.toLowerCase().includes('model') ||
                            error?.error?.code === 'model_not_found';
        
        if (isModelError && model !== 'gpt-4o-mini') {
          logger.warn(`Model "${model}" not found or unavailable, falling back to gpt-4o-mini`);
          // Retry with default model
          response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            temperature: 0.7,
            stream: false,
            logprobs: true,
            top_logprobs: 1,
          });
        } else {
          // Re-throw if not a model error or already using default
          throw error;
        }
      }

      const fullResponse = response.choices[0].message.content || "";
      const confidence = computeConfidenceFromLogprobs(response.choices[0].logprobs);

      // Stream the response for UI feedback
      sendEvent("agent_stream", {
        agentId: assignment.agentId,
        content: fullResponse,
      });

      return { result: fullResponse.trim(), confidence };
    } catch (error) {
      logger.error("Execute agent subtask error:", error);
      return { result: `Error executing subtask: ${error}`, confidence: null };
    }
  }

  /**
   * Synthesize all agent contributions into a final result
   */
  private async synthesizeResults(
    taskDescription: string,
    contributions: Array<{ agentName: string; role: string; result: string }>
  ): Promise<string> {
    try {
      const prompt = `You are a synthesis coordinator. Multiple AI agents have worked on different aspects of a task. Your job is to combine their contributions into a comprehensive, cohesive final result.

Task: ${taskDescription}

Agent Contributions:
${contributions.map((c) => `\n${c.agentName} (${c.role}):\n${c.result}`).join("\n\n---\n")}

Synthesize these contributions into a comprehensive final result that:
1. Integrates all key insights from each agent
2. Resolves any conflicts or contradictions
3. Provides clear, actionable recommendations
4. Maintains professional tone

Provide the final synthesized result:`;

      let response;
      try {
        response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.5,
          max_tokens: 1500,
        });
      } catch (error: any) {
        // Check if error is model-related
        const isModelError = error?.status === 404 || 
                            error?.code === 'model_not_found' ||
                            error?.message?.toLowerCase().includes('model') ||
                            error?.error?.code === 'model_not_found';
        
        if (isModelError) {
          logger.warn(`Model "gpt-4o-mini" not available, trying fallback to gpt-3.5-turbo`);
          // Retry with gpt-3.5-turbo as ultimate fallback
          response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: "user", content: prompt }],
            temperature: 0.5,
            max_tokens: 1500,
          });
        } else {
          throw error;
        }
      }

      return response.choices[0].message.content || "Synthesis failed";
    } catch (error) {
      logger.error("Synthesize results error:", error);
      return contributions.map((c) => `${c.agentName}: ${c.result}`).join("\n\n");
    }
  }

  /**
   * Get task by ID
   * Users can view tasks if they have access to the team OR the specific task
   * Users can edit/create versions only if they have specific task access
   */
  async getTaskById(taskId: string, userId: string): Promise<any> {
    try {
      const { data: tasks, error: taskError } = await supabase
        .from('collaborative_tasks')
        .select('*')
        .eq('id', taskId);

      if (taskError) throw taskError;

      if (!tasks || tasks.length === 0) {
        throw new Error("Task not found");
      }

      const task = tasks[0];

      // Check if user has access (either owns the task OR has shared access to the team)
      const { data: team } = await supabase
        .from('teams')
        .select('user_id')
        .eq('id', task.team_id)
        .single();

      logger.info(`🔍 Task access check: taskUserId=${task.user_id}, teamUserId=${team?.user_id}, currentUserId=${userId}`);

      const isOwner = task.user_id === userId || team?.user_id === userId;

      if (!isOwner) {
        // Check for shared access - find agents owned by team owner that are shared with current user
        const { data: ownerAgents } = await supabase
          .from('agents')
          .select('id')
          .eq('user_id', team?.user_id);

        logger.info(`🔍 Owner agents found: ${ownerAgents?.length || 0}`, ownerAgents?.map(a => a.id));

        if (ownerAgents && ownerAgents.length > 0) {
          const agentIds = ownerAgents.map(a => a.id);
          
          const { data: sharedAccess, error: shareError } = await supabase
            .from('share_requests')
            .select('*')
            .eq('resource_type', 'agent')
            .in('resource_id', agentIds)
            .eq('requester_user_id', userId)
            .eq('status', 'approved')
            .limit(1)
            .maybeSingle();

          if (!sharedAccess) {
            throw new Error("Task not found");
          }
        } else {
          throw new Error("Task not found");
        }
      }

      // Get assignments
      const { data: assignments, error: assignError } = await supabase
        .from('task_assignments')
        .select(`
          *,
          agents!task_assignments_agent_id_fkey (name)
        `)
        .eq('task_id', taskId)
        .order('execution_order', { ascending: true });

      if (assignError) throw assignError;

      // Get team members separately to get roles
      const { data: teamMembers, error: tmError } = await supabase
        .from('team_members')
        .select('agent_id, role')
        .eq('team_id', task.team_id);

      if (tmError) throw tmError;

      const agentRoleMap = new Map(teamMembers?.map(tm => [tm.agent_id, tm.role]) || []);

      task.assignments = assignments?.map(a => ({
        ...a,
        agentId: a.agent_id,
        agentName: a.agents?.name,
        role: agentRoleMap.get(a.agent_id) || 'Agent'
      })) || [];

      // Set ownership and edit flags for frontend access control
      task.isOwner = task.user_id === userId ? 1 : 0;
      task.canEdit = 1; // All users with access can create versions

      // Get contributions
      const { data: contributions, error: contribError } = await supabase
        .from('agent_contributions')
        .select(`
          *,
          agents!agent_contributions_agent_id_fkey (name)
        `)
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (contribError) throw contribError;

      task.contributions = contributions?.map(c => ({
        ...c,
        agentId: c.agent_id,
        agentName: c.agents?.name,
        createdAt: c.created_at
      })) || [];

      // Map snake_case to camelCase for frontend
      task.teamId = task.team_id;
      task.userId = task.user_id;
      task.parentTaskId = task.parent_task_id;
      task.versionNumber = task.version_number;
      task.createdAt = task.created_at;
      task.completedAt = task.completed_at;

      return task;
    } catch (error) {
      logger.error("Get task error:", error);
      throw error;
    }
  }

  /**
   * Verify user has access to a team (either as owner or shared user)
   */
  private async verifyTeamAccess(teamId: string, userId: string): Promise<void> {
    const { data: team } = await supabase
      .from('teams')
      .select('user_id')
      .eq('id', teamId)
      .single();

    if (!team) {
      throw new Error("Team not found");
    }

    const isOwner = team.user_id === userId;

    if (!isOwner) {
      // Check for shared team access in resource_access table
      const { data: teamAccess } = await supabase
        .from('resource_access')
        .select('id')
        .eq('resource_type', 'team')
        .eq('resource_id', teamId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!teamAccess) {
        // Also check for shared agent access (old logic)
        const { data: ownerAgents } = await supabase
          .from('agents')
          .select('id')
          .eq('user_id', team.user_id);

        if (ownerAgents && ownerAgents.length > 0) {
          const agentIds = ownerAgents.map(a => a.id);
          
          const { data: sharedAccess } = await supabase
            .from('share_requests')
            .select('id')
            .eq('resource_type', 'agent')
            .in('resource_id', agentIds)
            .eq('requester_user_id', userId)
            .eq('status', 'approved')
            .limit(1)
            .maybeSingle();

          if (!sharedAccess) {
            throw new Error("Team not found");
          }
        } else {
          throw new Error("Team not found");
        }
      }
    }
  }

  /**
   * Get all tasks for a team
   */
  async getTasksByTeam(teamId: string, userId: string): Promise<any[]> {
    try {
      // Verify user has access to the team first
      await this.verifyTeamAccess(teamId, userId);

      // Get all tasks for the team (not just user's own tasks)
      const { data: tasks, error: taskError } = await supabase
        .from('collaborative_tasks')
        .select('*')
        .eq('team_id', teamId)
        .is('parent_task_id', null)
        .order('created_at', { ascending: false });

      if (taskError) throw taskError;

      for (const task of tasks || []) {
        // Get version count
        const { count: versionCount } = await supabase
          .from('collaborative_tasks')
          .select('*', { count: 'exact', head: true })
          .or(`id.eq.${task.id},parent_task_id.eq.${task.id}`);

        task.versionCount = versionCount || 0;

        // Get assignments
        const { data: assignments, error: assignError } = await supabase
          .from('task_assignments')
          .select(`
            *,
            agents!task_assignments_agent_id_fkey (name)
          `)
          .eq('task_id', task.id)
          .order('execution_order', { ascending: true });

        if (assignError) throw assignError;

        // Get team members separately to get roles
        const { data: teamMembers, error: tmError } = await supabase
          .from('team_members')
          .select('agent_id, role')
          .eq('team_id', teamId);

        if (tmError) throw tmError;

        const agentRoleMap = new Map(teamMembers?.map(tm => [tm.agent_id, tm.role]) || []);

        task.assignments = assignments?.map(a => ({
          ...a,
          agentId: a.agent_id,
          agentName: a.agents?.name,
          role: agentRoleMap.get(a.agent_id) || 'Agent'
        })) || [];
      }

      return tasks || [];
    } catch (error) {
      logger.error("Get tasks by team error:", error);
      throw error;
    }
  }

  /**
   * Record feedback for a collaborative task
   */
  async recordTaskFeedback(taskId: string, userId: string, feedback: number): Promise<void> {
    try {
      // Get task with team info
      const { data: task, error: taskError } = await supabase
        .from('collaborative_tasks')
        .select(`
          id,
          user_id,
          team_id,
          teams!collaborative_tasks_team_id_fkey (
            id,
            user_id,
            members:team_members (
              agent_id
            )
          )
        `)
        .eq('id', taskId)
        .single();

      if (taskError || !task) {
        throw new Error("Task not found or unauthorized");
      }

      // Check access: owner, team owner, or has shared access to team agents
      const isTaskOwner = task.user_id === userId;
      const isTeamOwner = task.teams?.user_id === userId;

      if (!isTaskOwner && !isTeamOwner) {
        // Check if user has shared access to any of the team's agents
        const agentIds = task.teams?.members?.map((m: any) => m.agent_id) || [];
        
        if (agentIds.length > 0) {
          const { data: sharedAccess } = await supabase
            .from('share_requests')
            .select('*')
            .eq('resource_type', 'agent')
            .in('resource_id', agentIds)
            .eq('requester_user_id', userId)
            .eq('status', 'approved')
            .limit(1)
            .maybeSingle();

          if (!sharedAccess) {
            throw new Error("Task not found or unauthorized");
          }
        } else {
          throw new Error("Task not found or unauthorized");
        }
      }

      // Update feedback
      const { error: updateError } = await supabase
        .from('collaborative_tasks')
        .update({ feedback })
        .eq('id', taskId);

      if (updateError) throw updateError;

      logger.info(`Task feedback recorded: taskId=${taskId}, feedback=${feedback}`);
    } catch (error) {
      logger.error("Record task feedback error:", error);
      throw error;
    }
  }

  /**
   * Get task with version history
   */
  async getTaskWithVersions(taskId: string, userId: string): Promise<any> {
    try {
      const task = await this.getTaskById(taskId, userId);
      
      // Get all versions (parent and children) with creator info
      let rootTaskId = task.parent_task_id || task.id;
      
      const { data: versions, error: versionsError } = await supabase
        .from('collaborative_tasks')
        .select(`
          id,
          title,
          version_number,
          status,
          created_at,
          completed_at,
          feedback,
          parent_task_id,
          user_id,
          users!collaborative_tasks_user_id_fkey (name)
        `)
        .or(`id.eq.${rootTaskId},parent_task_id.eq.${rootTaskId}`)
        .order('version_number', { ascending: true });

      if (versionsError) throw versionsError;

      logger.info(`📚 Task versions for ${taskId}:`, {
        rootTaskId,
        versionsCount: versions?.length,
        versionIds: versions?.map(v => ({ id: v.id, version: v.version_number, creator: v.user_id }))
      });

      return {
        ...task,
        versions: versions?.map(v => ({
          ...v,
          creatorId: v.user_id,
          creatorName: v.users?.name,
          isOwner: v.user_id === userId ? 1 : 0,
          canEdit: 1, // All users with access can create versions
        })) || [],
      };
    } catch (error) {
      logger.error("Get task with versions error:", error);
      throw error;
    }
  }

  /**
   * Create a new version of an existing task
   */
  async createTaskVersion(
    originalTaskId: string,
    userId: string,
    updates: {
      title?: string;
      description?: string;
      priority?: string;
    }
  ): Promise<CollaborativeTask> {
    try {
      // Get original task
      const originalTask = await this.getTaskById(originalTaskId, userId);
      
      if (!originalTask) {
        throw new Error("Original task not found");
      }

      // Create new version with updated data
      const newTask = await this.createCollaborativeTask(
        originalTask.team_id,
        userId,
        {
          title: updates.title || originalTask.title,
          description: updates.description || originalTask.description,
          priority: updates.priority || originalTask.priority,
          parentTaskId: originalTask.parent_task_id || originalTaskId,
        }
      );

      logger.info(`Created new task version: ${newTask.id} from ${originalTaskId}`);
      return newTask;
    } catch (error) {
      logger.error("Create task version error:", error);
      throw error;
    }
  }

  /**
   * Delete a collaborative task and its related data
   */
  async deleteTask(taskId: string, userId: string): Promise<void> {
    try {
      // Verify task exists and user has permission
      const task = await this.getTaskById(taskId, userId);
      if (!task) {
        throw new Error("Task not found or access denied");
      }

      // Check if user is the actual task owner (not just a shared user)
      if (task.user_id !== userId) {
        throw new Error("Only the task owner can delete tasks");
      }

      // Delete task assignments
      const { error: assignError } = await supabase
        .from('task_assignments')
        .delete()
        .eq('task_id', taskId);

      if (assignError) throw assignError;

      // Delete task attachments (database records)
      const { error: attachError } = await supabase
        .from('task_attachments')
        .delete()
        .eq('task_id', taskId);

      if (attachError) throw attachError;

      // Delete the task itself
      const { error: deleteError } = await supabase
        .from('collaborative_tasks')
        .delete()
        .eq('id', taskId)
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      logger.info(`Deleted task: ${taskId}`);
    } catch (error) {
      logger.error("Delete task error:", error);
      throw error;
    }
  }
}

export const collaborationService = new CollaborationService();

