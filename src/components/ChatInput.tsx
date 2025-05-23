// src/components/ChatInput.tsx
import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, Mic, Headphones } from 'lucide-react';

import MemoryButton from './MemoryButton'; 

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onGoToVoiceMode?: () => void;
  onSaveMemory?: () => void; // Prop para salvar memória
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, onGoToVoiceMode, onSaveMemory }) => {
  const [inputMessage, setInputMessage] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim()) {
      onSendMessage(inputMessage);
      setInputMessage('');
    }
  };

  const handleGoToVoicePage = () => {
    console.log('Botão de IR PARA MODO DE VOZ clicado. Navegando...');
    if (onGoToVoiceMode) {
      onGoToVoiceMode();
    }
  };

  const handleSendAudioMessage = () => {
    console.log('Botão de Microfone clicado. Por enquanto, irá para a página de voz.');
    if (onGoToVoiceMode) {
        onGoToVoiceMode();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (formRef.current) {
        formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  };

  const handleMemoryButtonClick = () => {
    console.log('Botão de Memória clicado dentro do ChatInput. Chamando onSaveMemory.');
    if (onSaveMemory) {
      onSaveMemory(); // APENAS SALVA A MEMÓRIA. NÃO NAVEGA.
    }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="relative w-full flex items-center bg-white rounded-full p-2 shadow-lg"
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 14 }}
      ref={formRef}
    >
      <div className="absolute bottom-2 left-4">
        <MemoryButton
          onClick={handleMemoryButtonClick} 
          className="!p-0 !bg-transparent !shadow-none !border-none"
        />
      </div>

      <input
        type="text"
        value={inputMessage}
        onChange={(e) => setInputMessage(e.target.value)}
        placeholder="Pergunte alguma coisa"
        className="flex-1 pl-12 pr-16 py-3 bg-transparent border-none focus:outline-none text-gray-800"
        onKeyDown={handleKeyDown}
      />

      <div className="flex items-center space-x-2">
        {onGoToVoiceMode && (
          <button
            type="button"
            onClick={handleGoToVoicePage}
            className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Ir para modo de voz"
          >
            <Headphones size={24} />
          </button>
        )}

        <button
          type="button"
          onClick={handleSendAudioMessage}
          className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Gravar ou enviar áudio"
        >
          <Mic size={24} />
        </button>

        <button
          type="submit"
          className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          aria-label="Enviar mensagem de texto"
          disabled={!inputMessage.trim()}
        >
          <Send size={24} />
        </button>
      </div>
    </motion.form>
  );
};

export default ChatInput;