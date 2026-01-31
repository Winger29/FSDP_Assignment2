// src/services/agentCrossReplyService.ts
import { supabase } from "../config/database";
import { logger } from "../utils/logger";

interface CrossReplyData {
  originalMessageId: string;
  originalAgentId: string;
  originalConversationId: string;
  title: string;
  questionContent: string;
}

interface CrossReplyWithResponses extends CrossReplyData {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  responses: Array<{
    id: string;
    agentId: string;
    agentName: string;
    conversationId: string;
    responseMessageId: string;
    responseContent: string;
    createdAt: string;
  }>;
}

class AgentCrossReplyService {
  /**
   * Create a cross-agent reply session
   * User likes a response from Agent A and wants other agents to answer the same question
   */
  createCrossReply = async (
    userId: string,
    data: CrossReplyData
  ): Promise<string> => {
    try {
      const { data: crossReply, error } = await supabase
        .from("cross_agent_replies")
        .insert({
          user_id: userId,
          original_message_id: data.originalMessageId,
          original_agent_id: data.originalAgentId,
          original_conversation_id: data.originalConversationId,
          title: data.title,
          question_content: data.questionContent,
        })
        .select("id")
        .single();

      if (error) throw error;
      return crossReply.id;
    } catch (error) {
      logger.error("Error creating cross-reply:", error);
      throw error;
    }
  };

  /**
   * Get all cross-agent reply sessions for a user
   */
  getCrossRepliesByUser = async (userId: string) => {
    try {
      const { data: crossReplies, error } = await supabase
        .from("cross_agent_replies")
        .select(
          `
          id,
          user_id,
          original_message_id,
          original_agent_id,
          original_conversation_id,
          title,
          question_content,
          created_at,
          updated_at
        `
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // For each cross-reply, fetch the responses
      const crossRepliesWithResponses = await Promise.all(
          (crossReplies || []).map(async (cr: any) => {
            const { data: responses, error: respError } = await supabase
              .from("cross_agent_responses")
              .select(
                `
              id,
              agent_id,
              conversation_id,
              response_message_id,
              created_at,
              agents (name),
              messages (content)
            `
              )
              .eq("cross_reply_id", cr.id)
              .order("created_at", { ascending: true });

            if (respError) {
              logger.error("Error fetching responses:", respError);
              return { ...cr, responses: [] };
            }

            return {
              ...cr,
              responses: (responses || []).map((r: any) => ({
                id: r.id,
                agentId: r.agent_id,
                agentName: r.agents?.name || "Unknown Agent",
                conversationId: r.conversation_id,
                responseMessageId: r.response_message_id,
                responseContent: r.messages?.content || "",
                createdAt: r.created_at,
              })),
            };
          })
        );

      return crossRepliesWithResponses;
    } catch (error) {
      logger.error("Error fetching cross-replies:", error);
      throw error;
    }
  };

  /**
   * Get a specific cross-reply session with all its responses
   */
  getCrossReplyById = async (crossReplyId: string, userId: string) => {
    try {
      const { data: crossReply, error: crError } = await supabase
        .from("cross_agent_replies")
        .select(
          `
          id,
          user_id,
          original_message_id,
          original_agent_id,
          original_conversation_id,
          title,
          question_content,
          created_at,
          updated_at
        `
        )
        .eq("id", crossReplyId)
        .eq("user_id", userId)
        .single();

      if (crError || !crossReply) {
        return null;
      }

      const { data: responses, error: respError } = await supabase
        .from("cross_agent_responses")
        .select(
          `
          id,
          agent_id,
          conversation_id,
          response_message_id,
          created_at,
          agents (name),
          messages (content)
        `
        )
        .eq("cross_reply_id", crossReplyId)
        .order("created_at", { ascending: true });

      if (respError) {
        logger.error("Error fetching responses:", respError);
        return { ...crossReply, responses: [] };
      }

      return {
        ...crossReply,
        responses: (responses || []).map((r: any) => ({
          id: r.id,
          agentId: r.agent_id,
          agentName: r.agents?.name || "Unknown Agent",
          conversationId: r.conversation_id,
          responseMessageId: r.response_message_id,
          responseContent: r.messages?.content || "",
          createdAt: r.created_at,
        })),
      };
    } catch (error) {
      logger.error("Error fetching cross-reply by ID:", error);
      throw error;
    }
  };

  /**
   * Add a response from another agent to the cross-reply session
   */
  addAgentResponse = async (
    crossReplyId: string,
    agentId: string,
    conversationId: string,
    responseMessageId: string
  ) => {
    try {
      const { data, error } = await supabase
        .from("cross_agent_responses")
        .insert({
          cross_reply_id: crossReplyId,
          agent_id: agentId,
          conversation_id: conversationId,
          response_message_id: responseMessageId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error("Error adding agent response:", error);
      throw error;
    }
  };

  /**
   * Delete a cross-reply session
   */
  deleteCrossReply = async (crossReplyId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from("cross_agent_replies")
        .delete()
        .eq("id", crossReplyId)
        .eq("user_id", userId);

      if (error) throw error;
      return true;
    } catch (error) {
      logger.error("Error deleting cross-reply:", error);
      throw error;
    }
  };
}

export const agentCrossReplyService = new AgentCrossReplyService();
