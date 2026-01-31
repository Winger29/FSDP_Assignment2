import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import api from "./api";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;
export const supabase = createClient(supabaseUrl, supabaseKey);

export type Message = {
  conv_id: number;      
  group_id: number;
  user_id: string;
  message: string;
  created_at: string;
};

export const messageService = {
  async getMessages(groupId: number): Promise<Message[]> {
    const res = await api.get(`/group/${groupId}/messages`);
    return res.data.messages;
  },

  async sendMessage(groupId: number, content: string): Promise<Message> {
    const res = await api.post(`/group/${groupId}/messages`, { content, group_id: groupId });
    return res.data.message;
  },

  subscribeToMessages(
    groupId: number,
    callback: (msg: Message) => void
  ): RealtimeChannel {
    const channel = supabase
      .channel(`group_messages_${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          callback(payload.new as Message);
        }
      )
      .subscribe();

    return channel;
  },

  unsubscribe(channel: RealtimeChannel) {
    supabase.removeChannel(channel);
  },
};

