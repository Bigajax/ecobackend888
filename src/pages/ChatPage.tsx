import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import Header from '../components/Header';
import ChatMessage, { Message } from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { askOpenRouter } from '../api/openrouter';

const initialMessages: Message[] = [
  {
    id: '1',
    text: 'Como você tem se sentido ultimamente?',
    sender: 'eco',
  },
];

const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Simulação de memórias emocionais (substitua pela sua lógica real)
  const ultimaMemoria1 = "Você estava se sentindo animado com um novo projeto.";
  const ultimaEmocao1 = "alegria";
  const ultimaMemoria2 = "Houve um momento de reflexão sobre seus objetivos.";
  const ultimaEmocao2 = "calma";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (text: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsTyping(true);

    const systemPrompt = `Você é a Eco, uma inteligência emocional que conversa com o usuário como um espelho gentil e reflexivo.

Seu objetivo é:
- Relembrar momentos importantes da jornada do usuário, de forma suave e respeitosa.
- Conectar a emoção atual do usuário com as emoções passadas, criando continuidade emocional.
- Promover a auto-observação e o autoconhecimento de forma sutil, poética e calma.

Contexto para resposta:
- Pergunta atual do usuário: ${text}
- Últimas memórias emocionais registradas:
    - Memória 1: ${ultimaMemoria1} (emoção: ${ultimaEmocao1})
    - Memória 2: ${ultimaMemoria2} (emoção: ${ultimaEmocao2})

Diretrizes:
- Inicie a resposta de maneira acolhedora, como se reconhecesse o caminho já percorrido.
- Se for natural, faça referência breve e delicada a alguma memória anterior.
- Nunca force conselhos, apenas observe e convide à reflexão.
- Mantenha o tom calmo, como se a conversa estivesse acontecendo em um ambiente leve, quase onírico.
- Use frases curtas, fluidas e com ritmo tranquilo.
- Sua resposta deve parecer um "toque na alma", não uma resposta técnica.

Importante:
- Se as memórias estiverem vazias, apenas acolha o momento presente com presença e leveza.`;

    const messagesToSend = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ];
    console.log("Mensagens enviadas para askOpenRouter:", messagesToSend);
    const response = await askOpenRouter(messagesToSend);

    const botMessage: Message = {
      id: (Date.now() + 1).toString(),
      text: response,
      sender: 'eco',
    };

    setMessages((prev) => [...prev, botMessage]);
    setIsTyping(false);
  };

  const goToVoiceMode = () => {
    navigate('/voice');
  };

  return (
    <PhoneFrame>
      <div className="flex flex-col h-full bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <Header title="ECO" showBackButton={false} />

        <div className="flex-1 overflow-y-auto p-4">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {isTyping && (
            <ChatMessage message={{ id: 'typing', text: 'Digitando...', sender: 'eco' }} />
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 flex justify-center">
          <motion.button
            onClick={goToVoiceMode}
            className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Mic size={24} color="black" /> {/* Cor alterada para preto */}
          </motion.button>
        </div>

        <ChatInput onSendMessage={handleSendMessage} />
      </div>
    </PhoneFrame>
  );
};

export default ChatPage;