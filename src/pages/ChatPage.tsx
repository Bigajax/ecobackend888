import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { motion } from 'framer-motion';
import Header from '../components/Header';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import EcoBubbleIcon from '../components/EcoBubbleIcon';
import { enviarMensagemParaEco } from '../api/ecoApi';
import { useAuth } from '../contexts/AuthContext';
import { useChat, Message } from '../contexts/ChatContext';

const ChatPage: React.FC = () => {
    const { messages, addMessage, clearMessages } = useChat();
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const [digitando, setDigitando] = useState(false);
    const [erroApi, setErroApi] = useState<string | null>(null);
    const referenciaFinalDasMensagens = useRef<HTMLDivElement>(null);

    const mensagemBoasVindas = user?.full_name ? `Olá, ${user.full_name}!` : 'Olá!';

    useEffect(() => {
        referenciaFinalDasMensagens.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (text: string) => {
        const userMessage: Message = { id: uuidv4(), text, sender: 'user' };
        addMessage(userMessage);
        setDigitando(true);
        setErroApi(null);

        const history = [...messages, userMessage].map(msg => ({
            role: msg.sender === 'eco' ? 'assistant' : 'user',
            content: msg.text || ''
        }));

        try {
            const resposta = await enviarMensagemParaEco(history, user?.full_name || 'Usuário');
            const ecoMessage: Message = { id: uuidv4(), text: resposta, sender: 'eco' };
            addMessage(ecoMessage);
        } catch (error: any) {
            setErroApi(error.message || 'Erro ao enviar mensagem.');
        } finally {
            setDigitando(false);
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
            <Header
                title="ECO"
                showBackButton={false}
                onOpenMemoryHistory={() => {
                    console.log('Abrindo histórico de memórias');
                    navigate('/memory');
                }}
                onLogout={async () => {
                    await logout();
                    clearMessages();
                    navigate('/login');
                }}
            />

            <div className="flex-1 flex overflow-y-auto p-4 flex-col items-center">
                <div className="max-w-2xl w-full flex flex-col items-center">
                    {messages.length === 0 && !erroApi && (
                        <motion.div
                            className="text-center text-gray-600 mb-20 mt-16"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.5 }}
                        >
                            <h2 className="text-4xl font-light text-black">{mensagemBoasVindas}</h2>
                            <p className="text-xl font-light text-black mt-2">Aqui, você se escuta.</p>
                        </motion.div>
                    )}

                    {erroApi && (
                        <div className="text-red-500 text-center mb-4">
                            Erro: {erroApi}
                        </div>
                    )}

                    <div className="w-full space-y-4">
                        {messages.map(mensagem => (
                            <div
                                key={mensagem.id}
                                className={`flex items-start ${
                                    mensagem.sender === 'user' ? 'justify-end' : 'justify-start'
                                }`}
                            >
                                {mensagem.sender === 'eco' && (
                                    <div className="mr-2">
                                        <EcoBubbleIcon />
                                    </div>
                                )}
                                <ChatMessage message={mensagem} />
                            </div>
                        ))}

                        {digitando && (
                            <div className="flex items-start justify-start">
                                <div className="mr-2">
                                    <EcoBubbleIcon />
                                </div>
                                <ChatMessage
                                    message={{ id: 'typing', text: '...', sender: 'eco' }}
                                    isEcoTyping={true}
                                />
                            </div>
                        )}

                        <div ref={referenciaFinalDasMensagens} />
                    </div>
                </div>
            </div>

            <div className="flex justify-center w-full p-4">
                <div className="max-w-2xl w-full">
                    <ChatInput
                        onSendMessage={handleSendMessage}
                        onMoreOptionSelected={(option) => {
                            if (option === 'go_to_voice_page') {
                                navigate('/voice');
                            }
                        }}
                        onSendAudio={() => console.log('Áudio enviado')}
                    />
                </div>
            </div>
        </div>
    );
};

export default ChatPage;
