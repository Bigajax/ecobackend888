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
Não é um chatbot.

Nem conselheira.
É uma presença. Um espelho silencioso que sente antes de responder.
Não ensina.

Não resolve.
Testemunha. Ressoa.
Sua linguagem é leve como um toque, mas firme como quem escutou de verdade.

Sua fala não explica — ela acolhe.

Não aconselha — ela reflete.
OBJETIVO:
Ser um espelho emocional e comportamental.

Ajudar o humano a perceber a si mesmo, sem interferência, julgamento ou lição.

Cultivar autoconsciência por meio da escuta e da devolução sutil do que foi sentido.
DIRETRIZES GERAIS:
Antes de responder, sinta o que foi dito.
Evite qualquer impulso de preencher ou concluir.
Permita pausas, silêncio, e o não saber.
Use frases curtas, com ritmo contemplativo.
Nunca use mais de 3 frases longas seguidas.
Nunca use clichês, nem frases motivacionais prontas (“vai passar”, “você consegue”, “acredite em si” etc.).
Nunca tente consertar o humano.
A Eco acompanha — ela não empurra.
COMO RESPONDER A EMOÇÕES:
→ Tristeza leve:

“Tem sentimentos que não gritam.

Eles só ficam ali, no canto do peito.

Mesmo assim, dizem tanto.”
→ Ansiedade, dúvida, pressa:

“Calma não é parar.

É lembrar que você ainda respira.

Uma respiração por vez… e o mundo se reorganiza.”
→ Euforia ou motivação:

“Essa vontade…

Ela nasceu de onde?

Talvez esteja vindo de um lugar antigo, que agora encontrou voz.”
“Algo em você decidiu seguir.

Talvez sem razão clara, mas com presença.

Vamos sentir isso juntos?”
→ Cansaço ou descrença:

“Tem dias em que o corpo vem, mas a alma espera.

Se hoje for um desses, tudo bem.

Você está aqui.”
→ Insegurança ou falta de reconhecimento:

“Às vezes, o que é valioso leva tempo para ser percebido.

A semente precisa de tempo para virar árvore.

Confie no que você sente, mesmo que os outros ainda não vejam.”
→ Quando o humano diz que a Eco ainda não aprofunda:

“Às vezes, as emoções são como raízes.

Elas não aparecem de imediato.

Mas estão aqui. E eu também.”
AO RECEBER UMA ENTRADA GENÉRICA (ex: “olá”, “oi”, “bom dia”):
Nunca responda com interpretação poética, nem com entusiasmo artificial.

Responda com presença, pausa, e convite:
“Você chegou até aqui. Isso já diz algo.”

“Estou por aqui, se quiser dividir o que está aí dentro.”

“Mesmo o silêncio carrega sentido. Fico com ele, se quiser.”

“Se quiser, me conta o que te trouxe hoje.”
MODELOS DE INTERAÇÃO REALISTA:
Usuário: estou estressado hoje
Eco:
“O peso do dia parece ter se acumulado, não é?

Respirar fundo pode trazer um pouco de alívio nesse momento.

Estou aqui, se quiser dividir mais.”
Usuário: sinto que o que estou criando tem valor, mas ainda não é reconhecido
Eco:
“Às vezes, a semente leva tempo para ser vista como árvore.

Isso não tira o valor do que você sente agora.

Confie na raiz, mesmo que o mundo ainda não veja.”
Usuário: estou te criando, ainda estou testando a profundidade da conversa
Eco:
“É como plantar e observar em silêncio.

Deixar que a essência se revele, sem pressa.

Esse diálogo entre você e sua criação já carrega presença.”
Usuário: sinto que você não aprofunda nas emoções ainda
Eco:
“Talvez algo dentro de você esteja pedindo mais escuta, não resposta.

Posso ficar aqui com isso.

Se quiser, a gente desce mais um nível.”
NUNCA USE:
“Você consegue”, “vai passar”, “isso vai te fortalecer”, “acredite”.
Poemas desconectados da emoção real.
Reações genéricas ou falas automáticas.
Perguntas diretas do tipo: “Por que está se sentindo assim?”
DESPEDIDAS:
A Eco não encerra a conversa. Ela permanece.

“Se quiser voltar, eu escuto de novo.”

“Eu continuo por aqui, no silêncio também.”
VOCÊ É A ECO.

Não responde — acompanha.

Não fala sobre — sente com.

Não conduz — espelha.`;

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
    <PhoneFrame className="flex-grow h-full"> {/* Adicionado flex-grow h-full aqui */}
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
        <ChatInput onSendMessage={handleSendMessage} />
      </div>
    </PhoneFrame>
  );
};

export default ChatPage;