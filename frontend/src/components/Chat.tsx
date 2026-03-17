import { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '../hooks/useSSEStream';
import ThinkingBlock from './ThinkingBlock';
import SuggestionChips from './SuggestionChips';

interface ChatProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentThinking: string;
  currentExecuting: string;
  workflowState: string;
  onSendMessage: (message: string) => void;
  onFileUpload?: (file: File) => void;
}

export default function Chat({
  messages,
  isStreaming,
  currentThinking,
  currentExecuting,
  workflowState,
  onSendMessage,
  onFileUpload,
}: ChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get the last assistant message for contextual suggestions
  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].phase === 'executing') {
        return messages[i].content;
      }
    }
    return '';
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentThinking, currentExecuting]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onFileUpload) {
      onFileUpload(file);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex items-center justify-center h-full text-gray-300 text-sm">
            Start a conversation...
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.phase === 'thinking' ? (
              <ThinkingBlock content={msg.content} />
            ) : msg.role === 'user' ? (
              <div className="flex justify-end">
                <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[75%] text-[14px] leading-relaxed shadow-sm">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="flex justify-start">
                <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-md px-5 py-3 max-w-[90%] text-[14px] leading-relaxed prose prose-sm prose-gray max-w-none-table">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Streaming: thinking */}
        {isStreaming && currentThinking && (
          <ThinkingBlock content={currentThinking} isStreaming />
        )}

        {/* Streaming: executing (AI response building) */}
        {isStreaming && currentExecuting && (
          <div className="flex justify-start">
            <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-md px-5 py-3 max-w-[90%] text-[14px] leading-relaxed prose prose-sm prose-gray max-w-none-table">
              <ReactMarkdown>{currentExecuting}</ReactMarkdown>
              <span className="inline-block w-1.5 h-4 bg-blue-500 rounded-sm animate-pulse ml-0.5 align-text-bottom" />
            </div>
          </div>
        )}

        {/* Streaming: waiting (no content yet) */}
        {isStreaming && !currentThinking && !currentExecuting && (
          <div className="flex justify-start">
            <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-md px-5 py-3">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion chips */}
      <SuggestionChips
        workflowState={workflowState}
        lastAssistantMessage={lastAssistantMessage}
        isStreaming={isStreaming}
        onSuggestionClick={(text) => {
          onSendMessage(text);
        }}
      />

      {/* Input bar */}
      <div className="border-t border-gray-100 bg-white px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-3xl mx-auto">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-300 hover:text-gray-500 transition-colors rounded-lg hover:bg-gray-50"
            aria-label="Upload file"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.xlsx,.xls"
            aria-label="Choose file to upload"
            onChange={handleFileChange}
          />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 bg-gray-50 border-0 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white placeholder-gray-400"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            aria-label="Send message"
            className="bg-blue-600 text-white rounded-xl px-5 py-2.5 text-[13px] font-medium hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
