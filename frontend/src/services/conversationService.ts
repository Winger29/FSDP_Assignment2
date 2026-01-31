import api from './api';

export async function recordFeedback(messageId: string, feedback: 'like' | 'dislike'): Promise<{ feedback: number }> {
    const response = await api.post('/conversations/feedback', { messageId, feedback });
    return response.data.data;
}

export async function getLatestConversation(agentId: string): Promise<any> {
    try {
        const response = await api.get(`/conversations/latest/${agentId}`);
        // Backend returns { success: true, data: { id, messages[], ... } }
        const conv = response.data?.data;
        if (!conv || !conv.id) {
            console.log('No latest conversation found for agent:', agentId);
            return null;
        }
        return conv;
    } catch (err) {
        console.log('No latest conversation found for agent:', agentId);
        return null;
    }
}

export const conversationService = {
    recordFeedback,
    getLatestConversation,
};
