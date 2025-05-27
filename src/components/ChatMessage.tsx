import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Volume2, ThumbsUp, ThumbsDown, RotateCw } from 'lucide-react';
// Removed: import EcoBubble from './EcoBubble'; // Importe o componente EcoBubble

export interface Message {
    id: string;
    text: string;
    sender: 'user' | 'eco';
    audioUrl?: string; // Adicionado para lidar com a URL de áudio
}

interface ChatMessageProps {
    message: Message;
    onCopyToClipboard?: (text: string) => void;
    onSpeak?: (text: string) => void;
    onLike?: (messageId: string) => void;
    onDislike?: (messageId: string) => void;
    onRegenerate?: (messageId: string) => void; // Removido originalText, pois não é usado na regeneração
    isEcoTyping?: boolean; // Nova prop para indicar se a Eco está digitando (pensando)
}

const ChatMessage: React.FC<ChatMessageProps> = ({
    message,
    onCopyToClipboard,
    onSpeak,
    onLike,
    onDislike,
    onRegenerate,
    isEcoTyping,
}) => {
    const isUser = message.sender === 'user';
    const isEco = message.sender === 'eco';

    // Novo: Verifica se a mensagem está no estado de "pensando" (Eco e sem texto)
    const isThinkingState = isEco && isEcoTyping && !message.text;

    return (
        <motion.div
            className={`mb-6 ${isUser ? 'flex justify-end' : 'flex justify-start'} items-center`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            {/* Removed EcoBubble rendering */}
            {/* {isEco && (
                <div className="flex items-center justify-center mr-2">
                    <EcoBubble
                        size="w-8 h-8"
                        isAnimating={isThinkingState}
                    />
                </div>
            )} */}
            <div className="relative">
                <div
                    className={`px-4 py-3 rounded-2xl max-w-[80%] sm:max-w-[60%] md:max-w-[480px] ${
                        isUser
                            ? 'bg-blue-100 text-gray-800 rounded-tr-sm'
                            : 'bg-white text-gray-800 rounded-tl-sm'
                    }
                    ${isThinkingState ? 'min-h-[40px] min-w-[60px] flex items-center justify-center' : ''}
                    `}
                    style={{
                        boxShadow: '0 0 5px rgba(0, 0, 0, 0.05)',
                    }}
                >
                    {isThinkingState ? (
                        // Indicador visual de "pensando" (três pontos pulsando)
                        <div className="flex space-x-1">
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse-dot" style={{ animationDelay: '0s' }}></span>
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse-dot" style={{ animationDelay: '0.2s' }}></span>
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse-dot" style={{ animationDelay: '0.4s' }}></span>
                        </div>
                    ) : (
                        // Conteúdo normal da mensagem ou áudio
                        message.audioUrl && isUser ? ( // Se for user e tiver audioUrl, mostra o botão de play
                            <button
                                onClick={() => onSpeak && onSpeak(message.audioUrl!)} // onSpeak para áudio agora passa a URL
                                className="flex items-center text-blue-600 hover:text-blue-800 transition-colors duration-150"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 9.75l-7.5 7.5-7.5-7.5" />
                                </svg>
                                Ouvir Áudio
                            </button>
                        ) : (
                            <p className="text-sm leading-relaxed break-words">{message.text}</p>
                        )
                    )}
                </div>

                {/* Os botões de ação (copiar, curtir, etc.) devem aparecer APENAS se não estiver no estado de "pensando" */}
                {!isThinkingState && isEco && (
                    <div className={`absolute bottom-[-20px] left-0 flex items-center text-gray-400 text-xs gap-x-1 pr-2`}>
                        {onCopyToClipboard && (
                            <button
                                onClick={() => onCopyToClipboard(message.text)}
                                aria-label="Copiar"
                                className="focus:outline-none p-1 rounded-full hover:bg-gray-100 transition-colors duration-150"
                            >
                                <Copy size={14} strokeWidth={1.5} />
                            </button>
                        )}
                        {onSpeak && message.text && ( // Garante que há texto para falar
                            <button
                                onClick={() => onSpeak(message.text)} // onSpeak para texto da Eco agora passa o texto
                                aria-label="Ouvir"
                                className="focus:outline-none p-1 rounded-full hover:bg-gray-100 transition-colors duration-150"
                            >
                                <Volume2 size={14} strokeWidth={1.5} />
                            </button>
                        )}
                        {onLike && (
                            <button
                                onClick={() => onLike(message.id)}
                                aria-label="Curtir"
                                className="focus:outline-none p-1 rounded-full hover:bg-gray-100 transition-colors duration-150"
                            >
                                <ThumbsUp size={14} strokeWidth={1.5} />
                            </button>
                        )}
                        {onDislike && (
                            <button
                                onClick={() => onDislike(message.id)}
                                aria-label="Descurtir"
                                className="focus:outline-none p-1 rounded-full hover:bg-gray-100 transition-colors duration-150"
                            >
                                <ThumbsDown size={14} strokeWidth={1.5} />
                            </button>
                        )}
                        {onRegenerate && (
                            <button
                                onClick={() => onRegenerate(message.id)}
                                aria-label="Refazer"
                                className="focus:outline-none p-1 rounded-full hover:bg-gray-100 transition-colors duration-150"
                            >
                                <RotateCw size={14} strokeWidth={1.5} />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default ChatMessage;
