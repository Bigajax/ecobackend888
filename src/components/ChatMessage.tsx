import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '../contexts/ChatContext';

interface ChatMessageProps {
  message: Message;
  isEcoTyping?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isEcoTyping }) => {
  const isUser = message.sender === 'user';
  const displayText = message.text ?? message.content ?? '';

  return (
    <div className={`flex mb-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`px-3 py-2 rounded-2xl max-w-md shadow ${
          isUser
            ? 'bg-blue-500 text-white rounded-br-sm'
            : 'bg-white text-gray-900 rounded-bl-sm'
        }`}
      >
        {isEcoTyping ? (
          <div className="flex space-x-1 items-end">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-wave-dot" style={{ animationDelay: '0s' }}></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-wave-dot" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-wave-dot" style={{ animationDelay: '0.4s' }}></div>
          </div>
        ) : (
          <div
            className={`text-sm ${
              isUser ? '' : 'whitespace-pre-line leading-relaxed text-gray-800'
            }`}
          >
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{displayText}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
