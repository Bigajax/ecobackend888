import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message);
      setMessage('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-auto p-4 border-t border-gray-100">
      <div className="flex items-center bg-gray-50 rounded-full overflow-hidden pr-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Envie uma mensagem"
          className="flex-1 px-4 py-2 bg-transparent focus:outline-none"
        />
        <motion.button
          type="submit"
          className="ml-2 w-10 h-10 flex items-center justify-center bg-black text-white rounded-full"
          whileTap={{ scale: 0.95 }}
          disabled={!message.trim()}
        >
          <Send size={18} />
        </motion.button>
      </div>
    </form>
  );
};

export default ChatInput;