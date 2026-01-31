// src/components/SaveResponseButton.tsx
import React, { useState, useRef, useEffect } from 'react';
import { agentService } from '../services/agentService';
import { conversationService } from '../services/conversationService';

interface SaveResponseButtonProps {
  messageId: string;
  messageContent: string;
  currentAgentId: string;
  currentConversationId: string;
  allAgents: Array<{ id: string; name: string }>;
  questionText?: string;
  onSaved?: () => void;
}

export const SaveResponseButton: React.FC<SaveResponseButtonProps> = ({
  messageId,
  messageContent,
  currentAgentId,
  currentConversationId,
  allAgents,
  questionText = 'Response',
  onSaved
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Filter out current agent - only show other agents
  const otherAgents = allAgents.filter(agent => agent.id !== currentAgentId);

  // Calculate dropdown position to prevent cutoff
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // Use a small delay to ensure menu is rendered in DOM
    const timer = setTimeout(() => {
      if (buttonRef.current && menuRef.current) {
        const buttonRect = buttonRef.current.getBoundingClientRect();
        const menuHeight = menuRef.current.offsetHeight;
        const menuWidth = menuRef.current.offsetWidth;
        
        // Space below button
        const spaceBelow = window.innerHeight - buttonRect.bottom;
        
        // Default: position below
        let top = buttonRect.bottom + 8;
        
        // If not enough space below, position above
        if (spaceBelow < menuHeight + 20) {
          top = buttonRect.top - menuHeight - 8;
        }
        
        // Align to right edge of button
        let left = buttonRect.right - menuWidth;
        
        // Keep within viewport horizontally
        if (left < 10) {
          left = 10;
        } else if (left + menuWidth > window.innerWidth - 10) {
          left = window.innerWidth - menuWidth - 10;
        }
        
        setMenuPosition({ top, left });
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen]);

  const handlePostToAgent = async (agentId: string) => {
    if (isPosting) {
      console.log('⚠️ Already posting, ignoring click');
      return;
    }

    setIsPosting(true);
    setSelectedAgentId(agentId);

    try {
      console.log('🚀 [SaveResponseButton] Starting to post response to agent:', agentId);
      console.log('📝 [SaveResponseButton] Message content:', messageContent);
      console.log('🔍 [SaveResponseButton] Current agent:', currentAgentId);

      // Fetch or create conversation for target agent to preserve history
      let targetConversationId: string | undefined = undefined;
      
      console.log('📋 [SaveResponseButton] Attempting to get latest conversation for agent:', agentId);
      try {
        const existingConv = await conversationService.getLatestConversation(agentId);
        if (existingConv && existingConv.id) {
          targetConversationId = existingConv.id;
          console.log('✅ [SaveResponseButton] Using existing conversation:', targetConversationId);
        } else {
          console.log('⚠️ [SaveResponseButton] No existing conversation found');
        }
      } catch (err) {
        console.log('❌ [SaveResponseButton] Error getting latest conversation:', err);
        console.log('⚠️ [SaveResponseButton] Will create new conversation');
      }

      console.log('📤 [SaveResponseButton] Calling chatStream with:', {
        agentId,
        messageLength: messageContent.length,
        targetConversationId,
      });

      // Chat with selected agent using the saved message content
      let response = '';
      let tokenCount = 0;
      
      await agentService.chatStream(
        agentId,
        messageContent,
        { conversationId: targetConversationId },
        (token) => {
          // Handle streaming tokens
          tokenCount++;
          response += token;
          if (tokenCount % 10 === 0) {
            console.log(`📊 [SaveResponseButton] Received ${tokenCount} tokens...`);
          }
        },
        async () => {
          // onDone - close dropdown and show success
          console.log('✅ [SaveResponseButton] Chat stream completed successfully');
          console.log('📊 [SaveResponseButton] Total tokens:', tokenCount);
          console.log('📄 [SaveResponseButton] Final response length:', response.length);
          
          setIsOpen(false);
          setSelectedAgentId(null);
          onSaved?.();
        },
        (err) => {
          console.error('❌ [SaveResponseButton] Error during chat stream:', err);
          setIsOpen(false);
          setSelectedAgentId(null);
        }
      );
    } catch (error) {
      console.error('❌ [SaveResponseButton] Error in handlePostToAgent:', error);
      setIsOpen(false);
      setSelectedAgentId(null);
    } finally {
      console.log('🔚 [SaveResponseButton] handlePostToAgent finished');
      setIsPosting(false);
    }
  };

  return (
    <div className="save-response-dropdown">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="btn-icon"
        title="Save and post to another bot"
        disabled={isPosting || otherAgents.length === 0}
      >
        💾
      </button>

      {isOpen && otherAgents.length > 0 && (
        <div 
          ref={menuRef}
          className="dropdown-menu"
          style={menuPosition ? {
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
          } : undefined}
        >
          <div className="dropdown-header">
            Post to another bot:
          </div>
          {otherAgents.map(agent => (
            <button
              key={agent.id}
              onClick={() => handlePostToAgent(agent.id)}
              disabled={isPosting}
              className={`dropdown-item ${selectedAgentId === agent.id ? 'selected' : ''}`}
            >
              {isPosting && selectedAgentId === agent.id ? (
                <>⏳ Posting...</>
              ) : (
                <>🤖 {agent.name}</>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
