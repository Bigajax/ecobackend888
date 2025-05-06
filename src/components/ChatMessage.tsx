import React from 'react';
import { motion } from 'framer-motion';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'eco';
}

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.sender === 'user';
  
  return (
    <motion.div
      className={`mb-4 ${isUser ? 'flex justify-end' : 'flex justify-start'}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className={`px-4 py-3 rounded-2xl max-w-[80%] ${
          isUser
            ? 'bg-blue-100 text-gray-800 rounded-tr-sm'
            : 'bg-white text-gray-800 rounded-tl-sm shadow-sm'
        }`}
      >
        <p className="text-sm leading-relaxed">{message.text}</p>
      </div>
    </motion.div>
  );
};

export default ChatMessage;