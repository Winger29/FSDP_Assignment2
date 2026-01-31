// src/controllers/agentCrossReplyController.ts
import { Request, Response } from "express";
import { agentCrossReplyService } from "../services/agentCrossReplyService";
import { logger } from "../utils/logger";

class AgentCrossReplyController {
  /**
   * POST /api/cross-replies
   * Create a cross-agent reply session
   * Takes a message the user liked and wants other agents to answer
   */
  async createCrossReply(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const {
        originalMessageId,
        originalAgentId,
        originalConversationId,
        title,
        questionContent,
      } = req.body;

      if (
        !originalMessageId ||
        !originalAgentId ||
        !originalConversationId ||
        !questionContent
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Missing required fields: originalMessageId, originalAgentId, originalConversationId, questionContent",
        });
      }

      const crossReplyId = await agentCrossReplyService.createCrossReply(
        userId,
        {
          originalMessageId,
          originalAgentId,
          originalConversationId,
          title: title || "Cross-Agent Reply",
          questionContent,
        }
      );

      res.status(201).json({
        success: true,
        data: { id: crossReplyId },
        message: "Cross-reply session created successfully",
      });
    } catch (error) {
      logger.error("Create cross-reply error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to create cross-reply" });
    }
  }

  /**
   * GET /api/cross-replies
   * Get all cross-reply sessions for the user
   */
  async getAllCrossReplies(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const crossReplies =
        await agentCrossReplyService.getCrossRepliesByUser(userId);

      res.json({ success: true, data: crossReplies });
    } catch (error) {
      logger.error("Get cross-replies error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch cross-replies" });
    }
  }

  /**
   * GET /api/cross-replies/:crossReplyId
   * Get a specific cross-reply session with all responses
   */
  async getCrossReplyById(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const { crossReplyId } = req.params;
      const crossReply = await agentCrossReplyService.getCrossReplyById(
        crossReplyId,
        userId
      );

      if (!crossReply) {
        return res.status(404).json({
          success: false,
          error: "Cross-reply session not found",
        });
      }

      res.json({ success: true, data: crossReply });
    } catch (error) {
      logger.error("Get cross-reply error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch cross-reply" });
    }
  }

  /**
   * POST /api/cross-replies/:crossReplyId/responses
   * Add an agent's response to the cross-reply session
   * This is called after an agent has answered the question
   */
  async addAgentResponse(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const { crossReplyId } = req.params;
      const { agentId, conversationId, responseMessageId } = req.body;

      if (!agentId || !conversationId || !responseMessageId) {
        return res.status(400).json({
          success: false,
          error:
            "Missing required fields: agentId, conversationId, responseMessageId",
        });
      }

      // Verify that the cross-reply belongs to this user
      const crossReply = await agentCrossReplyService.getCrossReplyById(
        crossReplyId,
        userId
      );
      if (!crossReply) {
        return res.status(404).json({
          success: false,
          error: "Cross-reply session not found",
        });
      }

      const response = await agentCrossReplyService.addAgentResponse(
        crossReplyId,
        agentId,
        conversationId,
        responseMessageId
      );

      res.status(201).json({
        success: true,
        data: response,
        message: "Agent response added successfully",
      });
    } catch (error) {
      logger.error("Add agent response error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to add agent response" });
    }
  }

  /**
   * DELETE /api/cross-replies/:crossReplyId
   * Delete a cross-reply session
   */
  async deleteCrossReply(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const { crossReplyId } = req.params;

      const deleted = await agentCrossReplyService.deleteCrossReply(
        crossReplyId,
        userId
      );

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: "Cross-reply session not found",
        });
      }

      res.json({
        success: true,
        message: "Cross-reply session deleted successfully",
      });
    } catch (error) {
      logger.error("Delete cross-reply error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to delete cross-reply" });
    }
  }
}

export const agentCrossReplyController = new AgentCrossReplyController();
