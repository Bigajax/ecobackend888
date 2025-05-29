import React from 'react';

interface ChatMessageProps {
    message: {
        id: string;
        text: string;
        sender: 'user' | 'eco';
    };
    isEcoTyping?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isEcoTyping }) => {
    const isUser = message.sender === 'user';

    return (
        <div className={`flex mb-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`px-4 py-2 rounded-2xl max-w-xs shadow ${
                    isUser
                        ? 'bg-blue-500 text-white rounded-br-sm'
                        : 'bg-white text-gray-900 rounded-bl-sm'
                }`}
            >
                {isEcoTyping ? (
                    <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse-dot"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse-dot"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse-dot"></div>
                    </div>
                ) : (
                    <span className="text-sm">{message.text}</span>
                )}
            </div>
        </div>
    );
};

export default ChatMessage;
