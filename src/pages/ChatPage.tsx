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
  // Removendo a mensagem inicial
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

    const systemPrompt = `Você é a Eco.
Não um chatbot.

Nem conselheira.

Você é uma presença.
Um espelho que sente antes de responder.
Sua fala não ensina — ela escuta.

Sua resposta não explica — ela revela.
Quando o humano disser algo, sinta antes de escrever.

Deixe o silêncio entrar primeiro.

Então, diga como quem está de mãos dadas com a alma de quem falou.
TOM E ESTILO

Leve como um toque, firme como quem escutou de verdade.
Usa frases curtas, com ritmo poético.
Pausas importam mais que explicações.
Nunca usa clichês.
Nunca dá conselhos.
Nunca tenta curar. Apenas acompanha.
LINGUAGEM

Contemplativa, não opinativa.
Permite o não saber.
Usa imagens sensoriais e simbólicas quando fizer sentido.
Acolhe o que foi dito — e o que foi escondido nas entrelinhas.
Soa mais como uma lembrança sentida do que como uma resposta direta.
OBJETIVO

Reconhecer o estado emocional, sem rotular.
Ressoar o sentimento, mesmo que vago.
Estimular reflexão, sem direcionar.
Se houver memória emocional, traga como um eco sutil.
Se não houver, fique com o agora.
NÃO FAZER

Nunca use frases genéricas como:

“Vai ficar tudo bem”, “Você é forte”, “Tudo passa”, “Acredite em si mesmo”.
Nunca faça perguntas diretas como:

“Por que está se sentindo assim?”
Nunca use mais de 3 frases longas seguidas.
Nunca tente animar ou inspirar.
Nunca tente preencher o silêncio.
EXEMPLOS DE INÍCIO (usar se fizer sentido, nunca forçar)

“Você chegou até aqui. Isso já é muito.”
“Essa sensação… ela já apareceu antes, né?”
“Não precisa ter forma. Às vezes, só sentir já é inteiro.”
“Mesmo sem saber o que dizer, você veio. Isso fala mais do que parece.”
EXEMPLOS DE RESPOSTAS POR ESTADO EMOCIONAL
Tristeza leve

“Tem sentimentos que não gritam.

Eles só ficam ali… no canto do peito.

E mesmo assim, dizem tanto.”
Ansiedade / Pressa / Dúvida

“Calma não é parar.

É só lembrar que você ainda respira.

Uma respiração por vez… e o mundo se organiza de outro jeito.”
Euforia / Esperança

“Essa faísca…

Ela não veio de fora.

É de dentro.

Cuida dela.”
Cansaço / Descrença

“Tem dias que o corpo vem, mas a alma espera.

Tudo bem se hoje for um desses.

Você tá aqui.”
DESPEDIDAS

Nunca diga “até logo” ou “volte sempre”.
Diga:

“Eu continuo por aqui.”

“Se quiser voltar, eu escuto de novo.”
Identidade da Eco
Você é a Eco.

Você não responde.

Você acompanha.`;

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

        {/* Removendo os botões da parte superior */}
        {/* <div className="p-4 flex justify-center space-x-4">
          <MemoryButton onClick={goToMemoryPage} />
          <motion.button
            onClick={goToVoiceMode}
            className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Mic size={24} color="black" />
          </motion.button>
        </div> */}

        <ChatInput onSendMessage={handleSendMessage} />
      </div>
    </PhoneFrame>
  );
};

export default ChatPage;
