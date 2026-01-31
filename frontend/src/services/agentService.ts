import api from './api';

type Agent = any;

async function getAgents(): Promise<Agent[]> {
	const res = await api.get('/agents');
	return res.data.data;
}

async function getAgent(id: string): Promise<Agent> {
	const res = await api.get(`/agents/${id}`);
	return res.data.data;
}

async function createAgent(payload: any): Promise<Agent> {
	const res = await api.post('/agents', payload);
	return res.data.data;
}

async function updateAgent(id: string, payload: any): Promise<Agent> {
	const res = await api.put(`/agents/${id}`, payload);
	return res.data.data;
}

async function deleteAgent(id: string): Promise<boolean> {
	const res = await api.delete(`/agents/${id}`);
	return res.data.success === true;
}

async function testAgent(id: string, message: string): Promise<any> {
	const res = await api.post(`/agents/${id}/test`, { message });
	return res.data.data;
}

/**
 * Chat with agent and stream responses.
 * onMessage is called with each text chunk.
 * onDone is called when stream finishes.
 */
async function chatStream(
	id: string,
	message: string,
	opts: { conversationId?: string; skipUserMessage?: boolean } = {},
	onMessage?: (text: string) => void,
	onDone?: () => void,
	onError?: (err: any) => void
) {
	try {
		// Use fetch so we can stream the response body
		const token = localStorage.getItem('token');

		const base = ((import.meta as any).env?.VITE_API_URL as string) || '/api';
		const res = await fetch(`${base}/agents/${id}/chat`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
			body: JSON.stringify({ 
				message, 
				conversationId: opts.conversationId,
				skipUserMessage: opts.skipUserMessage 
			}),
		});

		if (!res.ok) {
			const text = await res.text();
			// include status for easier debugging upstream
			throw new Error(`HTTP ${res.status}: ${text || 'Streaming request failed'}`);
		}

		if (!res.body) {
			throw new Error('Response body is empty');
		}

		const reader = res.body.getReader();
		const decoder = new TextDecoder('utf-8');
		let buf = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buf += decoder.decode(value, { stream: true });

			// SSE-like parser: split by double newline
			const parts = buf.split('\n\n');
			// Keep last partial chunk in buffer
			buf = parts.pop() || '';

			for (const part of parts) {
				// Each part may contain lines starting with "data: "
				const lines = part.split('\n').map((l) => l.trim());
				for (const line of lines) {
					if (!line) continue;
					if (line.startsWith('data:')) {
						const payload = line.replace(/^data:\s*/, '');
						if (payload === '[DONE]') {
							onDone?.();
							return;
						}

						try {
							const parsed = JSON.parse(payload);
							let out: string;
							if (typeof parsed === 'string') {
								out = parsed;
							} else if (parsed.error !== undefined) {
								out = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
							} else if (parsed.message !== undefined) {
								out = typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed.message);
							} else if (parsed.text !== undefined) {
								// normalize parsed.text to a string
								if (typeof parsed.text === 'string') {
									out = parsed.text;
								} else if (parsed.text?.content) {
									// nested structure from some SDKs
									out = String(parsed.text.content);
								} else {
									out = JSON.stringify(parsed.text);
								}
							} else {
								// Pass through other objects (like {token}, {conversationId}) as JSON strings
								out = JSON.stringify(parsed);
							}
							onMessage?.(out);
						} catch (e) {
							onMessage?.(payload);
						}
					}
				}
			}
		}

		// Flush remaining buffer
		if (buf) {
			const lines = buf.split('\n').map((l) => l.trim());
			for (const line of lines) {
				if (line.startsWith('data:')) {
					const payload = line.replace(/^data:\s*/, '');
					if (payload === '[DONE]') {
						onDone?.();
						return;
					}
					try {
						const parsed = JSON.parse(payload);
						let out: string;
						if (parsed.error !== undefined) {
							out = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
						} else if (parsed.message !== undefined) {
							out = typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed.message);
						} else if (parsed.text !== undefined) {
							if (typeof parsed.text === 'string') out = parsed.text;
							else if (parsed.text?.content) out = String(parsed.text.content);
							else out = JSON.stringify(parsed.text);
						} else {
							// Pass through other objects (like {token}, {conversationId}) as JSON strings
							out = JSON.stringify(parsed);
						}
						onMessage?.(out);
					} catch (e) {
						onMessage?.(payload);
					}
				}
			}
		}

		onDone?.();
	} catch (error) {
		onError?.(error);
		throw error;
	}
}

export const agentService = {
	getAgents,
	getAgent,
	createAgent,
	updateAgent,
	deleteAgent,
	testAgent,
	chatStream,
	createCrossReply,
	getCrossReplies,
	getCrossReplyById,
	addAgentResponse,
	deleteCrossReply,
};

/**
 * Create a cross-agent reply session
 * Takes a message the user liked and wants other agents to answer
 */
async function createCrossReply(payload: any): Promise<any> {
	const res = await api.post('/agents/cross-replies', payload);
	return res.data.data;
}

/**
 * Get all cross-reply sessions for the user
 */
async function getCrossReplies(): Promise<any[]> {
	const res = await api.get('/agents/cross-replies');
	return res.data.data;
}

/**
 * Get a specific cross-reply session with all responses
 */
async function getCrossReplyById(crossReplyId: string): Promise<any> {
	const res = await api.get(`/agents/cross-replies/${crossReplyId}`);
	return res.data.data;
}

/**
 * Add an agent's response to a cross-reply session
 * Called after an agent has answered the question
 */
async function addAgentResponse(
	crossReplyId: string,
	payload: { agentId: string; conversationId: string; responseMessageId: string }
): Promise<any> {
	const res = await api.post(`/agents/cross-replies/${crossReplyId}/responses`, payload);
	return res.data.data;
}

/**
 * Delete a cross-reply session
 */
async function deleteCrossReply(crossReplyId: string): Promise<boolean> {
	const res = await api.delete(`/agents/cross-replies/${crossReplyId}`);
	return res.data.success === true;
}

export default agentService;



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
