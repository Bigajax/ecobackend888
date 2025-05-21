// C:\Users\Rafael\Desktop\eco5555\Eco666\src\components\ChatInput.tsx

import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, Mic } from 'lucide-react'; // Mantenha apenas os ícones que realmente são usados aqui

// REMOVA ESTAS IMPORTAÇÕES SE NÃO FOREM USADAS NESTE COMPONENTE:
// import { BookOpen } from 'lucide-react'; // BookOpen agora está no Header
// import { useNavigate } from 'react-router-dom'; // Se não houver navegação direta por este componente
// import { MdRecordVoiceOver } from 'react-icons/md'; // Se não for usar especificamente esta função aqui

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  // REMOVIDO: onRegistroManual: () => void; // Esta prop não é mais necessária aqui
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage }) => { // onRegistroManual foi removido dos props
  const [inputMessage, setInputMessage] = useState(''); // Renomeado para inputMessage para clareza
  // REMOVIDO: const navigate = useNavigate(); // Não há navegação direta daqui
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim()) { // Usando inputMessage
      onSendMessage(inputMessage); // Usando inputMessage
      setInputMessage(''); // Limpa o input
    }
  };

  // REMOVIDO: handleMemoryClick, pois a funcionalidade de memória é acionada pelo Header
  /*
  const handleMemoryClick = () => {
    onRegistroManual();
  };
  */

  // REMOVIDO: goToVoicePage, pois a navegação direta para '/voice' não é responsabilidade deste input
  /*
  const goToVoicePage = () => {
    navigate('/voice');
  };
  */

  const handleSendAudio = () => {
    console.log('Enviar áudio (funcionalidade a ser implementada).');
    // Implementar a lógica de gravação/envio de áudio aqui
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Dispara o submit do formulário
      if (formRef.current) {
        formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="flex items-center space-x-2 bg-white rounded-full p-2 shadow-lg" // Reverti para o estilo mais simples
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 14 }}
      ref={formRef}
    >
      <input
        type="text"
        value={inputMessage} // Usando inputMessage
        onChange={(e) => setInputMessage(e.target.value)} // Usando inputMessage
        placeholder="Fale com a Eco..." // Texto mais genérico
        className="flex-1 px-4 py-2 bg-transparent border-none focus:outline-none text-gray-800"
        onKeyDown={handleKeyDown}
      />
      {/* Botão de Microfone - mantido para futura implementação de áudio */}
      <button
        type="button" // Importante ser 'button' para não disparar o submit
        className="p-2 rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
        aria-label="Gravar áudio"
        onClick={handleSendAudio} // Adicionando o onClick
      >
        <Mic className="h-5 w-5" />
      </button>
      {/* Botão de Enviar */}
      <button
        type="submit"
        className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors"
        aria-label="Enviar mensagem"
        disabled={!inputMessage.trim()} // Desabilita se o input estiver vazio
      >
        <Send className="h-5 w-5" />
      </button>
    </motion.form>
  );
};

export default ChatInput;