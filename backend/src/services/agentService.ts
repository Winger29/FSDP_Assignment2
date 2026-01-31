// src/services/agentService.ts
import { Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { db, supabase, supabaseAdmin } from "../config/database"; 
import { logger } from "../utils/logger";
import { openaiStream, openaiChat, AIMessage } from "./openaiService";

class AgentService {
  /**
   * GET ALL AGENTS
   */
  getAllAgents = async (userId: string) => {
    try {
      logger.info('📋 Fetching agents for user:', userId);
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('❌ Error fetching agents:', error);
        throw error;
      }
      
      logger.info('✅ Found', data?.length || 0, 'agents');
      return data || [];
    } catch (err: any) {
      logger.error('❌ getAllAgents exception:', err.message || err);
      throw err;
    }
  };

  /**
   * GET AGENT BY ID
   */
  getAgentById = async (agentId: string, userId: string) => {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .eq('user_id', userId)
      .single();
    
    if (error) {
      // Only log if it's not a "not found" error
      if (error.code !== 'PGRST116') {
        logger.error('Error fetching agent:', error);
      }
      return null;
    }
    return data;
  };

  /**
   * CREATE AGENT
   */
  createAgent = async (userId: string, data: any) => {
    logger.info('Creating agent for user:', userId);
    
    // Ensure user exists in public.users table (fixes RLS foreign key issue)
    try {
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();

      if (checkError || !existingUser) {
        logger.warn('User not in public.users table, attempting to create entry:', userId);
        
        // Try to get user from auth.users to get their email
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
        
        if (!authError && authUser?.user) {
          const { error: insertError } = await supabase
            .from('users')
            .insert({
              id: userId,
              email: authUser.user.email,
              name: authUser.user.user_metadata?.full_name || authUser.user.email?.split("@")[0] || 'User',
              password: '', // Empty password since auth is handled by Supabase
            });

          if (insertError) {
            logger.warn('Failed to create user entry (might already exist):', insertError.message);
            // Continue anyway - user might have been created by another request
          } else {
            logger.info('✅ User entry created in public.users:', userId);
          }
        }
      }
    } catch (err: any) {
      logger.warn('Error ensuring user exists:', err.message);
      // Continue anyway - agent creation might still work
    }
    
    const { data: newAgent, error } = await supabase
      .from('agents')
      .insert({ 
        name: data.name,
        description: data.description,
        type: data.type,
        user_id: userId,
        configuration: data.configuration || {"system_prompt": "You are a helpful assistant.", "model": "gpt-4o-mini"},
        metrics: { totalInteractions: 0, successRate: 0, avgResponseTime: 0 },
        status: data.status || 'ACTIVE',
        capabilities: data.capabilities || []
      })
      .select()
      .single();

    if (error) {
      logger.error('Agent creation error details:', error);
      throw error;
    }
    return newAgent;
  };

  /**
   * UPDATE AGENT
   */
  updateAgent = async (agentId: string, userId: string, updateData: any) => {
    // Convert camelCase to snake_case for Supabase
    const snakeCaseData: any = {};
    
    if (updateData.name !== undefined) snakeCaseData.name = updateData.name;
    if (updateData.description !== undefined) snakeCaseData.description = updateData.description;
    if (updateData.type !== undefined) snakeCaseData.type = updateData.type;
    if (updateData.status !== undefined) snakeCaseData.status = updateData.status;
    if (updateData.avatar !== undefined) snakeCaseData.avatar = updateData.avatar;
    if (updateData.capabilities !== undefined) snakeCaseData.capabilities = updateData.capabilities;
    if (updateData.configuration !== undefined) snakeCaseData.configuration = updateData.configuration;
    if (updateData.metrics !== undefined) snakeCaseData.metrics = updateData.metrics;
    
    snakeCaseData.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('agents')
      .update(snakeCaseData)
      .eq('id', agentId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      logger.error('Update agent error:', error);
      throw error;
    }
    return updated;
  };

  /**
   * DELETE AGENT
   */
  deleteAgent = async (agentId: string, userId: string) => {
    const { error } = await supabase
      .from('agents')
      .delete()
      .eq('id', agentId)
      .eq('user_id', userId);

    if (error) return null;
    return { id: agentId };
  };

  /**
   * TEST AGENT (Non-streaming)
   */
  testAgent = async (agentId: string, userId: string, message: string) => {
    const agent = await this.getAgentById(agentId, userId);
    if (!agent) throw new Error("Unauthorized or Agent not found");

    // Use snake_case for system_prompt to match the DB schema
    const messages: AIMessage[] = [
      { role: "system", content: agent.configuration?.system_prompt || "You are a helpful assistant." },
      { role: "user", content: message }
    ];

    const result = await openaiChat(agent.configuration?.model || "gpt-4o-mini", messages);
    return { ...result, agentName: agent.name };
  };

  /**
   * CHAT WITH AGENT (Streaming)
   */
  chatWithAgent = async (
    agentId: string,
    userId: string,
    message: string,
    conversationId: string | null,
    res: Response,
    skipUserMessage?: boolean
  ) => {
    try {
      const agent = await this.getAgentById(agentId, userId);
      if (!agent) throw new Error("Agent not found");

      const systemPrompt = agent.configuration?.system_prompt || "You are a helpful assistant.";
      const model = agent.configuration?.model || "gpt-4o-mini";

      let convId = conversationId;
      if (convId) {
        // Check if conversation exists (don't filter by user_id for shared agents)
        const { data: conv, error } = await supabase
          .from('conversations')
          .select('id')
          .eq('id', convId)
          .single();
        
        if (error || !conv) convId = null;
      }

      if (!convId) {
        convId = crypto.randomUUID();
        const { error: insertError } = await supabase
          .from('conversations')
          .insert({
            id: convId,
            user_id: userId,
            agent_id: agentId,
            title: agent.name || "New Conversation",
          });
        
        if (insertError) throw insertError;
      }

      // 3️⃣ Load history (limit last 14 messages)
      const { data: historyRows, error: histError } = await supabase
        .from('messages')
        .select('id, role, content')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });
      
      if (histError) throw histError;

      const history = historyRows
        .map((m: any) => ({
          role: m.role,
          content: m.content,
        }))
        .slice(-14);

      // 4️⃣ Save user message (only if not already created)
      let userMessageId: string;
      if (skipUserMessage) {
        // Message already exists, find the last user message
        const lastUserMsg = historyRows?.filter((m: any) => m.role === 'user').pop();
        userMessageId = lastUserMsg?.id || crypto.randomUUID();
      } else {
        userMessageId = crypto.randomUUID();
        const { error: msgError } = await supabase
          .from('messages')
          .insert({
            id: userMessageId,
            conversation_id: convId,
            role: "user",
            content: message,
          });
        
        if (msgError) throw msgError;
      }

      // 4.5️⃣ Check for attachments in the last user message and build vision-compatible message
      const lastUserMessage = historyRows[historyRows.length - 1];
      let lastMessageWithAttachments: any = { role: "user", content: message };
      
      if (lastUserMessage && lastUserMessage.role === 'user') {
        // Check for attachments
        const { data: attachments, error: attError } = await supabase
          .from('message_attachments')
          .select('file_name, original_file_name, file_type, file_path')
          .eq('message_id', lastUserMessage.id)
          .order('uploaded_at', { ascending: true });
        
        if (attError) logger.warn('Failed to load attachments', attError);

        if (attachments && attachments.length > 0) {
          // Build content array for vision models
          const contentParts: any[] = [{ type: "text", text: lastUserMessage.content }];
          
          for (const attachment of attachments) {
            if (attachment.fileType.startsWith('image/')) {
              // Read image file and convert to base64
              try {
                const imageBuffer = fs.readFileSync(attachment.filePath);
                const base64Image = imageBuffer.toString('base64');
                const dataUrl = `data:${attachment.fileType};base64,${base64Image}`;
                
                contentParts.push({
                  type: "image_url",
                  image_url: { url: dataUrl }
                });
              } catch (err) {
                logger.warn(`Failed to read image file: ${attachment.filePath}`, err);
              }
            }
          }
          
          if (contentParts.length > 1) {
            // Update the last message in history to include images
            history[history.length - 1] = {
              role: "user",
              content: contentParts
            };
          }
        }
      }

      // 5️⃣ SSE init
      res.write(
        `event: meta\ndata: ${JSON.stringify({ conversationId: convId })}\n\n`
      );
      res.write(`event: init\ndata: "connected"\n\n`);

      // 6️⃣ Build OpenAI messages format
      const messagesForModel = [
        { role: "system", content: systemPrompt },
        ...history.map(m => ({ role: m.role as any, content: m.content })),
        { role: "user", content: message },
      ];

      let assistantText = "";
      const startTime = Date.now();
      const stream = openaiStream(model, messagesForModel);

      for await (const token of stream) {
        assistantText += token;
        res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
      }

      if (!assistantText.trim()) {
        res.write(`event: error\ndata: "Model returned no content."\n\n`);
        return res.end();
      }

      // 8️⃣ Save assistant response
      const { error: saveError } = await supabase
        .from('messages')
        .insert({
          id: crypto.randomUUID(),
          conversation_id: convId,
          role: "assistant",
          content: assistantText,
        });
      
      if (saveError) logger.error('Failed to save assistant message', saveError);

      res.write(`event: done\ndata: ${JSON.stringify({ conversationId: convId })}\n\n`);
      res.end();

      // 10. UPDATE METRICS
      const endTime = Date.now();
      const responseTimeMs = endTime - startTime;

      // Dummy data for now
      const metricsData = {
        success: true,
        responseTimeMs,
        inputTokens: 0, // Replace with actual token counts
        outputTokens: 0,
        costUSD: 0,
      };

      try {
        await this.updateAgentMetrics(agentId, metricsData);
        
        // Update lastActive timestamp
        await supabase
          .from('agents')
          .update({ last_active: new Date().toISOString() })
          .eq('id', agentId);
      } catch (metricsError) {
        logger.error("Failed to update metrics", metricsError);
      }

    } catch (error) {
      logger.error("chatWithAgent ERROR", error);
      if (!res.headersSent) res.status(500).json({ success: false, error: "Chat failed" });
      res.end();
    }
  };

  // ---------------------------------------------------
  // UPDATE AGENT METRICS
  // ---------------------------------------------------
  async updateAgentMetrics(agentId: string, data: {
    success: boolean;
    responseTimeMs: number;
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
  }) {
    const { success, responseTimeMs, inputTokens, outputTokens, costUSD } = data;

    // Get current metrics
    const { data: agent } = await supabase
      .from('agents')
      .select('metrics')
      .eq('id', agentId)
      .single();
    
    const currentMetrics = agent?.metrics || {};
    const totalInteractions = (currentMetrics.totalInteractions || 0) + 1;
    const avgResponseTime = (
      ((currentMetrics.avgResponseTime || 0) * (totalInteractions - 1) + responseTimeMs) /
      totalInteractions
    );
    const successRate = (
      ((currentMetrics.successRate || 0) / 100 * (totalInteractions - 1) + (success ? 1 : 0)) /
      totalInteractions
    ) * 100;
    const totalTokens = (currentMetrics.totalTokens || 0) + inputTokens + outputTokens;
    const llmCostUSD = (currentMetrics.llmCostUSD || 0) + costUSD;

    await supabase
      .from('agents')
      .update({
        metrics: {
          totalInteractions,
          avgResponseTime,
          successRate,
          totalTokens,
          llmCostUSD,
        },
      })
      .eq('id', agentId);
  }

  // ---------------------------------------------------
  // GET ALL AGENTS
  // ---------------------------------------------------

  async getAllAgents(userId: string) {
    // Query agents owned by user ONLY
    const { data: ownedAgents, error: ownedError } = await supabase
      .from('agents')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false);
    
    if (ownedError) throw ownedError;

    const rows = (ownedAgents || []).sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Get real-time metrics for each agent
    const agentIds = rows?.map((a: any) => a.id) || [];
    
    let interactionMap: { [key: string]: number } = {};
    let successRateMap: { [key: string]: number } = {};
    
    if (agentIds.length > 0) {
      // Get interaction counts from messages
      const { data: messageCounts } = await supabase
        .from('messages')
        .select('conversations!inner(agent_id)')
        .in('conversations.agent_id', agentIds);

      messageCounts?.forEach((msg: any) => {
        const agentId = msg.conversations.agent_id;
        interactionMap[agentId] = (interactionMap[agentId] || 0) + 1;
      });

      // Get success rates from feedback
      const { data: feedbackData } = await supabase
        .from('messages')
        .select('feedback, conversations!inner(agent_id)')
        .in('conversations.agent_id', agentIds)
        .in('feedback', [1, -1]);

      const feedbackByAgent: { [key: string]: { positive: number; negative: number } } = {};
      feedbackData?.forEach((msg: any) => {
        const agentId = msg.conversations.agent_id;
        if (!feedbackByAgent[agentId]) {
          feedbackByAgent[agentId] = { positive: 0, negative: 0 };
        }
        if (msg.feedback === 1) feedbackByAgent[agentId].positive++;
        if (msg.feedback === -1) feedbackByAgent[agentId].negative++;
      });

      Object.keys(feedbackByAgent).forEach(agentId => {
        const { positive, negative } = feedbackByAgent[agentId];
        const total = positive + negative;
        successRateMap[agentId] = total > 0 ? Math.round((positive / total) * 100) : 0;
      });
    }

    return rows?.map((a: any) => {
      const parsedMetrics = this.parseMetrics(a.metrics);
      return {
        ...a,
        isOwner: a.user_id === userId ? 1 : 0,
        capabilities: this.parseCapabilities(a.capabilities),
        configuration: this.parseConfig(a.configuration),
        metrics: {
          ...parsedMetrics,
          totalInteractions: interactionMap[a.id] ?? 0,
          successRate: successRateMap[a.id] ?? 0,
        },
      };
    }) || [];
  }

  // ---------------------------------------------------
  // GET AGENT BY ID
  // ---------------------------------------------------

  async getAgentById(agentId: string, userId: string) {
    // Try to get agent if owned by user
    const { data: ownedAgent, error: ownedError } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .maybeSingle();
    
    if (ownedError) throw ownedError;
    if (ownedAgent) {
      return {
        ...ownedAgent,
        isOwner: 1,
        capabilities: this.parseCapabilities(ownedAgent.capabilities),
        configuration: this.parseConfig(ownedAgent.configuration),
        metrics: this.parseMetrics(ownedAgent.metrics),
      };
    }

    // Check if user has shared access
    const { data: access, error: accessError } = await supabase
      .from('resource_access')
      .select('resource_id')
      .eq('resource_id', agentId)
      .eq('resource_type', 'agent')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (accessError) throw accessError;
    
    if (access) {
      const { data: sharedAgent, error: sharedError } = await supabase
        .from('agents')
        .select('*')
        .eq('id', agentId)
        .eq('is_deleted', false)
        .single();
      
      if (sharedError) throw sharedError;
      
      return {
        ...sharedAgent,
        isOwner: 0,
        capabilities: this.parseCapabilities(sharedAgent.capabilities),
        configuration: this.parseConfig(sharedAgent.configuration),
        metrics: this.parseMetrics(sharedAgent.metrics),
      };
    }

    return null;
  }

  // ---------------------------------------------------
  // CREATE AGENT
  // ---------------------------------------------------

  async createAgent(userId: string, data: any) {
    const id = crypto.randomUUID();

    const capabilities = data.capabilities || [];
    const configuration =
      typeof data.configuration === "string"
        ? JSON.parse(data.configuration)
        : (data.configuration || {});

    const metrics = {
      totalInteractions: 0,
      successRate: 0,
      avgResponseTime: 0,
    };

    const { data: inserted, error } = await supabase
      .from('agents')
      .insert({
        id,
        user_id: userId,
        name: data.name,
        description: data.description,
        type: data.type || "GENERAL",
        status: data.status || "ACTIVE",
        capabilities,
        configuration,
        metrics,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      ...inserted,
      capabilities: this.parseCapabilities(inserted.capabilities),
      configuration: this.parseConfig(inserted.configuration),
      metrics: this.parseMetrics(inserted.metrics),
    };
  }

  // ---------------------------------------------------
  // UPDATE AGENT
  // ---------------------------------------------------

  async updateAgent(agentId: string, userId: string, data: any) {
    const existing = await this.getAgentById(agentId, userId);
    if (!existing) return null;

    const capabilities = data.capabilities ?? existing.capabilities;
    const configuration =
      typeof data.configuration === "string"
        ? JSON.parse(data.configuration)
        : (data.configuration ?? existing.configuration);

    const { data: updated, error } = await supabase
      .from('agents')
      .update({
        name: data.name ?? existing.name,
        description: data.description ?? existing.description,
        type: data.type ?? existing.type,
        status: data.status ?? existing.status,
        capabilities,
        configuration,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agentId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return {
      ...updated,
      capabilities: this.parseCapabilities(updated.capabilities),
      configuration: this.parseConfig(updated.configuration),
      metrics: this.parseMetrics(updated.metrics),
    };
  }

  // ---------------------------------------------------
  // DELETE AGENT
  // ---------------------------------------------------

  async deleteAgent(agentId: string, userId: string) {
    const { data, error } = await supabase
      .from('agents')
      .update({ is_deleted: true })
      .eq('id', agentId)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) return null;
    return data;
  }
}

export const agentService = new AgentService();