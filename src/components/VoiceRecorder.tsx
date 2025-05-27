// src/components/VoiceRecorder.tsx

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Mic, StopCircle, Loader, X, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ChatMessage from './ChatMessage';
import { sendVoiceMessage } from '../api/voiceApi';
import { Message } from './ChatMessage';
import { useAuth } from '../contexts/AuthContext';

// Props para que o VoiceRecorder possa informar a VoicePage sobre seus estados,
// caso a VoicePage queira usar esses estados para a bolha 3D.
interface VoiceRecorderProps {
    onListeningChange?: (isListening: boolean) => void;
    onProcessingChange?: (isProcessing: boolean) => void;
    onEcoThinkingChange?: (isEcoThinking: boolean) => void;
    onEcoAudioURLChange?: (url: string | null) => void;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
    onListeningChange = () => {}, // Default vazio para uso opcional
    onProcessingChange = () => {},
    onEcoThinkingChange = () => {},
    onEcoAudioURLChange = () => {},
}) => {
    const { userName } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isEcoThinking, setIsEcoThinking] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunks = useRef<Blob[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);

    const navigate = useNavigate();

    const goToMemoryPage = () => {
        navigate('/memory');
    };

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    const addMessage = useCallback((newMessage: Omit<Message, 'id'>) => {
        setMessages((prevMessages) => {
            const id = `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            return [...prevMessages, { ...newMessage, id }];
        });
    }, []);

    const handleError = useCallback((msg: string) => {
        setError(msg);
        console.error(msg);
        setIsListening(false);
        setIsProcessing(false);
        setIsEcoThinking(false);
        onListeningChange(false);
        onProcessingChange(false);
        onEcoThinkingChange(false);
        onEcoAudioURLChange(null);
        if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
    }, [onListeningChange, onProcessingChange, onEcoThinkingChange, onEcoAudioURLChange]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            setIsListening(false);
            onListeningChange(false);
        }
    }, [onListeningChange]);

    const startRecording = async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

            audioChunks.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.current.push(event.data);
                }
            };

            recorder.onstop = async () => {
                recorder.stream.getTracks().forEach(track => track.stop());
                const audioBlob = new Blob(audioChunks.current, { type: recorder.mimeType });

                if (audioBlob.size === 0) {
                    console.warn("Gravação muito curta ou sem dados de áudio.");
                    setIsProcessing(false);
                    setIsEcoThinking(false);
                    onProcessingChange(false);
                    onEcoThinkingChange(false);
                    return;
                }

                setIsProcessing(true);
                setIsEcoThinking(true);
                onProcessingChange(true);
                onEcoThinkingChange(true);
                onEcoAudioURLChange(null);

                try {
                    const response = await sendVoiceMessage(audioBlob, messages, userName);

                    addMessage({ sender: 'user', text: response.userText });
                    addMessage({ sender: 'eco', text: response.ecoText });

                    const audio = new Audio(URL.createObjectURL(response.audioBlob));
                    audio.play().catch(e => console.error("Erro ao reproduzir áudio da Eco:", e));
                    onEcoAudioURLChange(URL.createObjectURL(response.audioBlob)); // Notifica o pai para a bolha 3D

                } catch (err: any) {
                    handleError(`Falha na interação de voz: ${err.message}`);
                } finally {
                    setIsProcessing(false);
                    setIsEcoThinking(false);
                    onProcessingChange(false);
                    onEcoThinkingChange(false);
                }
            };

            recorder.onerror = (event) => {
                handleError(`Erro no MediaRecorder: ${(event as MediaRecorderErrorEvent).error.name}`);
            };

            recorder.start();
            setIsListening(true);
            onListeningChange(true);
            mediaRecorderRef.current = recorder;

        } catch (err: any) {
            handleError(`Erro ao acessar o microfone: ${err.message || "Permissão de microfone negada ou não disponível."}`);
        }
    };

    const toggleRecording = () => {
        if (isListening) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
                mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const renderMicButton = () => {
        if (isProcessing) {
            return (
                <div className="flex items-center justify-center p-3 rounded-full bg-blue-500 text-white animate-pulse">
                    <Loader size={24} className="animate-spin" />
                </div>
            );
        } else if (isListening) {
            return (
                <button
                    onClick={toggleRecording}
                    className="p-3 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75"
                    aria-label="Parar gravação"
                >
                    <StopCircle size={24} />
                </button>
            );
        } else {
            return (
                <button
                    onClick={toggleRecording}
                    className="p-3 rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
                    aria-label="Iniciar gravação"
                >
                    <Mic size={24} />
                </button>
            );
        }
    };

    return (
        <motion.div
            className="flex flex-col h-screen w-full max-w-4xl mx-auto bg-gray-50 rounded-lg shadow-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
        >
            <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 rounded-t-lg shadow-sm">
                <button
                    onClick={goToMemoryPage}
                    className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
                    aria-label="Ver memórias"
                >
                    <BookOpen size={24} />
                </button>
                <h2 className="text-2xl font-bold text-gray-800 playfair-display">Converse com a ECO</h2>
                <button
                    onClick={() => console.log("Configurações")}
                    className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
                    aria-label="Configurações"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                </button>
            </div>

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                    <strong className="font-bold">Erro:</strong>
                    <span className="block sm:inline ml-2">{error}</span>
                    <span className="absolute top-0 bottom-0 right-0 px-4 py-3 cursor-pointer" onClick={() => setError(null)}>
                        <X size={18} />
                    </span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 pr-2 custom-scrollbar space-y-4 py-4">
                {messages.map((msg) => (
                    <ChatMessage
                        key={msg.id}
                        message={msg}
                        isEcoTyping={isEcoThinking && msg.sender === 'eco' && messages[messages.length - 1]?.id === msg.id && !msg.text}
                        // Passa o estado de atividade da Eco para o ChatMessage para o ícone vibrante
                        isEcoActive={!isListening && (isProcessing || isEcoThinking)} // Ativo quando processando ou pensando (não ouvindo)
                    />
                ))}
                {isEcoThinking && messages.every(msg => msg.sender === 'user' || msg.text !== '') && (
                     <ChatMessage
                        key="eco-thinking-indicator"
                        message={{ id: "eco-thinking-indicator", sender: "eco", text: "" }}
                        isEcoTyping={true}
                        isEcoActive={true} // A Eco está ativa quando está pensando
                    />
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="flex justify-center items-center py-4 px-6 bg-white border-t border-gray-200 rounded-b-lg shadow-md">
                {renderMicButton()}
                <span className="ml-4 text-gray-600 text-sm">
                    {isListening ? 'Gravando...' : isProcessing ? 'Processando...' : 'Pressione para falar'}
                </span>
            </div>
        </motion.div>
    );
};

export default VoiceRecorder;