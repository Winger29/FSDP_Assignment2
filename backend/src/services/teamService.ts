// src/services/teamService.ts

import { db, supabase } from "../config/database";
import { logger } from "../utils/logger";
import crypto from "crypto";

interface Team {
  id: string;
  name: string;
  description: string;
  userId: string;
  objective: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  members?: TeamMember[];
}

interface TeamMember {
  id: string;
  teamId: string;
  agentId: string;
  role: string;
  isPrimaryAgent: boolean;
  addedAt: string;
  agent?: any;
}

class TeamService {
  /**
   * Create a new team
   */
  async createTeam(
    userId: string,
    data: {
      name: string;
      description?: string;
      objective?: string;
      members: Array<{ agentId: string; role: string; isPrimaryAgent?: boolean }>;
    }
  ): Promise<Team> {
    try {
      const teamId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Create team
      const { error: insertError } = await supabase
        .from('teams')
        .insert({
          id: teamId,
          name: data.name,
          description: data.description || "",
          user_id: userId,
          objective: data.objective || "",
          status: "ACTIVE",
          created_at: now,
          updated_at: now,
        });

      if (insertError) throw insertError;

      // Add team members
      for (const member of data.members) {
        const { error: memberError } = await supabase
          .from('team_members')
          .insert({
            id: crypto.randomUUID(),
            team_id: teamId,
            agent_id: member.agentId,
            role: member.role,
            is_primary_agent: member.isPrimaryAgent || false,
            added_at: now,
          });

        if (memberError) throw memberError;
      }

      logger.info(`Team created: ${teamId}`);
      return await this.getTeamById(teamId, userId);
    } catch (error) {
      logger.error("Create team error:", error);
      throw error;
    }
  }

  /**
   * Get all teams for a user
   */
  async getTeamsByUser(userId: string): Promise<Team[]> {
    try {
      const { data: teams, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false });

      if (teamError) throw teamError;

      // Load members for each team
      for (const team of teams) {
        team.members = await this.getTeamMembers(team.id);
      }

      return teams;
    } catch (error) {
      logger.error("Get teams error:", error);
      throw error;
    }
  }

  /**
   * Get team by ID
   */
  async getTeamById(teamId: string, userId: string): Promise<Team> {
    try {
      const { data: teams, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId);

      if (teamError) throw teamError;

      if (!teams || teams.length === 0) {
        throw new Error("Team not found");
      }

      const team = teams[0];

      // Check if user has access (either owns the team OR has shared access)
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

      team.members = await this.getTeamMembers(teamId);

      return team;
    } catch (error) {
      logger.error("Get team error:", error);
      throw error;
    }
  }

  /**
   * Get team members with agent details
   */
  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    try {
      const { data: members, error: memberError } = await supabase
        .from('team_members')
        .select(`
          *,
          agents!team_members_agent_id_fkey (
            name,
            type,
            status,
            avatar
          )
        `)
        .eq('team_id', teamId)
        .order('is_primary_agent', { ascending: false })
        .order('added_at', { ascending: true });

      if (memberError) throw memberError;

      return (members || []).map((m: any) => ({
        id: m.id,
        teamId: m.team_id,
        agentId: m.agent_id,
        role: m.role,
        isPrimaryAgent: m.is_primary_agent,
        addedAt: m.added_at,
        agent: {
          id: m.agent_id,
          name: m.agents?.name,
          type: m.agents?.type,
          status: m.agents?.status,
          avatar: m.agents?.avatar,
        },
      }));
    } catch (error) {
      logger.error("Get team members error:", error);
      throw error;
    }
  }

  /**
   * Update team
   */
  async updateTeam(
    teamId: string,
    userId: string,
    data: {
      name?: string;
      description?: string;
      objective?: string;
      status?: string;
    }
  ): Promise<Team> {
    try {
      const updates: any = { updated_at: new Date().toISOString() };

      if (data.name !== undefined) updates.name = data.name;
      if (data.description !== undefined) updates.description = data.description;
      if (data.objective !== undefined) updates.objective = data.objective;
      if (data.status !== undefined) updates.status = data.status;

      const { error: updateError } = await supabase
        .from('teams')
        .update(updates)
        .eq('id', teamId)
        .eq('user_id', userId);

      if (updateError) throw updateError;

      return await this.getTeamById(teamId, userId);
    } catch (error) {
      logger.error("Update team error:", error);
      throw error;
    }
  }

  /**
   * Add member to team
   */
  async addTeamMember(
    teamId: string,
    userId: string,
    data: { agentId: string; role: string; isPrimaryAgent?: boolean }
  ): Promise<void> {
    try {
      // Verify team ownership
      await this.getTeamById(teamId, userId);

      const { error: insertError } = await supabase
        .from('team_members')
        .insert({
          id: crypto.randomUUID(),
          team_id: teamId,
          agent_id: data.agentId,
          role: data.role,
          is_primary_agent: data.isPrimaryAgent || false,
          added_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;

      logger.info(`Member added to team: ${teamId}`);
    } catch (error) {
      logger.error("Add team member error:", error);
      throw error;
    }
  }

  /**
   * Remove member from team
   */
  async removeTeamMember(teamId: string, userId: string, memberId: string): Promise<void> {
    try {
      // Verify team ownership
      await this.getTeamById(teamId, userId);

      const { error: deleteError } = await supabase
        .from('team_members')
        .delete()
        .eq('id', memberId)
        .eq('team_id', teamId);

      if (deleteError) throw deleteError;

      logger.info(`Member removed from team: ${teamId}`);
    } catch (error) {
      logger.error("Remove team member error:", error);
      throw error;
    }
  }

  /**
   * Delete team
   */
  async deleteTeam(teamId: string, userId: string): Promise<void> {
    try {
      const { error: updateError } = await supabase
        .from('teams')
        .update({ status: 'ARCHIVED' })
        .eq('id', teamId)
        .eq('user_id', userId);

      if (updateError) throw updateError;

      logger.info(`Team archived: ${teamId}`);
    } catch (error) {
      logger.error("Delete team error:", error);
      throw error;
    }
  }
}

export const teamService = new TeamService();
