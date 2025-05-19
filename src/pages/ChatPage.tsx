import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, BookOpen, List } from 'lucide-react';
import { motion } from 'framer-motion';
import Header from '../components/Header';
import ChatMessage, { Message } from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { enviarMensagemParaEco } from '../api/ecoApi';
import { gerarPromptMestre } from '../utils/generatePrompt.ts';
import TelaDeHistoricoDeMemorias from '../components/TelaDeHistoricoDeMemorias';
import { salvarMemoria } from '../api/memoria';
// import { useSpeechSynthesis } from 'react-speech-kit'; // REMOVA ESTA IMPORTAÇÃO
// import { KokoroTTS } from 'kokoro-js'; // IMPORTA A BIBLIOTECA KOKORO-JS

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
  // const { speak, cancel, speaking, supported } = useSpeechSynthesis(); // REMOVA ESTA IMPORTAÇÃO
  // const [ttsEngine, setTtsEngine] = useState<KokoroTTS | null>(null);
  // const [speaking, setSpeaking] = useState(false);
  // const [currentUtterance, setCurrentUtterance] = useState<string | null>(null);
  // const [speakingSupported, setSpeakingSupported] = useState(false); // Novo estado para indicar suporte TTS
  const [mensagensAnteriores, setMensagensAnteriores] = useState<Message[]>([]);
  const [promptDoSistema, setPromptDoSistema] = useState<string>('');

  useEffect(() => {
    const carregarPrompt = async () => {
      const prompt = await gerarPromptMestre();
      setPromptDoSistema(prompt);
    };

    carregarPrompt();
  }, []);

  useEffect(() => {
    referenciaFinalDasMensagens.current?.scrollIntoView({ behavior: 'smooth' });
    const ultimaEco = mensagens.slice().reverse().find(msg => msg.sender === 'eco');
    setUltimaMensagemEco(ultimaEco || null);
    setMensagensAnteriores(mensagens);
  }, [mensagens]);

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleSpeakMessage = (text: string) => {
    // Lógica de Text-to-Speech será implementada aqui com a nova biblioteca ou API
    alert("Funcionalidade de Text-to-Speech será implementada aqui.");
  };

  const handleStopSpeak = () => {
    // Lógica para interromper a fala
  };

  const handleLikeMessage = (messageId: string) => {
    setFeedback(prev => ({ ...prev, [messageId]: prev[messageId] === 'like' ? null : 'like' }));
    console.log('Mensagem curtida:', messageId);
    // Aqui você chamaria sua API para salvar o feedback
  };

  const handleDislikeMessage = (messageId: string) => {
    setFeedback(prev => ({ ...prev, [messageId]: prev[messageId] === 'dislike' ? null : 'dislike' }));
    console.log('Mensagem descurtida:', messageId);
    // Aqui você chamaria sua API para salvar o feedback
  };

  const handleRegenerateResponse = async (messageId: string) => {
    definirDigitando(true);
    const mensagemOriginalDoUsuario = mensagensAnteriores
      .slice()
      .reverse()
      .find(msg => mensagens.findIndex(m => m.id === msg.id) < mensagens.findIndex(m => m.id === messageId) && msg.sender === 'user')?.text;

    if (mensagemOriginalDoUsuario && promptDoSistema) {
      const mensagensParaEnvio = [
        { role: 'system', content: promptDoSistema },
        { role: 'user', content: mensagemOriginalDoUsuario },
      ];
      try {
        const novaResposta = await enviarMensagemParaEco(mensagensParaEnvio);
        definirMensagens(prevMensagens =>
          prevMensagens.map(msg =>
            msg.id === messageId ? { ...msg, text: novaResposta } : msg
          )
        );
      } catch (error) {
        console.error("Erro ao regenerar resposta:", error);
        // Mostre uma mensagem de erro ao usuário
      } finally {
        definirDigitando(false);
      }
    } else {
      console.warn("Não foi possível encontrar a mensagem original do usuário ou o prompt do sistema.");
      definirDigitando(false);
    }
  };

  const lidarComEnvioDeMensagem = async (texto: string) => {
    const mensagemDoUsuario: Message = { id: Date.now().toString(), text: texto, sender: 'user' };
    definirMensagens((anteriores) => [...anteriores, mensagemDoUsuario]);
    definirDigitando(true);
    setMensagemASalvar(texto);

    if (promptDoSistema) {
      const mensagensParaEnvio = [
        { role: 'system', content: promptDoSistema },
        { role: 'user', content: texto },
      ];

      try {
        const resposta = await enviarMensagemParaEco(mensagensParaEnvio);
        const mensagemDaEco: Message = { id: (Date.now() + 1).toString(), text: resposta, sender: 'eco' };
        definirMensagens((anteriores) => [...anteriores, mensagemDaEco]);
        setUltimaMensagemEco(mensagemDaEco);

        // ... (seu código de análise de sentimento)

      } catch (erro: any) {
        // ... (seu tratamento de erro)
      } finally {
        definirDigitando(false);
      }
    } else {
      console.warn("O prompt do sistema ainda não foi carregado.");
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
          {mensagens.length === 0 && (
            <motion.div
              className="text-center text-gray-600 mb-8 mt-24"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-4xl font-semibold">{mensagemBoasVindasInicial}</h2>
              {/* Você pode adicionar mais texto aqui se quiser */}
            </motion.div>
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