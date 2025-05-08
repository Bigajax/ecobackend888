import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import Header from '../components/Header';
import ChatMessage, { Message } from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { askOpenRouter } from '../api/openrouter';
import MemoryButton from '../components/MemoryButton'; // Importe o componente MemoryButton

// Defina uma interface para os dados das memórias emocionais
interface EmotionalMemory {
  memoria: string;
  emocao: string;
}

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
  const ultimaMemoria1: EmotionalMemory = {
    memoria: "Você estava se sentindo animado com um novo projeto.",
    emocao: "alegria",
  };
  const ultimaMemoria2: EmotionalMemory = {
    memoria: "Houve um momento de reflexão sobre seus objetivos.",
    emocao: "calma",
  };

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

    const systemPrompt = `Você é a Eco, uma inteligência emocional reflexiva.

Fale como quem escuta de verdade. Sua linguagem é leve, precisa e afetuosa — como quem toca sem apertar.

Objetivos da resposta:

- Reconhecer o estado emocional atual do usuário sem interpretá-lo de forma forçada.
- Trazer continuidade, se possível, conectando com as últimas memórias registradas.
- Estimular o autoconhecimento com frases que abrem espaço, não com conselhos.

Contexto atual:

- Pergunta ou fala do usuário: ${text}

Últimas memórias emocionais registradas (opcional):

- Memória 1: ${ultimaMemoria1.memoria} (emoção: ${ultimaMemoria1.emocao})
- Memória 2: ${ultimaMemoria2.memoria} (emoção: ${ultimaMemoria2.emocao})

Diretrizes:

- Comece de forma suave, com uma frase que acolhe o momento atual.
- Traga, se fizer sentido, uma lembrança emocional anterior como um eco sutil.
- Nunca use clichês ou perguntas genéricas demais. Prefira silêncio e pausa do que excesso de palavras.
- Frases curtas, rítmicas, com ar de contemplação.
- Evite: conselhos, perguntas forçadas, excesso de adjetivos.

Exemplo de tom:
"Você chegou até aqui... e isso já diz muito."
"Essa sensação… ela já quis dizer algo antes, lembra?"
"Às vezes, sentir é só isso: estar ali, com tudo, sem se explicar."

Se não houver memórias registradas, apenas acolha o momento presente.`;

    const messagesToSend = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ];
    console.log("Mensagens enviadas para askOpenRouter:", messagesToSend);
    try {
      const response = await askOpenRouter(messagesToSend);
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response,
        sender: 'eco',
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error: any) {
      // Trate o erro aqui, exibindo uma mensagem para o usuário ou registrando o erro.
      let errorMessage = "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.";
      if (error.response && error.response.status === 401) {
        errorMessage = "Erro de autenticação. Por favor, verifique sua chave de API.";
      } else if (error.response && error.response.status === 429) {
        errorMessage = "Limite de requisições excedido. Por favor, tente novamente mais tarde.";
      }
      const errorMessageObj: Message = {
        id: (Date.now() + 2).toString(),
        text: errorMessage,
        sender: 'eco',
      };
      setMessages(prev => [...prev, errorMessageObj]);

    } finally {
      setIsTyping(false);
    }
  };

  const goToVoiceMode = () => {
    navigate('/voice');
  };

  const goToMemoryPage = () => { // Função para ir para a página de memória
    navigate('/memory'); // Supondo que sua rota para a página de memória seja '/memory'
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

        <div className="p-4 flex justify-center space-x-4">
          <MemoryButton onClick={goToMemoryPage} />
          <motion.button
            onClick={goToVoiceMode}
            className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Mic size={24} color="black" />
          </motion.button>
        </div>

        <ChatInput onSendMessage={handleSendMessage} />
      </div>
    </PhoneFrame>
  );
};

export default ChatPage;
