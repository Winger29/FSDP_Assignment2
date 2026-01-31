// src/components/ChatInterfaceWithSaveResponse.tsx
// Example of how to integrate SaveResponseButton into your existing chat

import React from 'react';
import { SaveResponseButton } from './SaveResponseButton';
import '../styles/saveResponseButton.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentId?: string;
  conversationId?: string;
}

interface Agent {
  id: string;
  name: string;
}

export const ChatInterfaceWithSaveResponse: React.FC<{
  messages: Message[];
  currentAgentId: string;
  currentConversationId: string;
  allAgents: Agent[];
}> = ({ messages, currentAgentId, currentConversationId, allAgents }) => {
  return (
    <div className="chat-messages">
      {messages.map((message) => (
        <div key={message.id} className={`message message-${message.role}`}>
          <div className="message-content">
            {message.content}
          </div>

          {/* Show action buttons only for assistant messages */}
          {message.role === 'assistant' && (
            <div className="message-actions">
              {/* Copy button */}
              <button 
                className="btn-icon"
                title="Copy response"
                onClick={() => navigator.clipboard.writeText(message.content)}
              >
                📋
              </button>

              {/* Like button */}
              <button className="btn-icon" title="Like">
                👍
              </button>

              {/* Dislike button */}
              <button className="btn-icon" title="Dislike">
                👎
              </button>

              {/* NEW: Save and post to another bot */}
              <SaveResponseButton
                messageId={message.id}
                messageContent={message.content}
                currentAgentId={currentAgentId}
                currentConversationId={currentConversationId}
                allAgents={allAgents}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

/* CSS for message container */
const styles = `
.chat-messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.message {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
}

.message-user {
  align-items: flex-end;
}

.message-assistant {
  align-items: flex-start;
}

.message-content {
  background-color: #f5f5f5;
  padding: 12px 16px;
  border-radius: 8px;
  max-width: 70%;
  line-height: 1.5;
}

.message-user .message-content {
  background-color: #1976d2;
  color: white;
}

.message-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  align-items: center;
}

.message-user .message-actions {
  justify-content: flex-end;
}

.btn-icon {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.btn-icon:hover {
  opacity: 1;
}
`;
