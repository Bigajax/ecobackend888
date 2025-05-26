// C:\Users\Rafael\Desktop\eco5555\Eco666\src\components\ChatMessage.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
// Adicionando MessageCircle aqui
import { Copy, Volume2, ThumbsUp, ThumbsDown, RotateCw, MessageCircle } from 'lucide-react';

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
    const isEco = message.sender === 'eco';
    const [isSpeaking, setIsSpeaking] = useState(false);

    const handleSpeak = () => {
        if (onSpeak) {
            onSpeak(message.text);
            setIsSpeaking(true);
        }
    };

    return (
        <motion.div
            className={`mb-6 ${isUser ? 'flex justify-end' : 'flex justify-start'} items-start`} // Adicionado items-start para alinhar topo
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            {isEco && ( // Ícone da bolha para mensagens da Eco
                <div className="flex items-start pt-1 mr-2"> {/* pt-1 para um pequeno ajuste vertical */}
                    <MessageCircle size={18} strokeWidth={1.5} className="text-gray-400" /> {/* Tamanho e cor do ícone */}
                </div>
            )}
            <div className="relative">
                <div
                    className={`px-4 py-3 rounded-2xl max-w-[80%] sm:max-w-[60%] md:max-w-[480px] ${
                        isUser
                            ? 'bg-blue-100 text-gray-800 rounded-tr-sm'
                            : 'bg-white text-gray-800 rounded-tl-sm'
                    }`}
                    style={{
                        boxShadow: '0 0 5px rgba(0, 0, 0, 0.05)',
                    }}
                >
                    <p className="text-sm leading-relaxed break-words">{message.text}</p>
                </div>

                {isEco && (
                    // Ajustes:
                    // - `bottom-[-20px]`: para a distância vertical
                    // - `gap-x-1`: para espaçamento horizontal entre os ícones (ajuste 0.5, 1, 1.5, 2)
                    // - `pr-2`: para dar um pequeno padding à direita da barra de ícones
                    <div className={`absolute bottom-[-20px] left-0 flex items-center text-gray-400 text-xs gap-x-1 pr-2`}>
                        {onCopyToClipboard && (
                            <button
                                onClick={() => onCopyToClipboard(message.text)}
                                aria-label="Copiar"
                                className="focus:outline-none p-1 rounded-full hover:bg-gray-100 transition-colors duration-150"
                            >
                                <Copy size={14} strokeWidth={1.5} /> {/* Tamanho menor, espessura da linha um pouco mais forte */}
                            </button>
                        )}
                        {onSpeak && (
                            <button
                                onClick={handleSpeak}
                                aria-label="Ouvir"
                                className="focus:outline-none p-1 rounded-full hover:bg-gray-100 transition-colors duration-150"
                            >
                                <Volume2 size={14} strokeWidth={1.5} /> {/* Tamanho menor, espessura da linha um pouco mais forte */}
                            </button>
                        )}
                        {onLike && (
                            <button
                                onClick={() => onLike(message.id)}
                                aria-label="Curtir"
                                className="focus:outline-none p-1 rounded-full hover:bg-gray-100 transition-colors duration-150"
                            >
                                <ThumbsUp size={14} strokeWidth={1.5} /> {/* Tamanho menor, espessura da linha um pouco mais forte */}
                            </button>
                        )}
                        {onDislike && (
                            <button
                                onClick={() => onDislike(message.id)}
                                aria-label="Descurtir"
                                className="focus:outline-none p-1 rounded-full hover:bg-gray-100 transition-colors duration-150"
                            >
                                <ThumbsDown size={14} strokeWidth={1.5} /> {/* Tamanho menor, espessura da linha um pouco mais forte */}
                            </button>
                        )}
                        {onRegenerate && (
                            <button
                                onClick={() => onRegenerate(message.id, message.text)} // Comentário removido desta linha
                                aria-label="Refazer"
                                className="focus:outline-none p-1 rounded-full hover:bg-gray-100 transition-colors duration-150"
                            >
                                <RotateCw size={14} strokeWidth={1.5} /> {/* Tamanho menor, espessura da linha um pouco mais forte */}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default ChatMessage;