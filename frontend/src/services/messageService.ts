import api from "./api";

export type Message = {
  conv_id: string;      
  group_id: number;     
  user_id: string;
  message: string;
  created_at: string;
  role?: "user" | "agent" | "assistant"; 
};


export const messageService = {
  async getMessages(groupId: string): Promise<Message[]> {
    const res = await api.get(`/groups/${groupId}/messages`);
    return res.data.messages;
  },

  async sendMessage(payload: {
    group_id: string;
    content: string;
  }) {
    await api.post("/messages", payload);
  },
};
