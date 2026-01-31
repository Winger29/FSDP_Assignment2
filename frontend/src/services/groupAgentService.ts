import api from "./api";

export type Agent = {
  id: string;
  name: string;
  description?: string;
};

export type AgentMessage = {
  user_id: string;
  role: "user" | "agent" | "assistant";
  content: string;
};

export const groupAgentService = {
  async getAgents(): Promise<Agent[]> {
    try {
      const res = await api.get("/agents"); 
      if (res.data?.success) return res.data.data;
      return [];
    } catch (err) {
      console.error("Failed to fetch agents", err);
      return [];
    }
  },

  async addAgentToGroup(agent_id: string, group_id: number): Promise<any> {
    try {
      const res = await api.post("/group/addAgent", { agent_id, group_id });
      return res.data;
    } catch (err) {
      console.error("Failed to add agent to group", err);
      throw err;
    }
  },

  async sendUserMessageToAgent(
    agentId: string,
    groupId: number,
    userId: string,
    message: string
  ): Promise<any> {
    try {
      const res = await api.post("/group-agent/send", {
        agentId,
        groupId,
        userId,
        message,
      });
      return res.data;
    } catch (err) {
      console.error("Failed to send message to agent", err);
      throw err;
    }
  },

  async chatWithAgentInGroup(
    agentId: string,
    groupId: number,
    userId: string,
    message: string,
    onToken: (token: string) => void
  ): Promise<void> {
    try {
      const res = await api.post(`/group-agent/chat`, {
        agentId,
        groupId,
        userId,
        message,
      }, {
        responseType: "stream", 
      });

      if (!res.data) throw new Error("No response body");

      const reader = res.data.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunk = decoder.decode(value);

        // parse SSE format: "event: token\ndata: {...}\n\n"
        const matches = chunk.matchAll(/event: token\ndata: (.+?)\n\n/g);
        for (const match of matches) {
          const data = JSON.parse(match[1]);
          onToken(data.token);
        }
      }
    } catch (err) {
      console.error("Failed to chat with agent", err);
      throw err;
    }
  },

  async getAgentHistory(agentId: string, groupId: number): Promise<AgentMessage[]> {
    try {
      const res = await api.get(`/group-agent/history`, {
        params: { agentId, groupId },
      });
      return res.data?.history ?? [];
    } catch (err) {
      console.error("Failed to fetch agent history", err);
      return [];
    }
  },
};
