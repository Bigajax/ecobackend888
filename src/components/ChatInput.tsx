import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MdRecordVoiceOver } from 'react-icons/md';
import { Mic } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage }) => {
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

  const handleMemoryNavigation = () => {
    navigate('/memory');
  };

  const goToVoicePage = () => {
    navigate('/voice');
  };

  const handleSendAudio = () => {
    // Aqui você implementará a lógica para iniciar o envio de áudio
    console.log('Enviar áudio');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { // Verifica se a tecla é Enter e Shift não está pressionado
      e.preventDefault(); // Evita o comportamento padrão de inserir uma nova linha
      if (formRef.current) {
        formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-auto p-4 border-t border-gray-100" ref={formRef}>
      <div
        className="bg-gray-50 rounded-lg overflow-hidden flex flex-col"
        style={{
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
        }}
      >
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Fale com a Eco"
          className="w-full px-4 py-3 bg-transparent focus:outline-none"
          onKeyDown={handleKeyDown} // Adicionando o manipulador de evento
        />
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center space-x-2">
            <button
              className="p-2 rounded-full hover:bg-gray-200 focus:outline-none"
              onClick={handleMemoryNavigation}
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
      </div>
    </form>
  );
};

export default ChatInput;