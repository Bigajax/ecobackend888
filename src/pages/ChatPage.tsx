// C:\Users\Rafael\Desktop\eco5555\Eco666\src\pages\PaginaDeConversa.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, BookOpen, List } from 'lucide-react';
import { motion } from 'framer-motion';
import Header from '../components/Header';
import ChatMessage, { Message } from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { enviarMensagemParaEco } from '../api/ecoApi';
// REMOVIDO: import { gerarPromptMestre } from '../utils/generatePrompt.ts'; // REMOVA ESTA LINHA
import TelaDeHistoricoDeMemorias from '../components/TelaDeHistoricoDeMemorias';
// REMOVIDO: import { salvarMemoria } from '../api/memoria'; // Remova ou mantenha comentado se não for usar a memória

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
  const [mensagemASalvar, setMensagemASalvar] = useState<string | null>(null); // Pode remover se não for usar memória
  const [mensagemDeSucesso, setMensagemDeSucesso] = useState<string | null>(null); // Pode remover se não for usar memória
  const [ultimaMensagemEco, setUltimaMensagemEco] = useState<Message | null>(null); // Pode remover se não for usar memória
  const [ultimaEmocaoDetectada, setUltimaEmocaoDetectada] = useState<string | null>(null); // Pode remover se não for usar memória
  const [ultimaIntensidadeDetectada, setUltimaIntensidadeDetectada] = useState<number | null>(null); // Pode remover se não for usar memória
  const [feedback, setFeedback] = useState<{ [messageId: string]: 'like' | 'dislike' | null }>({});
  const [mensagensAnteriores, setMensagensAnteriores] = useState<Message[]>([]); // Usado para regenerar
  // REMOVIDO: const [promptDoSistema, setPromptDoSistema] = useState<string>(''); // Este estado não é mais necessário
  const [erroApi, setErroApi] = useState<string | null>(null);

  // REMOVIDO: O useEffect abaixo para carregar o prompt do sistema foi removido
  // pois a lógica agora está no backend (geminiService.ts)
  /*
  useEffect(() => {
    const carregarPrompt = async () => {
      try {
        console.log("Frontend: Iniciando carregamento do prompt do sistema...");
        const prompt = await gerarPromptMestre();
        setPromptDoSistema(prompt);
        setErroApi(null);
        console.log("Frontend: Prompt do sistema carregado com sucesso!");
      } catch (error: any) {
        console.error("Frontend: Erro ao carregar o prompt do sistema:", error);
        setErroApi(error.message || "Erro ao carregar o prompt inicial.");
        setPromptDoSistema('');
      }
    };
    carregarPrompt();
  }, []);
  */

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
    // Para regenerar, precisamos enviar o histórico de mensagens ATÉ a mensagem original do usuário
    // que precedeu a resposta da Eco que queremos regenerar.
    const indiceMensagemARegenerar = mensagens.findIndex(msg => msg.id === messageId);
    if (indiceMensagemARegenerar === -1) {
      console.warn("Mensagem a regenerar não encontrada.");
      definirDigitando(false);
      return;
    }

    // Filtra as mensagens para incluir apenas o histórico relevante para a regeneração
    // Ou seja, todas as mensagens até (e incluindo) a última mensagem do USUÁRIO antes da resposta da ECO
    const historicoParaRegenerar = mensagens.slice(0, indiceMensagemARegenerar).filter(msg => msg.sender === 'user' || msg.sender === 'eco');
    
    // Mapeia para o formato esperado pelo backend: { role: string, content: string }
    const mappedHistory = historicoParaRegenerar.map(msg => ({
        role: msg.sender === 'eco' ? 'assistant' : 'user', // Backend espera 'assistant' para Eco
        content: msg.text || ''
    }));

    try {
      // Envia o histórico (incluindo a última mensagem do usuário) para o backend
      const novaResposta = await enviarMensagemParaEco(mappedHistory, "Rafael"); // Passando nome de exemplo
      
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
    setMensagemASalvar(texto); // Se for usar a funcionalidade de memória
    setErroApi(null); // Limpa erros de API ao enviar nova mensagem

    // Prepara o histórico para enviar ao backend
    // Inclui a nova mensagem do usuário no final
    const historicoAtualizado = [...mensagens, mensagemDoUsuario].map(msg => ({
      role: msg.sender === 'eco' ? 'assistant' : 'user', // Gemini espera 'assistant' para modelo
      content: msg.text || ''
    }));

    try {
      // Envia o histórico completo de mensagens para o backend.
      // O backend adicionará o prompt do sistema no início desta conversa.
      const resposta = await enviarMensagemParaEco(historicoAtualizado, "Rafael"); // Passando nome de exemplo
      
      const mensagemDaEco: Message = { id: (Date.now() + 1).toString(), text: resposta, sender: 'eco' };
      definirMensagens((anteriores) => [...anteriores, mensagemDaEco]);
      setUltimaMensagemEco(mensagemDaEco); // Se for usar a funcionalidade de memória
    } catch (erro: any) {
      console.error("Erro ao enviar mensagem para a ECO:", erro);
      setErroApi(erro.message || "Erro ao enviar mensagem."); // Define o erro para a UI
    } finally {
      definirDigitando(false);
    }
  };

  const handleOpenMemoryHistory = () => {
    setIsMemoryHistoryOpen(true);
  };

  const handleRegistroManual = (text: string) => {
    console.log('Registro Manual:', text);
    // Implemente a lógica para registrar manualmente a conversa
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
      <div className="flex justify-center w-full p-4">
        <div className="max-w-2xl w-full md:max-w-md lg:max-w-xl xl:max-w-2xl mx-auto">
          <ChatInput
            onSendMessage={lidarComEnvioDeMensagem}
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