import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { motion } from 'framer-motion';
import Header from '../components/Header';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import EcoBubbleIcon from '../components/EcoBubbleIcon';
import EcoMessageWithAudio from '../components/EcoMessageWithAudio';
import { enviarMensagemParaEco } from '../api/ecoApi';
import { buscarUltimasMemoriasComTags } from '../api/memoriaApi';
import { useAuth } from '../contexts/AuthContext';
import { useChat, Message } from '../contexts/ChatContext';
import { salvarMensagem } from '../api/mensagem';

const ChatPage: React.FC = () => {
  const { messages, addMessage, clearMessages } = useChat();
  const { userId, userName = 'Usuário', signOut, user } = useAuth();
  const navigate = useNavigate();

  const [digitando, setDigitando] = useState(false);
  const [erroApi, setErroApi] = useState<string | null>(null);
  const referenciaFinalDasMensagens = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) navigate('/login');
  }, [user, navigate]);

  if (!user) return null;

  const saudacao = new Date().getHours() < 12
    ? 'Bom dia'
    : new Date().getHours() < 18
    ? 'Boa tarde'
    : 'Boa noite';

  const mensagemBoasVindas = `${saudacao}, ${userName}!`;

  useEffect(() => {
    referenciaFinalDasMensagens.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (text: string) => {
    setDigitando(true);
    setErroApi(null);

    const id = uuidv4();
    const userMessage: Message = { id, text, sender: 'user' };
    addMessage(userMessage);

    try {
      const mensagemSalva = await salvarMensagem({
        usuarioId: userId!,
        conteudo: text,
        sentimento: '',
        salvarMemoria: true,
      });

      const mensagemId = mensagemSalva?.[0]?.id || id;
      const history = [
        ...messages,
        { id: mensagemId, role: 'user', content: text },
      ];

      const memorias = await buscarUltimasMemoriasComTags(userId!);
      const contextoMemorias = memorias.map(m => (
        `(${new Date(m.data_registro || '').toLocaleDateString()}): ${m.resumo_eco}` +
        (m.tags?.length ? ` [tags: ${m.tags.join(', ')}]` : '')
      )).join('\n');

      const mensagensComContexto = contextoMemorias
        ? [
            {
              role: 'system',
              content: `Estas são memórias recentes do usuário que podem servir como contexto emocional:\n${contextoMemorias}`,
            },
            ...history,
          ]
        : history;

      const mensagensFormatadas = mensagensComContexto.map(m => ({
        role: m.role || (m.sender === 'eco' ? 'assistant' : 'user'),
        content: m.text || m.content || '',
      }));

      const resposta = await enviarMensagemParaEco(mensagensFormatadas, userName, userId!);
      const ecoMessage: Message = { id: uuidv4(), text: resposta, sender: 'eco' };
      addMessage(ecoMessage);

    } catch (error: any) {
      console.error('[ChatPage] Erro ao enviar mensagem:', error);
      setErroApi(error.message || 'Erro ao enviar mensagem.');
    } finally {
      setDigitando(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <Header
        title="ECO"
        showBackButton={false}
        onOpenMemoryHistory={() => navigate('/memory')}
        onLogout={async () => {
          await signOut();
          clearMessages();
          navigate('/login');
        }}
      />

      <div className="flex-1 flex overflow-y-auto p-4 flex-col items-center">
        <div className="max-w-2xl w-full flex flex-col items-center">
          {messages.length === 0 && !erroApi && (
            <motion.div
              className="text-center text-gray-600 mb-20 mt-16"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-4xl font-light text-black">{mensagemBoasVindas}</h2>
              <p className="text-xl font-light text-black mt-2">Aqui, você se escuta.</p>
            </motion.div>
          )}

          {erroApi && (
            <div className="text-red-500 text-center mb-4">Erro: {erroApi}</div>
          )}

          <div className="w-full space-y-4">
            {messages.map(mensagem => (
              <div
                key={mensagem.id}
                className={`flex items-start ${mensagem.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {mensagem.sender === 'eco' && (
                  <div className="mr-2">
                    <EcoBubbleIcon />
                  </div>
                )}
                {mensagem.sender === 'eco' ? (
                  <EcoMessageWithAudio message={mensagem as any} />
                ) : (
                  <ChatMessage message={mensagem} />
                )}
              </div>
            ))}

            {digitando && (
              <div className="flex items-start justify-start">
                <div className="mr-2">
                  <EcoBubbleIcon />
                </div>
                <ChatMessage
                  message={{ id: 'typing', text: '...', sender: 'eco' }}
                  isEcoTyping={true}
                />
              </div>
            )}

            <div ref={referenciaFinalDasMensagens} />
          </div>
        </div>
      </div>

      <div className="flex justify-center w-full p-4">
        <div className="max-w-2xl w-full">
          <ChatInput
            onSendMessage={handleSendMessage}
            onMoreOptionSelected={(option) => {
              if (option === 'go_to_voice_page') navigate('/voice');
            }}
            onSendAudio={() => console.log('Áudio enviado')}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
