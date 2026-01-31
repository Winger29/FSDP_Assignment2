// src/services/savedResponseService.ts
import { supabase } from '../config/database';
import { logger } from '../utils/logger';

interface SavedResponse {
  id: string;
  user_id: string;
  original_agent_id: string;
  original_conversation_id: string;
  original_message_id: string;
  original_response: string;
  target_agent_id: string;
  question_text: string;
  created_at: string;
  updated_at: string;
}

interface SaveResponseData {
  originalAgentId: string;
  originalConversationId: string;
  originalMessageId: string;
  originalResponse: string;
  targetAgentId: string;
  questionText: string;
}

class SavedResponseService {
  /**
   * Save a response from one agent to send to another agent
   */
  async saveResponse(userId: string, data: SaveResponseData): Promise<string> {
    try {
      const { data: savedResponse, error } = await supabase
        .from('saved_responses')
        .insert({
          user_id: userId,
          original_agent_id: data.originalAgentId,
          original_conversation_id: data.originalConversationId,
          original_message_id: data.originalMessageId,
          original_response: data.originalResponse,
          target_agent_id: data.targetAgentId,
          question_text: data.questionText,
        })
        .select('id')
        .single();

      if (error) throw error;
      
      logger.info('Response saved successfully:', { id: savedResponse.id });
      return savedResponse.id;
    } catch (error) {
      logger.error('Error saving response:', error);
      throw error;
    }
  }

  /**
   * Get all saved responses for a user
   */
  async getSavedResponsesByUser(userId: string): Promise<SavedResponse[]> {
    try {
      const { data: responses, error } = await supabase
        .from('saved_responses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return responses || [];
    } catch (error) {
      logger.error('Error fetching saved responses:', error);
      throw error;
    }
  }

  /**
   * Get saved responses for a specific target agent
   */
  async getSavedResponsesByTargetAgent(
    userId: string,
    targetAgentId: string
  ): Promise<SavedResponse[]> {
    try {
      const { data: responses, error } = await supabase
        .from('saved_responses')
        .select('*')
        .eq('user_id', userId)
        .eq('target_agent_id', targetAgentId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return responses || [];
    } catch (error) {
      logger.error('Error fetching saved responses by target agent:', error);
      throw error;
    }
  }

  /**
   * Get a specific saved response
   */
  async getSavedResponse(userId: string, responseId: string): Promise<SavedResponse | null> {
    try {
      const { data: response, error } = await supabase
        .from('saved_responses')
        .select('*')
        .eq('id', responseId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found
          return null;
        }
        throw error;
      }

      return response;
    } catch (error) {
      logger.error('Error fetching saved response:', error);
      throw error;
    }
  }

  /**
   * Delete a saved response
   */
  async deleteSavedResponse(userId: string, responseId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('saved_responses')
        .delete()
        .eq('id', responseId)
        .eq('user_id', userId);

      if (error) throw error;
      
      logger.info('Saved response deleted successfully:', { id: responseId });
      return true;
    } catch (error) {
      logger.error('Error deleting saved response:', error);
      throw error;
    }
  }

  /**
   * Update the target agent for a saved response (for retrying with different agent)
   */
  async updateTargetAgent(
    userId: string,
    responseId: string,
    newTargetAgentId: string
  ): Promise<SavedResponse> {
    try {
      const { data: updated, error } = await supabase
        .from('saved_responses')
        .update({
          target_agent_id: newTargetAgentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', responseId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return updated;
    } catch (error) {
      logger.error('Error updating target agent:', error);
      throw error;
    }
  }
}

export const savedResponseService = new SavedResponseService();
