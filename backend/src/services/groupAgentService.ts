import { supabase } from "../config/supabase";
import { openaiStream, AIMessage } from "./openaiService";
import { logger } from "../utils/logger";

export class GroupAgentService {
  async chatWithAgentInGroup(
    agentId: string,
    groupId: number,
    userId: string,
    userMessage: string,
    onToken: (token: string) => void
  ) {
    try {
      const { data: agent, error: agentErr } = await supabase
        .from("agents")
        .select("*")
        .eq("id", agentId)
        .single();

      if (agentErr || !agent) throw new Error("Agent not found");

      const systemPrompt =
        agent.configuration?.system_prompt ?? "You are a helpful assistant.";
      const model = agent.configuration?.model ?? "gpt-4o-mini";

      await supabase.from("group_messages").insert({
        group_id: groupId,
        user_id: userId,
        role: "agent",
        content: userMessage
      });

      const { data: userMessages } = await supabase
        .from("group_messages")
        .select("content")
        .eq("group_id", groupId)
        .eq("role", "agent") 
        .order("created_at", { ascending: true })
        .limit(14);

      const { data: aiReplies } = await supabase
        .from("groupAgent_messages")
        .select("message")
        .eq("group_id", groupId)
        .eq("agent_id", agentId)
        .order("created_at", { ascending: true })
        .limit(14);

      const history: AIMessage[] = [
        { role: "system", content: systemPrompt },
        ...(userMessages || []).map(m => ({ role: "user" as const, content: m.content } as AIMessage)),
        ...(aiReplies || []).map(m => ({ role: "assistant" as const, content: m.message } as AIMessage))
      ];

      let assistantText = "";
      const stream = openaiStream(model, [...history, { role: "user", content: userMessage }]);

      for await (const token of stream) {
        assistantText += token;
        onToken(token); 
      }

      await supabase.from("groupAgent_messages").insert({
        group_id: groupId,
        agent_id: agentId,
        message: assistantText
      });

      return assistantText;
    } catch (err) {
      logger.error("chatWithAgentInGroup ERROR", err);
      throw err;
    }
  }

    async sendUserMessageToAgent(
    agentId: string,
    groupId: number,
    userId: string,
    message: string
  ) {
    const { error } = await supabase.from("group_messages").insert({
      group_id: groupId,
      user_id: userId,
      role: "agent", // <-- marks this message as for the agent
      content: message
    });

    if (error) throw error;
  }

    async getAgentHistory(agentId: string, groupId: number) {
    const { data, error } = await supabase
      .from("groupAgent_messages")
      .select("*")
      .eq("agent_id", agentId)
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
    }
}

export const groupAgentService = new GroupAgentService();

