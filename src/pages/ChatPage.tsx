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
import { differenceInDays } from 'date-fns';

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

  const gerarMensagemDeRetornoContextual = (memoriaSignificativa: any): string | null => {
    if (!memoriaSignificativa) return null;

    const dataUltima = new Date(memoriaSignificativa.data_registro);
    const hoje = new Date();
    const dias = differenceInDays(hoje, dataUltima);

    if (dias === 0) return null;

    const resumo = memoriaSignificativa.resumo_eco || 'algo não especificado';

    return `O usuário está retornando após ${dias} dias. Na última interação significativa, expressou: "${resumo}". Use isso para adaptar a saudação e refletir o retorno com sensibilidade.`;
  };

  const handleSendMessage = async (text: string) => {
    setDigitando(true);
    setErroApi(null);

    const saudacoesSimples = ['oi', 'olá', 'bom dia', 'boa tarde', 'boa noite'];
    const textoNormalizado = text.trim().toLowerCase();

    const hoje = new Date().toDateString();
    const agora = new Date().toISOString();
    const ultimaInteracao = localStorage.getItem('eco_ultima_interacao');
    const interacaoHoje = ultimaInteracao && new Date(ultimaInteracao).toDateString() === hoje;
    localStorage.setItem('eco_ultima_interacao', agora);

    const mensagensHoje = messages.filter(m =>
      m.sender === 'user' &&
      new Date(m.id ? parseInt(m.id.slice(0, 8), 16) * 1000 : Date.now()).toDateString() === hoje
    );

    const numeroMensagensHoje = mensagensHoje.length;
    let ecoResposta: string | null = null;

    if (saudacoesSimples.includes(textoNormalizado)) {
      if (!interacaoHoje || numeroMensagensHoje === 0) {
        ecoResposta = `Oi, eu sou a Eco. Estou aqui para acolher o que você sente, ${userName}. Podemos explorar juntos — sem pressa, sem destino.`;
      } else if (numeroMensagensHoje === 1) {
        ecoResposta = `Oi de novo, ${userName}. Que bom te encontrar aqui outra vez. Podemos continuar de onde paramos — ou seguir por outro caminho, se preferir.`;
      }

      if (ecoResposta) {
        const id = uuidv4();
        const userMessage: Message = { id, text, sender: 'user' };
        const ecoMessage: Message = { id: uuidv4(), text: ecoResposta, sender: 'eco' };

        addMessage(userMessage);
        addMessage(ecoMessage);
        setDigitando(false);
        return;
      }
    }

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

      const memoriaSignificativa = memorias.find(m => m.intensidade >= 7);
      const retornoContextual = gerarMensagemDeRetornoContextual(memoriaSignificativa);

      const mensagensComContexto = [
        ...(retornoContextual ? [{
          role: 'system',
          content: retornoContextual,
        }] : []),
        ...(contextoMemorias ? [{
          role: 'system',
          content: `Estas são memórias recentes do usuário que podem servir como contexto emocional:\n${contextoMemorias}`,
        }] : []),
        ...history,
      ];

      const mensagensFormatadas = mensagensComContexto.map(m => ({
        role: m.role || (m.sender === 'eco' ? 'assistant' : 'user'),
        content: m.text || m.content || '',
      }));

      const resposta = await enviarMensagemParaEco(mensagensFormatadas, userName, userId!);
      const textoLimpo = resposta.replace(/\{[\s\S]*?\}$/, '').trim();
      const ecoMessage: Message = { id: uuidv4(), text: textoLimpo, sender: 'eco' };
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
