import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, Mic, Headphones } from 'lucide-react'; // Importe Headphones ou o ícone desejado

import MemoryButton from './MemoryButton';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onGoToVoiceMode?: () => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, onGoToVoiceMode }) => {
  const [inputMessage, setInputMessage] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim()) {
      onSendMessage(inputMessage);
      setInputMessage('');
    }
  };

  // Esta função será para NAVEGAR para a página de voz
  const handleGoToVoicePage = () => {
    console.log('Botão de IR PARA MODO DE VOZ clicado. Navegando...');
    if (onGoToVoiceMode) {
      onGoToVoiceMode();
    }
  };

  // Esta função pode ser para ENVIAR ÁUDIO gravado diretamente do input, se houver essa funcionalidade.
  // Por enquanto, ela pode simplesmente chamar handleGoToVoicePage se você preferir.
  const handleSendAudioMessage = () => {
    console.log('Botão de Microfone clicado. Se a funcionalidade de gravação rápida estivesse aqui, ela iniciaria. Por enquanto, irá para a página de voz.');
    // Se você não for implementar gravação de áudio direto aqui, pode fazer ele navegar
    if (onGoToVoiceMode) {
        onGoToVoiceMode();
    }
    // Ou, se você quer que o botão Mic seja apenas para gravação (e não navegação):
    // alert("Funcionalidade de gravar e enviar áudio direto será implementada aqui.");
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
    console.log('Botão de Memória clicado dentro do ChatInput.');
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
        {/* NOVO: Botão para navegar para a VoicePage */}
        {onGoToVoiceMode && (
          <button
            type="button"
            onClick={handleGoToVoicePage} // Chama a nova função para navegar
            className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Ir para modo de voz"
          >
            <Headphones size={24} /> {/* Novo ícone para ir para a VoicePage */}
          </button>
        )}

        {/* Botão de Microfone (pode ser para gravar e enviar áudio no futuro ou opcionalmente navegar) */}
        <button
          type="button" // Use type="button" para evitar submit
          onClick={handleSendAudioMessage} // Pode ser ajustado para gravar/enviar áudio, ou chamar handleGoToVoicePage
          className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Gravar ou enviar áudio"
        >
          <Mic size={24} />
        </button>

        {/* Botão de Enviar (para texto) */}
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