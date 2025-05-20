// C:\Users\Rafael\Desktop\eco5555\Eco666\src\pages\PaginaDeConversa.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, BookOpen, List } from 'lucide-react';
import { motion } from 'framer-motion';
import Header from '../components/Header';
import ChatMessage, { Message } from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { enviarMensagemParaEco } from '../api/ecoApi';
import { gerarPromptMestre } from '../utils/generatePrompt.ts'; // Importação do gerarPromptMestre
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
  const [erroApi, setErroApi] = useState<string | null>(null); // Novo estado para exibir erros da API

  useEffect(() => {
    const carregarPrompt = async () => {
      try {
        console.log("Frontend: Iniciando carregamento do prompt do sistema..."); // Log de início
        const prompt = await gerarPromptMestre(); // Chama a função para buscar o prompt
        setPromptDoSistema(prompt); // Define o prompt no estado
        setErroApi(null); // Limpa qualquer erro anterior da API
        console.log("Frontend: Prompt do sistema carregado com sucesso!"); // Log de sucesso
      } catch (error: any) {
        console.error("Frontend: Erro ao carregar o prompt do sistema:", error); // Log do erro
        setErroApi(error.message || "Erro ao carregar o prompt inicial."); // Define a mensagem de erro para a UI
        setPromptDoSistema(''); // Garante que o prompt não seja definido com valor inválido
      }
    };

    carregarPrompt();
  }, []); // Executa apenas uma vez no carregamento do componente

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
      try {
        const novaResposta = await enviarMensagemParaEco(
          [{ role: 'system', content: promptDoSistema }, { role: 'user', content: mensagemOriginalDoUsuario }]
        );
        definirMensagens(prevMensagens =>
          prevMensagens.map(msg =>
            msg.id === messageId ? { ...msg, text: novaResposta } : msg
          )
        );
        setErroApi(null); // Limpa o erro se a regeneração for bem-sucedida
      } catch (error: any) {
        console.error("Erro ao regenerar resposta:", error);
        setErroApi(error.message || "Erro ao tentar regenerar a resposta.");
      } finally {
        definirDigitando(false);
      }
    } else {
      console.warn("Não foi possível encontrar a mensagem original do usuário ou o prompt do sistema para regeneração.");
      definirDigitando(false);
    }
  };

  const lidarComEnvioDeMensagem = async (texto: string) => {
    const mensagemDoUsuario: Message = { id: Date.now().toString(), text: texto, sender: 'user' };
    definirMensagens((anteriores) => [...anteriores, mensagemDoUsuario]);
    definirDigitando(true);
    setMensagemASalvar(texto);
    setErroApi(null); // Limpa erros de API ao enviar nova mensagem

    if (promptDoSistema) {
      try {
        const resposta = await enviarMensagemParaEco([{ role: 'system', content: promptDoSistema }, { role: 'user', content: texto }]);
        const mensagemDaEco: Message = { id: (Date.now() + 1).toString(), text: resposta, sender: 'eco' };
        definirMensagens((anteriores) => [...anteriores, mensagemDaEco]);
        setUltimaMensagemEco(mensagemDaEco);
      } catch (erro: any) {
        console.error("Erro ao enviar mensagem para a ECO:", erro);
        setErroApi(erro.message || "Erro ao enviar mensagem."); // Define o erro para a UI
      } finally {
        definirDigitando(false);
      }
    } else {
      console.warn("O prompt do sistema ainda não foi carregado. Não é possível enviar mensagem.");
      setErroApi("Prompt do sistema não carregado. Tente novamente mais tarde."); // Informa o usuário na UI
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
          {mensagens.length === 0 && !erroApi && ( // Exibe a mensagem de boas-vindas apenas se não houver mensagens e nenhum erro de API
            <motion.div
              className="text-center text-gray-600 mb-8 mt-24"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-4xl font-semibold">{mensagemBoasVindasInicial}</h2>
            </motion.div>
          )}
          {erroApi && ( // Exibe a mensagem de erro da API se houver
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