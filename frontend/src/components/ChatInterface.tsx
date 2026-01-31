import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, X, Bot, Volume2, Square } from 'lucide-react';
import { agentService } from '../services/agentService';
import { conversationService } from '../services/conversationService';
import api from '../services/api';
import { Agent } from '../types';
import { SaveResponseButton } from './SaveResponseButton';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import '../styles/saveResponseButton.css';
import FileUpload, { FilePreview } from './FileUpload';

type Message = {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	createdAt?: string;
	error?: boolean;
	feedback?: 'like' | 'dislike' | null;
};

type Props = {
	agentId: string;
	conversationId?: string;
	onConversationChange?: (conversationId: string | undefined) => void;
};

export default function ChatInterface({ agentId, conversationId, onConversationChange }: Props) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState('');
	const [isStreaming, setIsStreaming] = useState(false);
	const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(conversationId);
	const [showStatusWarning, setShowStatusWarning] = useState(false);
	const [selectedFiles, setSelectedFiles] = useState<FilePreview[]>([]);

	// Text-to-speech hook
	const { speak, stop, isSpeaking, currentMessageId } = useTextToSpeech();

	// Fetch agent details to check status
	const { data: agent } = useQuery<Agent>({
		queryKey: ['agent', agentId],
		queryFn: async () => {
			const response = await api.get(`/agents/${agentId}`);
			return response.data.data;
		},
		enabled: !!agentId,
	});

	// Fetch all agents for SaveResponseButton dropdown
	const { data: allAgents = [] } = useQuery<Agent[]>({
		queryKey: ['agents'],
		queryFn: async () => {
			const response = await api.get('/agents');
			return response.data.data || [];
		},
	});

	const isAgentAvailable = agent?.status === 'ACTIVE' || agent?.status === 'TRAINING';

	const assistantBufferRef = useRef<string>('');
	const scrollRef = useRef<HTMLDivElement | null>(null);

	/* ============================================================
	   🔥 LOAD EXISTING CONVERSATION
	   ============================================================ */
	const previousConversationIdRef = useRef<string | undefined>(undefined);
	const previousAgentIdRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		// Only clear messages if we're actually switching to a different conversation or agent
		const isDifferentConversation = conversationId !== previousConversationIdRef.current;
		const isDifferentAgent = agentId !== previousAgentIdRef.current;

		if (isDifferentConversation || isDifferentAgent) {
			setMessages([]);
		}

		setCurrentConversationId(conversationId);
		previousConversationIdRef.current = conversationId;
		previousAgentIdRef.current = agentId;

		async function load() {
			try {
				// If conversationId explicitly provided
				if (conversationId) {
					const res = await api.get(`/conversations/${conversationId}`);
					if (res.data?.success) {
						const msgs = res.data.data.messages || [];
						setMessages(
							msgs.map((m: any) => ({
								id: m.id,
								role: (m.role || '').toLowerCase(),
								content: m.content,
								createdAt: m.createdAt,
								feedback: m.feedback === 1 ? 'like' : m.feedback === -1 ? 'dislike' : null,
							}))
						);
						return;
					}
				}

				// If no conversationId, try to load latest for agent
				const res = await api.get(`/conversations/latest/${agentId}`);
				console.log('📥 Latest conversation response:', { 
					success: res.data?.success, 
					hasData: !!res.data?.data,
					messageCount: res.data?.data?.messages?.length,
					conversationId: res.data?.data?.id
				});
				
				if (res.data?.success && res.data.data) {
					const conv = res.data.data;
					setCurrentConversationId(conv.id);
					onConversationChange?.(conv.id);
					const msgs = conv.messages || [];
					console.log('✅ Setting messages:', msgs.length);
					setMessages(
						msgs.map((m: any) => ({
							id: m.id,
							role: (m.role || '').toLowerCase(),
							content: m.content,
							createdAt: m.createdAt,
							feedback: m.feedback === 1 ? 'like' : m.feedback === -1 ? 'dislike' : null,
						}))
					);
				} else {
					// No conversation found, keep messages empty
					console.log('📭 No conversation data found, clearing messages');
					setMessages([]);
					onConversationChange?.(undefined);
				}
			} catch (err) {
				console.error('Failed to load conversation', err);
				// On error, ensure messages are cleared
				setMessages([]);
			}
		}

		load();
	}, [agentId, conversationId]);

	/* ============================================================
	   🔥 AUTO SCROLL
	   ============================================================ */
	useEffect(() => {
		scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages, isStreaming]);

	/* ============================================================
	   🔥 APPEND MESSAGE
	   ============================================================ */
	function appendMessage(msg: Message) {
		setMessages((prev) => [...prev, msg]);
	}

	/* ============================================================
	   🔥 SEND MESSAGE & STREAM RESPONSE
	   ============================================================ */
	async function handleSend() {
		const text = input.trim();
		// Allow sending if either text OR files exist
		if ((!text && selectedFiles.length === 0) || isStreaming) return;

		// Check if agent is available for chat
		if (!isAgentAvailable) {
			setShowStatusWarning(true);
			return;
		}

		// Build display message content
		let displayContent = text || '';
		if (selectedFiles.length > 0) {
			const fileNames = selectedFiles.map(f => f.file.name).join(', ');
			displayContent += (displayContent ? '\n\n' : '') + `[📎 Attached: ${fileNames}]`;
		}

		// USER MESSAGE (temporary display)
		const userMsg: Message = {
			id: Date.now() + '-u',
			role: 'user',
			content: displayContent,
			createdAt: new Date().toISOString(),
		};
		appendMessage(userMsg);
		
		const messageText = text || '[Attachment]';
		setInput('');
		const filesToUpload = [...selectedFiles];
		setSelectedFiles([]);

		// ASSISTANT PLACEHOLDER
		const assistantId = Date.now() + '-a';
		appendMessage({
			id: assistantId,
			role: 'assistant',
			content: '',
			createdAt: new Date().toISOString(),
		});

		assistantBufferRef.current = '';
		setIsStreaming(true);

		// Step 1: Create message and upload files BEFORE starting chat
		let messageId: string | undefined;
		let newConversationId: string | undefined;
		
		try {
			// Create the user message first
			const msgResponse = await api.post('/conversations/message', {
				agentId,
				conversationId: currentConversationId,
				message: messageText,
				role: 'user'
			});
			
			if (msgResponse.data?.messageId) {
				messageId = msgResponse.data.messageId;
				newConversationId = msgResponse.data.conversationId;
				
				// Update the temporary user message ID with the real UUID from backend
				setMessages((prev) =>
					prev.map((m) =>
						m.id === userMsg.id ? { ...m, id: messageId } : m
					)
				);
				
				// If we got a new conversation ID, update it
				if (newConversationId && !currentConversationId) {
					setCurrentConversationId(newConversationId);
					onConversationChange?.(newConversationId);
				}
				
				// Upload all files to this message
				if (filesToUpload.length > 0) {
					for (const filePreview of filesToUpload) {
						try {
							const formData = new FormData();
							formData.append('file', filePreview.file);
							
							await api.post(`/uploads/messages/${messageId}`, formData, {
								headers: {
									'Content-Type': 'multipart/form-data',
								},
							});
						} catch (uploadErr) {
							console.error('Failed to upload file:', filePreview.file.name, uploadErr);
						}
					}
				}
			}
		} catch (err) {
			console.error('Failed to create message:', err);
			setIsStreaming(false);
			return;
		}

		// Step 2: Start chat with skipUserMessage flag since we already created the message
		let streamStarted = false;

		try {
			await agentService.chatStream(
				agentId,
				messageText,
				{ 
					conversationId: newConversationId || currentConversationId, 
					skipUserMessage: true // Always true now since we created the message above
				},

				// 🔥 onMessage
				(rawChunk) => {
					// Ignore "connected"
					if (rawChunk === 'connected') return;

					let data;
					try {
						data = JSON.parse(rawChunk);
					} catch {
						return;
					}

					// Update conversationId (metadata)
					if (data.conversationId && !data.token) {
						setCurrentConversationId(data.conversationId);
						return;
					}

					// Token chunk
					if (data.token) {
						streamStarted = true;
						assistantBufferRef.current += data.token;

						setMessages((prev) =>
							prev.map((m) =>
								m.id === assistantId
									? { ...m, content: assistantBufferRef.current }
									: m
							)
						);
					}
				},

				// 🔥 onDone
				async () => {
					setIsStreaming(false);

					const final = assistantBufferRef.current;
					setMessages((prev) =>
						prev.map((m) => (m.id === assistantId ? { ...m, content: final } : m))
					);

					assistantBufferRef.current = '';

					// Refetch conversation to get proper IDs from database
					if (currentConversationId) {
						try {
							const res = await api.get(`/conversations/${currentConversationId}`);
							if (res.data?.success) {
								const msgs = res.data.data.messages || [];
								setMessages(
									msgs.map((m: any) => ({
										id: m.id,
										role: (m.role || '').toLowerCase(),
										content: m.content,
										createdAt: m.createdAt,
										feedback: m.feedback === 1 ? 'like' : m.feedback === -1 ? 'dislike' : null,
									}))
								);
							}
						} catch (err) {
							console.error('Failed to refetch conversation:', err);
						}
					}
				},

				// 🔥 onError
				(err: any) => {
					setIsStreaming(false);
					assistantBufferRef.current = '';

					setMessages((prev) =>
						prev.map((m) =>
							m.id === assistantId
								? {
										...m,
										error: true,
										content: streamStarted
											? `⚠️ Connection lost.\n${err?.message || err}`
											: `❌ Could not start chat.\n${err?.message || err}`,
								  }
								: m
						)
					);

				}
			);
		} catch (err: any) {
			setIsStreaming(false);
			assistantBufferRef.current = '';

			setMessages((prev) =>
				prev.map((m) =>
					m.id === assistantId
						? {
								...m,
								error: true,
								content: `❌ Could not connect.\n${err?.message || err}`,
						  }
						: m
				)
			);
		}
	}

	/* ============================================================
	   🔥 FEEDBACK & COPY HANDLERS
	   ============================================================ */
	async function handleFeedback(messageId: string, feedback: 'like' | 'dislike') {
		try {
			const newFeedbackState = await conversationService.recordFeedback(messageId, feedback);
			
			const feedbackMap: { [key: number]: 'like' | 'dislike' | null } = {
				1: 'like',
				[-1]: 'dislike',
				0: null
			};

			const newFeedback = feedbackMap[newFeedbackState.feedback as (1 | -1 | 0)];

			setMessages(messages.map(m => m.id === messageId ? { ...m, feedback: newFeedback } : m));
		} catch (error) {
			// Silently fail - user will see feedback didn't change
		}
	}

	function handleCopy(text: string) {
		navigator.clipboard.writeText(text).then(() => {
			// Optionally show a "Copied!" toast/notification
		}).catch(err => {
			console.error('Failed to copy text', err);
		});
	}

	/* ============================================================
	   🔥 CHAT BUBBLE UI
	   ============================================================ */
	const Bubble = ({ msg }: { msg: Message }) => (
		<div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
			<div
				className={`
					max-w-[75%] px-3 py-2 rounded-lg shadow-sm
					${
						msg.role === 'user'
							? 'bg-blue-600 text-white rounded-br-none'
							: msg.error
							? 'bg-red-100 text-red-800 border border-red-200 rounded-bl-none'
							: 'bg-white text-gray-900 border border-gray-200 rounded-bl-none'
					}
				`}
			>
				<div className="whitespace-pre-wrap text-sm">{msg.content}</div>
				{msg.role === 'assistant' && !isStreaming && !msg.error && (
					<div className="flex gap-1 mt-2 border-t border-gray-200 -mx-3 px-3 pt-2">
						<button onClick={() => handleCopy(msg.content)} className="text-gray-400 hover:text-gray-600 p-1 rounded">
							<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
						</button>
						<button 
							onClick={() => isSpeaking && currentMessageId === msg.id ? stop() : speak(msg.content, msg.id)}
							className={`p-1 rounded transition-all ${isSpeaking && currentMessageId === msg.id ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
							title={isSpeaking && currentMessageId === msg.id ? 'Stop speaking' : 'Read aloud'}
						>
							{isSpeaking && currentMessageId === msg.id ? (
								<Square className="h-4 w-4 text-blue-600 fill-blue-600" />
							) : (
								<Volume2 className="h-4 w-4 text-gray-400 hover:text-gray-600" />
							)}
						</button>
						<button 
							onClick={() => handleFeedback(msg.id, 'like')} 
							className={`p-1 rounded transition-all ${msg.feedback === 'like' ? 'bg-green-100' : 'hover:bg-gray-100'}`}
						>
							<img 
								src="/thumbs-up.svg" 
								alt="Like" 
								className={`h-4 w-4 ${msg.feedback === 'like' ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
							/>
						</button>
						<button 
							onClick={() => handleFeedback(msg.id, 'dislike')} 
							className={`p-1 rounded transition-all ${msg.feedback === 'dislike' ? 'bg-red-100' : 'hover:bg-gray-100'}`}
						>
							<img 
								src="/thumbs-down.svg" 
								alt="Dislike" 
								className={`h-4 w-4 ${msg.feedback === 'dislike' ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
							/>
						</button>
						<SaveResponseButton
							messageId={msg.id}
							messageContent={msg.content}
							currentAgentId={agentId}
							currentConversationId={currentConversationId || ''}
							allAgents={allAgents.map(a => ({ id: a.id, name: a.name }))}
							questionText={messages.find(m => m.role === 'user' && messages.indexOf(m) < messages.indexOf(msg))?.content || 'User Query'}
						/>
						<SaveResponseButton
							messageId={msg.id}
							messageContent={msg.content}
							currentAgentId={agentId}
							currentConversationId={currentConversationId || ''}
							allAgents={allAgents.map(a => ({ id: a.id, name: a.name }))}
							questionText={messages.find(m => m.role === 'user' && messages.indexOf(m) < messages.indexOf(msg))?.content || 'User Query'}
						/>
					</div>
				)}
			</div>
			<div
				className={`text-xs text-gray-400 mt-1 px-1 ${
					msg.role === 'user' ? 'text-right' : 'text-left'
				}`}
			>
				{msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
			</div>
		</div>
	);

	/* ============================================================
	   🔥 RENDER
	   ============================================================ */
	return (
		<div className="flex flex-col h-full bg-white border rounded-lg shadow">
			{/* Status Warning Banner */}
			{agent && !isAgentAvailable && (
				<div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 flex items-center gap-2">
					<AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
					<p className="text-sm text-yellow-800">
						<strong>Agent status is {agent.status.toLowerCase()}</strong> - You can view existing messages, but new conversations are disabled. Change the agent status to "Active" or "Training" to enable chatting.
					</p>
				</div>
			)}

			{/* CHAT MESSAGES */}
			<div className="flex-1 overflow-y-auto p-4 space-y-3">
				{messages.length === 0 && !isStreaming && agent && (
					<div className="flex flex-col items-center justify-center h-full text-center px-4">
						<div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
							<Bot className="h-8 w-8 text-blue-600" />
						</div>
						<h3 className="text-xl font-semibold text-gray-800 mb-2">
							Welcome to {agent.name}!
						</h3>
						<p className="text-gray-600 mb-1">
							{agent.description}
						</p>
						{isAgentAvailable ? (
							<p className="text-sm text-gray-500 mt-4">
								Start chatting now by typing a message below 👇
							</p>
						) : (
							<p className="text-sm text-yellow-600 mt-4">
								⚠️ This agent is currently {agent.status.toLowerCase()}. Chatting is disabled.
							</p>
						)}
					</div>
				)}

				{messages.map((msg) => (
					<Bubble key={msg.id} msg={msg} />
				))}

				{/* Typing Indicator */}
				{isStreaming && (
					<div className="flex items-center gap-2 ml-2 text-gray-500">
						<div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
						<div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
						<div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-300"></div>
					</div>
				)}

				<div ref={scrollRef} />
			</div>

			{/* INPUT BAR */}
			<div className="border-t p-3 bg-gray-50">
				<FileUpload 
					onFilesSelected={setSelectedFiles}
					disabled={isStreaming || !isAgentAvailable}
				/>
				
				<div className="flex gap-2 mt-2">
					<input
						className="flex-1 border rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
						placeholder={
							!isAgentAvailable 
								? `Agent status is ${agent?.status.toLowerCase() || 'unavailable'} - chatting disabled` 
								: isStreaming 
								? 'Agent is replying...' 
								: 'Type a message...'
						}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && !isStreaming && isAgentAvailable && handleSend()}
						disabled={isStreaming || !isAgentAvailable}
					/>

					<button
						onClick={handleSend}
						disabled={isStreaming || !input.trim() || !isAgentAvailable}
						className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 hover:bg-indigo-700 disabled:cursor-not-allowed"
					>
						Send
					</button>
				</div>
			</div>

			{/* Status Warning Modal */}
			{showStatusWarning && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
					<div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
						<div className="flex items-start gap-3">
							<div className="p-2 bg-yellow-100 rounded-full flex-shrink-0">
								<AlertCircle className="h-6 w-6 text-yellow-600" />
							</div>
							<div className="flex-1">
								<h3 className="text-lg font-semibold text-gray-900 mb-2">Agent Unavailable</h3>
								<p className="text-sm text-gray-600 mb-4">
									This agent is currently <strong>{agent?.status.toLowerCase()}</strong> and cannot accept new messages. 
									You can still view the conversation history, but chatting is disabled.
									<br /><br />
									To enable chatting, please change the agent status to "Active" or "Training" from the agent settings.
								</p>
								<div className="flex justify-end">
									<button
										onClick={() => setShowStatusWarning(false)}
										className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
									>
										Got it
									</button>
								</div>
							</div>
							<button
								onClick={() => setShowStatusWarning(false)}
								className="text-gray-400 hover:text-gray-600"
							>
								<X className="h-5 w-5" />
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
