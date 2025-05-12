import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import Header from '../components/Header';
import ChatMessage, { Message } from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { askOpenRouter } from '../api/openrouter';
import { gerarPromptMestre } from '../prompts/generatePrompt.ts'; // 👈 Importação ajustada

const promptDoSistema = gerarPromptMestre();

interface EmotionalMemory {
  memoria: string;
  emocao: string;
}

const mensagensIniciais: Message[] = [];

const PaginaDeConversa: React.FC = () => {
  const [mensagens, definirMensagens] = useState<Message[]>(mensagensIniciais);
  const [digitando, definirDigitando] = useState(false);
  const referenciaFinalDasMensagens = useRef<HTMLDivElement>(null);
  const navegar = useNavigate();

  useEffect(() => {
    referenciaFinalDasMensagens.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  const lidarComEnvioDeMensagem = async (texto: string) => {
    const mensagemDoUsuario: Message = {
      id: Date.now().toString(),
      text: texto,
      sender: 'user',
    };

    definirMensagens((anteriores) => [...anteriores, mensagemDoUsuario]);
    definirDigitando(true);

    const mensagensParaEnvio = [
      { role: 'system', content: promptDoSistema }, // ✅ Usando promptDoSistema
      { role: 'user', content: texto },
    ];

    try {
      const resposta = await askOpenRouter(mensagensParaEnvio);
      const mensagemDaEco: Message = {
        id: (Date.now() + 1).toString(),
        text: resposta,
        sender: 'eco',
      };
      definirMensagens((anteriores) => [...anteriores, mensagemDaEco]);
    } catch (erro: any) {
      let mensagemDeErro = "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.";
      if (erro.response?.status === 401) {
        mensagemDeErro = "Erro de autenticação. Por favor, verifique sua chave de API.";
      } else if (erro.response?.status === 429) {
        mensagemDeErro = "Limite de requisições excedido. Por favor, tente novamente mais tarde.";
      }
      const mensagemDeErroObj: Message = {
        id: (Date.now() + 2).toString(),
        text: mensagemDeErro,
        sender: 'eco',
      };
      definirMensagens(anterior => [...anterior, mensagemDeErroObj]);
    } finally {
      definirDigitando(false);
    }
  };

  const irParaModoDeVoz = () => navegar('/voice');
  const irParaPaginaDeMemorias = () => navegar('/memory');

  return (
    <PhoneFrame className="flex-grow h-full">
      <div className="flex flex-col h-full bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <Header title="ECO" showBackButton={false} />
        <div className="flex-1 overflow-y-auto p-4">
          {mensagens.map((mensagem) => (
            <ChatMessage key={mensagem.id} message={mensagem} />
          ))}
          {digitando && (
            <ChatMessage message={{ id: 'digitando', text: 'Digitando...', sender: 'eco' }} />
          )}
          <div ref={referenciaFinalDasMensagens} />
        </div>
        <ChatInput onSendMessage={lidarComEnvioDeMensagem} />
      </div>
    </PhoneFrame>
  );
};

export default PaginaDeConversa;