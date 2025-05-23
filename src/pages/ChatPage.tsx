// src/pages/ChatPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { motion } from 'framer-motion';
import Header from '../components/Header';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { enviarMensagemParaEco } from '../api/ecoApi';
import { salvarMemoria } from '../api/memoria';
import { useAuth } from '../contexts/AuthContext';
import { useChat, Message } from '../contexts/ChatContext'; // Importe useChat e Message do ChatContext

const mensagemBoasVindasInicial = 'Como você se sente hoje?';

const ChatPage: React.FC = () => {
  const { messages, addMessage, updateMessage, clearMessages } = useChat(); // Use o contexto aqui
  // Remova a definição de 'mensagens' do useState
  // const [mensagens, definirMensagens] = useState<Message[]>([]);

  const [digitando, definirDigitando] = useState(false);
  const referenciaFinalDasMensagens = useRef<HTMLDivElement>(null);
  const navegar = useNavigate();
  const [mensagemASalvar, setMensagemASalvar] = useState<string | null>(null);
  const [mensagemDeSucesso, setMensagemDeSucesso] = useState<string | null>(null);
  const [ultimaMensagemEco, setUltimaMensagemEco] = useState<Message | null>(null);
  const [ultimaEmocaoDetectada, setUltimaEmocaoDetectada] = useState<string | null>(null); // Certifique-se de que estas variáveis são atualizadas de algum lugar
  const [ultimaIntensidadeDetectada, setUltimaIntensidadeDetectada] = useState<number | null>(null); // Certifique-se de que estas variáveis são atualizadas de algum lugar
  const [feedback, setFeedback] = useState<{ [messageId: string]: 'like' | 'dislike' | null }>({});
  const [erroApi, setErroApi] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    referenciaFinalDasMensagens.current?.scrollIntoView({ behavior: 'smooth' });
    const ultimaEco = messages.slice().reverse().find(msg => msg.sender === 'eco'); // Use messages do contexto
    setUltimaMensagemEco(ultimaEco || null);
  }, [messages]); // Depende das mensagens do contexto

  // Função para carregar mensagens na montagem inicial (se você não estiver usando localStorage no ChatContext)
  // Se estiver usando localStorage no ChatContext, você pode remover este useEffect.
  // No entanto, é bom ter um ponto de partida. Se as mensagens vierem do contexto,
  // elas já estarão lá. Se o contexto for sempre vazio, considere um useEffect para
  // adicionar a mensagem de boas-vindas se 'messages' estiver vazio.
   useEffect(() => {
     if (messages.length === 0) {
       // Opcional: Adicione a mensagem de boas-vindas aqui se o contexto estiver vazio
       // Isso garante que ela apareça mesmo se o usuário retornar à página
       // e o localStorage estiver vazio ou desativado.
       // addMessage({ id: uuidv4(), text: mensagemBoasVindasInicial, sender: 'eco' });
     }
   }, []); // Executa apenas uma vez na montagem inicial

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleSpeakMessage = (text: string) => {
    alert("Funcionalidade de Text-to-Speech será implementada aqui.");
  };

  const handleStopSpeak = () => {
    // Lógica para interromper a fala
  };

  const handleLikeMessage = (messageId: string) => {
    setFeedback(prev => ({ ...prev, [messageId]: prev[messageId] === 'like' ? null : 'like' }));
    console.log('Mensagem curtida:', messageId);
  };

  const handleDislikeMessage = (messageId: string) => {
    setFeedback(prev => ({ ...prev, [messageId]: prev[messageId] === 'dislike' ? null : 'dislike' }));
    console.log('Mensagem descurtida:', messageId);
  };

  const handleRegenerateResponse = async (messageId: string) => {
    definirDigitando(true);
    const indiceMensagemARegenerar = messages.findIndex(msg => msg.id === messageId); // Use messages do contexto
    if (indiceMensagemARegenerar === -1) {
      console.warn("Mensagem a regenerar não encontrada.");
      definirDigitando(false);
      return;
    }

    // O histórico para regenerar deve vir do estado atual do contexto
    const historicoParaRegenerar = messages.slice(0, indiceMensagemARegenerar + 1).filter(msg => msg.sender === 'user' || msg.sender === 'eco');

    const mappedHistory = historicoParaRegenerar.map(msg => ({
      role: msg.sender === 'eco' ? 'assistant' : 'user',
      content: msg.text || ''
    }));

    try {
      const novaResposta = await enviarMensagemParaEco(mappedHistory, "Rafael");
      updateMessage(messageId, novaResposta); // Use a função updateMessage do contexto
      setErroApi(null);
    } catch (error: any) {
      console.error("Erro ao regenerar resposta:", error);
      setErroApi(error.message || "Erro ao tentar regenerar a resposta.");
    } finally {
      definirDigitando(false);
    }
  };


  const lidarComEnvioDeMensagem = async (texto: string) => {
    const mensagemDoUsuario: Message = { id: uuidv4(), text: texto, sender: 'user' };
    addMessage(mensagemDoUsuario); // Adiciona a mensagem do usuário ao contexto
    definirDigitando(true);
    setMensagemASalvar(texto);
    setErroApi(null);

    // O histórico para a API deve vir do estado atual do contexto
    const historicoAtualizado = [...messages, mensagemDoUsuario].map(msg => ({ // Use messages do contexto
      role: msg.sender === 'eco' ? 'assistant' : 'user',
      content: msg.text || ''
    }));

    try {
      const resposta = await enviarMensagemParaEco(historicoAtualizado, "Rafael");

      const mensagemDaEco: Message = { id: uuidv4(), text: resposta, sender: 'eco' };
      addMessage(mensagemDaEco); // Adiciona a mensagem da Eco ao contexto
      setUltimaMensagemEco(mensagemDaEco);
    } catch (erro: any) {
      console.error("Erro ao enviar mensagem para a ECO:", erro);
      setErroApi(erro.message || "Erro ao enviar mensagem.");
    } finally {
      definirDigitando(false);
    }
  };

  const handleOpenMemoryHistory = () => {
    console.log("Abrindo histórico de memórias, navegando para /memory");
    navegar('/memory');
  };

  const handleSaveMemory = async () => {
    if (!user?.id) {
      console.error("Usuário não autenticado para salvar memória.");
      setErroApi("Você precisa estar logado para salvar memórias.");
      return;
    }

    if (!ultimaMensagemEco || !mensagemASalvar) {
      setMensagemDeSucesso("Não há uma conversa recente para salvar como memória.");
      setTimeout(() => setMensagemDeSucesso(null), 3000);
      return;
    }

    try {
      await salvarMemoria({
        usuarioId: user.id,
        mensagemId: ultimaMensagemEco.id,
        resumoEco: ultimaMensagemEco.text || 'Memória sem resumo',
        dataRegistro: new Date().toISOString(),
        emocaoPrincipal: ultimaEmocaoDetectada || 'N/A',
        intensidade: ultimaIntensidadeDetectada || 0,
        contexto: mensagemASalvar,
        salvarMemoria: true,
      });
      setMensagemDeSucesso("Memória salva com sucesso!");
      setTimeout(() => setMensagemDeSucesso(null), 3000);
    } catch (error: any) {
      console.error("Erro ao salvar memória:", error);
      setErroApi(`Erro ao salvar memória: ${error.message}`);
    }
  };

  const irParaModoDeVoz = () => {
    navegar('/voice');
  };

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <Header
        title="ECO"
        showBackButton={false}
        onOpenMemoryHistory={handleOpenMemoryHistory}
        mensagemDeSucesso={mensagemDeSucesso}
      />
      <div className="flex-1 flex overflow-y-auto p-4 flex-col items-center">
        <div className="max-w-2xl w-full md:max-w-md lg:max-w-xl xl:max-w-2xl mx-auto flex flex-col items-center">
          {messages.length === 0 && !erroApi && ( // Use messages do contexto
            <motion.div
              className="text-center text-gray-600 mb-8 mt-24"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-4xl font-semibold">{mensagemBoasVindasInicial}</h2>
            </motion.div>
          )}
          {erroApi && (
            <div className="text-red-500 text-center mb-4">
              Erro: {erroApi}
            </div>
          )}
          <div className="w-full">
            {messages.map((mensagem) => ( // Use messages do contexto
              <ChatMessage
                key={mensagem.id}
                message={mensagem}
                onCopyToClipboard={handleCopyToClipboard}
                onSpeak={handleSpeakMessage}
                onLike={handleLikeMessage}
                onDislike={handleDislikeMessage}
                onRegenerate={mensagem.sender === 'eco' ? () => handleRegenerateResponse(mensagem.id) : undefined}
              />
            ))}
            {digitando && (
              <ChatMessage
                message={{ id: 'digitando', text: 'Digitando...', sender: 'eco' }}
              />
            )}
            <div ref={referenciaFinalDasMensagens} />
          </div>
        </div>
      </div>
      <div className="flex justify-center w-full p-4">
        <div className="max-w-2xl w-full md:max-w-md lg:max-w-xl xl:max-w-2xl mx-auto">
          <ChatInput
            onSendMessage={lidarComEnvioDeMensagem}
            onGoToVoiceMode={irParaModoDeVoz}
            onSaveMemory={handleSaveMemory}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatPage;