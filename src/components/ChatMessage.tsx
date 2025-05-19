// ChatMessage.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Volume2, ThumbsUp, ThumbsDown, RotateCw } from 'lucide-react';

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
          className={`px-4 py-3 rounded-2xl max-w-[80%] sm:max-w-[60%] md:max-w-[480px] ${
            isUser
              ? 'bg-blue-100 text-gray-800 rounded-tr-sm'
              : 'bg-white text-gray-800 rounded-tl-sm'
          }`}
          style={{
            boxShadow: '0 0 5px rgba(0, 0, 0, 0.05)', // Sombreamento sutil na borda
          }}
        >
          <p className="text-sm leading-relaxed break-words">{message.text}</p>
        </div>
        <div className="absolute bottom-[-20px] left-0 w-full flex justify-around items-center text-gray-500 text-xs">
          {onCopyToClipboard && (
            <button onClick={() => onCopyToClipboard(message.text)} aria-label="Copiar" className="focus:outline-none mr-2">
              <Copy size={16} />
            </button>
          )}
          {onSpeak && (
            <button onClick={handleSpeak} aria-label="Ouvir" className="focus:outline-none mr-2">
              <Volume2 size={16} />
            </button>
          )}
          <button onClick={() => onLike && onLike(message.id)} aria-label="Curtir" className="focus:outline-none mr-2">
            <ThumbsUp size={16} />
          </button>
          <button onClick={() => onDislike && onDislike(message.id)} aria-label="Descurtir" className="focus:outline-none mr-2">
            <ThumbsDown size={16} />
          </button>
          {message.sender === 'eco' && onRegenerate && (
            <button onClick={() => onRegenerate(message.id, /* Aqui você precisaria da pergunta original */)} aria-label="Refazer" className="focus:outline-none">
              <RotateCw size={16} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ChatMessage;