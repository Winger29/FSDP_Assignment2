// src/controllers/groupAgentController.ts
import { Request, Response } from "express";
import { groupAgentService } from "../services/groupAgentService";


export const chatWithAgent = async (req: Request, res: Response) => {
  const { agentId, groupId, userId, message } = req.body;

  if (!agentId || !groupId || !userId || !message) {
    return res.status(400).json({ success: false, error: "Missing parameters" });
  }

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const onToken = (token: string) => {
      res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
    };

    const reply = await groupAgentService.chatWithAgentInGroup(agentId, groupId, userId, message, onToken);

    res.write(`event: done\ndata: ${JSON.stringify({ reply })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error("chatWithAgent ERROR", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message || "Chat failed" });
    } else {
      res.end();
    }
  }
};


export const sendUserMessageToAgent = async (req: Request, res: Response) => {
  const { agentId, groupId, userId, message } = req.body;

  if (!agentId || !groupId || !userId || !message) {
    return res.status(400).json({ success: false, error: "Missing parameters" });
  }

  try {
    await groupAgentService.sendUserMessageToAgent(agentId, groupId, userId, message);
    res.json({ success: true });
  } catch (err: any) {
    console.error("sendUserMessageToAgent ERROR", err);
    res.status(500).json({ success: false, error: err.message || "Failed to send message" });
  }
};


export const getAgentHistory = async (req: Request, res: Response) => {
  const { agentId, groupId } = req.query;

  if (!agentId || !groupId) {
    return res.status(400).json({ success: false, error: "Missing parameters" });
  }

  try {
    const history = await groupAgentService.getAgentHistory(agentId as string, Number(groupId));
    res.json({ success: true, history });
  } catch (err: any) {
    console.error("getAgentHistory ERROR", err);
    res.status(500).json({ success: false, error: err.message || "Failed to fetch history" });
  }
};
