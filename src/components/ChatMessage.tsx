import React, { useState } from 'react';
import { motion } from 'framer-motion';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'eco';
}

interface ChatMessageProps {
  message: Message;
  onCopyToClipboard?: (text: string) => void;
  onSpeak?: (text: string) => void;
  onLike?: (messageId: string) => void;
  onDislike?: (messageId: string) => void;
  onRegenerate?: (messageId: string, originalText: string) => void; // Para mensagens da 'eco'
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onCopyToClipboard,
  onSpeak,
  onLike,
  onDislike,
  onRegenerate,
}) => {
  const isUser = message.sender === 'user';
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleSpeak = () => {
    if (onSpeak) {
      onSpeak(message.text);
      setIsSpeaking(true);
      // Opcional: Lógica para parar a fala e atualizar o estado
    }
  };

  return (
    <motion.div
      className={`mb-6 ${isUser ? 'flex justify-end' : 'flex justify-start'}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="relative">
        <div
          className={`px-4 py-3 rounded-2xl max-w-[80%] ${
            isUser
              ? 'bg-blue-100 text-gray-800 rounded-tr-sm'
              : 'bg-white text-gray-800 rounded-tl-sm shadow-sm'
          }`}
        >
          <p className="text-sm leading-relaxed">{message.text}</p>
        </div>
        <div className="absolute bottom-[-20px] left-0 w-full flex justify-around items-center text-gray-500 text-xs">
          {onCopyToClipboard && (
            <button onClick={() => onCopyToClipboard(message.text)} aria-label="Copiar" className="focus:outline-none">
              <span role="img" aria-label="Copiar">⧉</span>
            </button>
          )}
          {onSpeak && (
            <button onClick={handleSpeak} aria-label="Ouvir" className="focus:outline-none">
              <span role="img" aria-label="Ouvir">{isSpeaking ? '🔊' : '🔈'}</span>
            </button>
          )}
          <button onClick={() => onLike && onLike(message.id)} aria-label="Curtir" className="focus:outline-none">
            <span role="img" aria-label="Curtir">👍</span>
          </button>
          <button onClick={() => onDislike && onDislike(message.id)} aria-label="Descurtir" className="focus:outline-none">
            <span role="img" aria-label="Descurtir">👎</span>
          </button>
          {message.sender === 'eco' && onRegenerate && (
            <button onClick={() => onRegenerate(message.id, /* Aqui você precisaria da pergunta original */)} aria-label="Refazer" className="focus:outline-none">
              <span role="img" aria-label="Refazer">🔄</span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ChatMessage;