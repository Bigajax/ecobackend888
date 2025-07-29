/* -------------------------------------------------------------------------- */
/*  ChatPage.tsx — versão com memórias semelhantes via embeddings             */
/* -------------------------------------------------------------------------- */

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
import {
  buscarUltimasMemoriasComTags,
  buscarMemoriasSimilares,
} from '../api/memoriaApi';

import { useAuth } from '../contexts/AuthContext';
import { useChat, Message } from '../contexts/ChatContext';
import { salvarMensagem } from '../api/mensagem';

import { differenceInDays } from 'date-fns';
import { extrairTagsRelevantes } from '../utils/extrairTagsRelevantes';
import mixpanel from '../lib/mixpanel';


/* -------------------------------------------------------------------------- */
/*  Componente                                                                */
/* -------------------------------------------------------------------------- */
const ChatPage: React.FC = () => {
  const { messages, addMessage, clearMessages } = useChat();
  const { userId, userName = 'Usuário', signOut, user } = useAuth();
  const navigate = useNavigate();

  const [digitando, setDigitando] = useState(false);
  const [erroApi, setErroApi] = useState<string | null>(null);
  const refFimMensagens = useRef<HTMLDivElement>(null);

  useEffect(() => {
  if (!user) navigate('/login');
  else {
    mixpanel.track('Eco: Entrou no Chat', {
      userId,
      userName,
      timestamp: new Date().toISOString(),
    });
  }
}, [user, navigate]);

  useEffect(() => {
    if (!user) navigate('/login');
  }, [user, navigate]);
  if (!user) return null;

  const saudacao = new Date().getHours() < 12
    ? 'Bom dia'
    : new Date().getHours() < 18
    ? 'Boa tarde'
    : 'Boa noite';
  const mensagemBoasVindas = `${saudacao}, ${userName}`;

  useEffect(() => {
    refFimMensagens.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const gerarMensagemRetorno = (mem: any): string | null => {
    if (!mem) return null;
    const dias = differenceInDays(new Date(), new Date(mem.created_at));
    if (dias === 0) return null;
    const resumo = mem.resumo_eco || 'algo que foi sentido';
    return `O usuário retorna após ${dias} dias. Na última interação significativa, compartilhou: “${resumo}”. Use isso para acolher o reencontro com sensibilidade.`;
  };

  const handleSendMessage = async (text: string) => {
    setDigitando(true);
    setErroApi(null);

    const userIdMsg = uuidv4();
    addMessage({ id: userIdMsg, text, sender: 'user' });
    mixpanel.track('Eco: Mensagem Enviada', {
  userId,
  userName,
  mensagem: text,
  timestamp: new Date().toISOString(),
});


    try {
      const saved = await salvarMensagem({
        usuarioId: userId!,
        conteudo: text,
        sentimento: '',
        salvarMemoria: true,
      });
      const mensagemId = saved?.[0]?.id || userIdMsg;

      const history = [...messages, { id: mensagemId, role: 'user', content: text }];

      const tags = extrairTagsRelevantes(text);
      let mems: any[] = [];

      const [similar, porTag] = await Promise.all([
        buscarMemoriasSimilares(text, 2).catch(() => []),
        tags.length ? buscarUltimasMemoriasComTags(userId!, tags, 2).catch(() => []) : [],
      ]);

      const vistos = new Set<string>();
      mems = [...similar, ...porTag].filter((m) => {
        if (vistos.has(m.id)) return false;
        vistos.add(m.id);
        return true;
      });

      const ctxMems = mems
        .map((m) => {
          const data = new Date(m.created_at || '').toLocaleDateString();
          const tgs = m.tags?.length ? ` [tags: ${m.tags.join(', ')}]` : '';
          return `(${data}) ${m.resumo_eco}${tgs}`;
        })
        .join('\n');

      const memSignif = mems.find((m) => m.intensidade >= 7);
      const retorno = gerarMensagemRetorno(memSignif);

      const mensagensComContexto = [
        ...(retorno ? [{ role: 'system', content: retorno }] : []),
        ...(ctxMems ? [{ role: 'system', content: `Memórias recentes relevantes:\n${ctxMems}` }] : []),
        ...history,(-3)
      ];

      const formatted = mensagensComContexto.map((m) => ({
        role: m.role || (m.sender === 'eco' ? 'assistant' : 'user'),
        content: m.text || m.content || '',
      }));

      const resposta = await enviarMensagemParaEco(formatted, userName, userId!);
      const textoEco = resposta.replace(/\{[\s\S]*?\}$/, '').trim();
      addMessage({ id: uuidv4(), text: textoEco, sender: 'eco' });
      
      // Regex para extrair o bloco técnico JSON da resposta
const match = resposta.match(/\{[\s\S]*\}$/);
if (match) {
  try {
    const bloco = JSON.parse(match[0]);

    if (bloco.intensidade >= 7) {
      mixpanel.track('Memória Registrada', {
        intensidade: bloco.intensidade,
        emocao_principal: bloco.emocao_principal || 'desconhecida',
        modulo_ativado: bloco.modulo_ativado || 'não informado',
        dominio_vida: bloco.dominio_vida || 'geral',
        padrao_comportamental: bloco.padrao_comportamental || 'não identificado',
      });
    }
  } catch (e) {
    console.warn('Erro ao extrair bloco técnico para Mixpanel', e);
  }
}


    } catch (err: any) {
  console.error('[ChatPage] erro:', err);
  setErroApi(err.message || 'Falha ao enviar mensagem.');

  mixpanel.track('Eco: Erro ao Enviar Mensagem', {
    userId,
    erro: err.message || 'desconhecido',
    mensagem: text,
    timestamp: new Date().toISOString(),
  });
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

      <div className="flex-1 flex overflow-y-auto p-4 pb-28 flex-col items-center">
        <div className="max-w-2xl w-full flex flex-col items-center">

          {messages.length === 0 && !erroApi && (
            <motion.div
              className="text-center text-gray-600 mb-20 mt-16"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl md:text-4xl font-light text-gray-600">{mensagemBoasVindas}</h2>
              <p className="text-base md:text-lg font-light text-gray-400 mt-2">Aqui, você se escuta.</p>
            </motion.div>
          )}

          {erroApi && (
            <div className="text-red-500 text-center mb-4">Erro: {erroApi}</div>
          )}

          <div className="w-full space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex items-start ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'eco' && <div className="mr-2"><EcoBubbleIcon /></div>}
                {m.sender === 'eco'
                  ? <EcoMessageWithAudio message={m as any} />
                  : <ChatMessage message={m} />
                }
              </div>
            ))}

            {digitando && (
              <div className="flex items-start justify-start">
                <div className="mr-2"><EcoBubbleIcon /></div>
                <ChatMessage message={{ id: 'typing', text: '...', sender: 'eco' }} isEcoTyping />
              </div>
            )}

            <div ref={refFimMensagens} />
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 left-0 right-0 px-4 z-10">
  <div className="max-w-2xl mx-auto">
    <ChatInput
      onSendMessage={handleSendMessage}
      onMoreOptionSelected={(opt) => { if (opt === 'go_to_voice_page') navigate('/voice'); }}
      onSendAudio={() => console.log('Áudio enviado')}
    />
  </div>
</div>
    </div>
  );
};

export default ChatPage;
