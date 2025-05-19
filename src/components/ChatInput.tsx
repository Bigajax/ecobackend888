// ChatInput.tsx
import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MdRecordVoiceOver } from 'react-icons/md';
import { Mic } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onRegistroManual: () => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, onRegistroManual }) => {
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message);
      setMessage('');
    }
  };

  const handleMemoryClick = () => {
    onRegistroManual();
  };

  const goToVoicePage = () => {
    navigate('/voice');
  };

  const handleSendAudio = () => {
    console.log('Enviar áudio');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (formRef.current) {
        formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-auto p-4 border-t border-gray-100 shadow-md rounded-lg overflow-hidden flex flex-col"
      ref={formRef}
      style={{
        boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)',
      }}
    >
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Fale com a Eco"
        className="w-full px-4 py-3 bg-transparent focus:outline-none"
        onKeyDown={handleKeyDown}
      />
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center space-x-2">
          <button
            className="p-2 rounded-full hover:bg-gray-200 focus:outline-none"
            onClick={handleMemoryClick}
          >
            <BookOpen size={20} />
          </button>
          <button
            className="p-2 rounded-full hover:bg-gray-200 focus:outline-none"
            onClick={goToVoicePage}
          >
            <MdRecordVoiceOver size={20} />
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <button
            className="p-2 rounded-full hover:bg-gray-200 focus:outline-none"
            onClick={handleSendAudio}
          >
            <Mic size={20} />
          </button>
          <motion.button
            type="submit"
            className="w-10 h-10 flex items-center justify-center bg-black text-white rounded-full ml-2"
            whileTap={{ scale: 0.95 }}
            disabled={!message.trim()}
          >
            <Send size={20} />
          </motion.button>
        </div>
      </div>
    </form>
  );
};

export default ChatInput;