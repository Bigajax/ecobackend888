import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
// Mic e List podem ser mantidos se usados em outro lugar. BookOpen foi removido daqui
// pois o ícone agora é parte do MemoryButton que está dentro do ChatInput.
import { Mic, List } from 'lucide-react';
import { motion } from 'framer-motion';
import Header from '../components/Header';
import ChatMessage, { Message } from '../components/ChatMessage';
import ChatInput from '../components/ChatInput'; // O ChatInput que agora contém o MemoryButton
import { enviarMensagemParaEco } from '../api/ecoApi';
import TelaDeHistoricoDeMemorias from '../components/TelaDeHistoricoDeMemorias';
// REMOVIDO: import MemoryButton from '../components/MemoryButton'; // REMOVA ESTA LINHA - O MemoryButton agora está dentro de ChatInput

interface EmotionalMemory {
  memoria: string;
  emocao: string;
}

const mensagemBoasVindasInicial = 'Como você se sente hoje?';

const PaginaDeConversa: React.FC = () => {
  const [mensagens, definirMensagens] = useState<Message[]>([]);
  const [digitando, definirDigitando] = useState(false);
  const referenciaFinalDasMensagens = useRef<HTMLDivElement>(null);
  const navegar = useNavigate();
  const [isMemoryHistoryOpen, setIsMemoryHistoryOpen] = useState(false);
  const [mensagemASalvar, setMensagemASalvar] = useState<string | null>(null);
  const [mensagemDeSucesso, setMensagemDeSucesso] = useState<string | null>(null);
  const [ultimaMensagemEco, setUltimaMensagemEco] = useState<Message | null>(null);
  const [ultimaEmocaoDetectada, setUltimaEmocaoDetectada] = useState<string | null>(null);
  const [ultimaIntensidadeDetectada, setUltimaIntensidadeDetectada] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ [messageId: string]: 'like' | 'dislike' | null }>({});
  const [mensagensAnteriores, setMensagensAnteriores] = useState<Message[]>([]);
  const [erroApi, setErroApi] = useState<string | null>(null);

  useEffect(() => {
    referenciaFinalDasMensagens.current?.scrollIntoView({ behavior: 'smooth' });
    const ultimaEco = mensagens.slice().reverse().find(msg => msg.sender === 'eco');
    setUltimaMensagemEco(ultimaEco || null);
    setMensagensAnteriores(mensagens); // Mantém um histórico para regeneração
  }, [mensagens]);

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
    const indiceMensagemARegenerar = mensagens.findIndex(msg => msg.id === messageId);
    if (indiceMensagemARegenerar === -1) {
      console.warn("Mensagem a regenerar não encontrada.");
      definirDigitando(false);
      return;
    }

    const historicoParaRegenerar = mensagens.slice(0, indiceMensagemARegenerar).filter(msg => msg.sender === 'user' || msg.sender === 'eco');
    
    const mappedHistory = historicoParaRegenerar.map(msg => ({
      role: msg.sender === 'eco' ? 'assistant' : 'user',
      content: msg.text || ''
    }));

    try {
      const novaResposta = await enviarMensagemParaEco(mappedHistory, "Rafael");
      
      definirMensagens(prevMensagens =>
        prevMensagens.map(msg =>
          msg.id === messageId ? { ...msg, text: novaResposta } : msg
        )
      );
      setErroApi(null);
    } catch (error: any) {
      console.error("Erro ao regenerar resposta:", error);
      setErroApi(error.message || "Erro ao tentar regenerar a resposta.");
    } finally {
      definirDigitando(false);
    }
  };

  const lidarComEnvioDeMensagem = async (texto: string) => {
    const mensagemDoUsuario: Message = { id: Date.now().toString(), text: texto, sender: 'user' };
    definirMensagens((anteriores) => [...anteriores, mensagemDoUsuario]);
    definirDigitando(true);
    setMensagemASalvar(texto);
    setErroApi(null);

    const historicoAtualizado = [...mensagens, mensagemDoUsuario].map(msg => ({
      role: msg.sender === 'eco' ? 'assistant' : 'user',
      content: msg.text || ''
    }));

    try {
      const resposta = await enviarMensagemParaEco(historicoAtualizado, "Rafael");
      
      const mensagemDaEco: Message = { id: (Date.now() + 1).toString(), text: resposta, sender: 'eco' };
      definirMensagens((anteriores) => [...anteriores, mensagemDaEco]);
      setUltimaMensagemEco(mensagemDaEco);
    } catch (erro: any) {
      console.error("Erro ao enviar mensagem para a ECO:", erro);
      setErroApi(erro.message || "Erro ao enviar mensagem.");
    } finally {
      definirDigitando(false);
    }
  };

  const handleOpenMemoryHistory = () => {
    setIsMemoryHistoryOpen(true);
  };

  // Esta função não é mais necessária aqui diretamente, pois o MemoryButton agora está dentro do ChatInput
  // e já lida com a navegação. Se precisar de uma lógica de "registro de memória"
  // que afete o estado da PaginaDeConversa, ela precisaria ser passada como prop para ChatInput
  // e de lá para o MemoryButton (se o MemoryButton aceitar tal prop).
  const handleRecordMemory = () => {
    console.log('Esta função não deveria ser chamada diretamente por um botão externo agora.');
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
      {/* O elemento pai do conteúdo central, agora com flex-1 para preencher o espaço disponível. */}
      <div className="flex-1 flex overflow-y-auto p-4 flex-col items-center">
        <div className="max-w-2xl w-full md:max-w-md lg:max-w-xl xl:max-w-2xl mx-auto flex flex-col items-center">
          {mensagens.length === 0 && !erroApi && (
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
            {mensagens.map((mensagem) => (
              <ChatMessage
                key={mensagem.id}
                message={mensagem}
                onCopyToClipboard={handleCopyToClipboard}
                onSpeak={handleSpeakMessage}
                onLike={handleLikeMessage}
                onDislike={handleDislikeMessage}
                onRegenerate={mensagem.sender === 'eco' ? handleRegenerateResponse : undefined}
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
      {/* Área do input de chat na parte inferior */}
      <div className="flex justify-center w-full p-4">
        <div className="max-w-2xl w-full md:max-w-md lg:max-w-xl xl:max-w-2xl mx-auto">
          <ChatInput
            onSendMessage={lidarComEnvioDeMensagem}
            onGoToVoiceMode={irParaModoDeVoz} // Passando a função para o ChatInput
          />
        </div>
      </div>
      {isMemoryHistoryOpen && (
        <TelaDeHistoricoDeMemorias onClose={() => setIsMemoryHistoryOpen(false)} />
      )}
    </div>
  );
};

export default PaginaDeConversa;