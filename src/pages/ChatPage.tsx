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
  buscarMemoriasSimilares,   // ⬅️ NOVO — precisa existir na memoriaApi
} from '../api/memoriaApi';

import { useAuth } from '../contexts/AuthContext';
import { useChat, Message } from '../contexts/ChatContext';
import { salvarMensagem } from '../api/mensagem';

import { differenceInDays } from 'date-fns';
import { extrairTagsRelevantes } from '../utils/extrairTagsRelevantes';

/* -------------------------------------------------------------------------- */
/*  Componente                                                                */
/* -------------------------------------------------------------------------- */
const ChatPage: React.FC = () => {
  const { messages, addMessage, clearMessages } = useChat();
  const { userId, userName = 'Usuário', signOut, user } = useAuth();
  const navigate = useNavigate();

  const [digitando, setDigitando]   = useState(false);
  const [erroApi,   setErroApi]     = useState<string | null>(null);
  const refFimMensagens             = useRef<HTMLDivElement>(null);

  /* ---------- redirecionamento se logout ---------- */
  useEffect(() => { if (!user) navigate('/login'); }, [user, navigate]);
  if (!user) return null;

  /* ---------- mensagem inicial ---------- */
  const saudacao = new Date().getHours() < 12
    ? 'Bom dia'
    : new Date().getHours() < 18
    ? 'Boa tarde'
    : 'Boa noite';
  const mensagemBoasVindas = `${saudacao}, ${userName}!`;

  /* ---------- scroll automático ---------- */
  useEffect(() => {
    refFimMensagens.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ---------- util p/ lembrar retorno ---------- */
  const gerarMensagemRetorno = (mem: any): string | null => {
    if (!mem) return null;
    const dias = differenceInDays(new Date(), new Date(mem.data_registro));
    if (dias === 0) return null;
    const resumo = mem.resumo_eco || 'algo que foi sentido';
    return `O usuário retorna após ${dias} dias. Na última interação significativa, compartilhou: “${resumo}”. Use isso para acolher o reencontro com sensibilidade.`;
  };

  /* ---------------------------------------------------------------------- */
  /*  HANDLE SEND MESSAGE                                                    */
  /* ---------------------------------------------------------------------- */
  const handleSendMessage = async (text: string) => {
    setDigitando(true);
    setErroApi(null);

    /* ----- respostas rápidas a saudações simples ----- */
    const simples = ['oi','olá','bom dia','boa tarde','boa noite'];
    const norm    = text.trim().toLowerCase();

    const hoje          = new Date().toDateString();
    const agoraISO      = new Date().toISOString();
    const ultimaStr     = localStorage.getItem('eco_ultima_interacao');
    const jaFalouHoje   = ultimaStr && new Date(ultimaStr).toDateString() === hoje;
    localStorage.setItem('eco_ultima_interacao', agoraISO);

    const msgsHoje = messages.filter(m =>
      m.sender === 'user' &&
      new Date(parseInt(m.id?.slice(0,8) || '0',16)*1000 || Date.now()).toDateString() === hoje
    );

    if (simples.includes(norm)) {
      const ecoTxt = !jaFalouHoje || msgsHoje.length === 0
        ? `Oi, eu sou a Eco. Estou aqui para acolher o que você sente, ${userName}.`
        : msgsHoje.length === 1
          ? `Oi de novo, ${userName}. Que bom te encontrar aqui outra vez.`
          : null;

      if (ecoTxt) {
        const uid = uuidv4();
        addMessage({ id: uid, text, sender: 'user' });
        addMessage({ id: uuidv4(), text: ecoTxt, sender: 'eco' });
        setDigitando(false);
        return;
      }
    }

    /* ----- adiciona msg do usuário ----- */
    const userIdMsg = uuidv4();
    addMessage({ id: userIdMsg, text, sender: 'user' });

    try {
      /* 1. salva crude da mensagem */
      const saved = await salvarMensagem({
        usuarioId: userId!, conteudo: text, sentimento: '', salvarMemoria: true,
      });
      const mensagemId = saved?.[0]?.id || userIdMsg;

      /* 2. history básico */
      const history = [...messages, { id: mensagemId, role: 'user', content: text }];

      /* 3. busca memórias (similaridade + tags) */
      const tags = extrairTagsRelevantes(text);
      let mems: any[] = [];

      const [similar, porTag] = await Promise.all([
        buscarMemoriasSimilares(text, 5).catch(() => []),
        tags.length ? buscarUltimasMemoriasComTags(userId!, tags, 5).catch(()=>[]) : []
      ]);

      const vistos = new Set<string>();
      mems = [...similar, ...porTag].filter(m => {
        if (vistos.has(m.id)) return false;
        vistos.add(m.id); return true;
      });

      /* 4. contexto system com memórias */
      const ctxMems = mems.map(m=>{
        const data = new Date(m.data_registro||'').toLocaleDateString();
        const tgs  = m.tags?.length ? ` [tags: ${m.tags.join(', ')}]` : '';
        return `(${data}) ${m.resumo_eco}${tgs}`;
      }).join('\n');

      const memSignif = mems.find(m=>m.intensidade>=7);
      const retorno   = gerarMensagemRetorno(memSignif);

      const mensagensComContexto = [
        ...(retorno ? [{ role:'system', content: retorno }] : []),
        ...(ctxMems ? [{ role:'system', content:`Memórias recentes relevantes:\n${ctxMems}` }] : []),
        ...history,
      ];

      const formatted = mensagensComContexto.map(m=>({
        role: m.role || (m.sender==='eco'?'assistant':'user'),
        content: m.text || m.content || '',
      }));

      /* 5. envia à Eco */
      const resposta = await enviarMensagemParaEco(formatted, userName, userId!);
      const textoEco = resposta.replace(/\{[\s\S]*?\}$/, '').trim();
      addMessage({ id: uuidv4(), text: textoEco, sender: 'eco' });

    } catch (err:any) {
      console.error('[ChatPage] erro:', err);
      setErroApi(err.message || 'Falha ao enviar mensagem.');
    } finally {
      setDigitando(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /*  RENDER                                                                 */
  /* ---------------------------------------------------------------------- */
  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <Header
        title="ECO"
        showBackButton={false}
        onOpenMemoryHistory={()=>navigate('/memory')}
        onLogout={async ()=>{
          await signOut();
          clearMessages();
          navigate('/login');
        }}
      />

      {/* Corpo do chat */}
      <div className="flex-1 flex overflow-y-auto p-4 flex-col items-center">
        <div className="max-w-2xl w-full flex flex-col items-center">

          {/* Boas-vindas iniciais */}
          {messages.length===0 && !erroApi && (
            <motion.div className="text-center text-gray-600 mb-20 mt-16"
              initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.5}}>
              <h2 className="text-4xl font-light text-black">{mensagemBoasVindas}</h2>
              <p  className="text-xl  font-light text-black mt-2">Aqui, você se escuta.</p>
            </motion.div>
          )}

          {erroApi && (
            <div className="text-red-500 text-center mb-4">Erro: {erroApi}</div>
          )}

          {/* Mensagens */}
          <div className="w-full space-y-4">
            {messages.map(m=>(
              <div key={m.id}
                   className={`flex items-start ${m.sender==='user'?'justify-end':'justify-start'}`}>
                {m.sender==='eco' && <div className="mr-2"><EcoBubbleIcon/></div>}
                {m.sender==='eco'
                  ? <EcoMessageWithAudio message={m as any}/>
                  : <ChatMessage message={m}/>
                }
              </div>
            ))}

            {digitando && (
              <div className="flex items-start justify-start">
                <div className="mr-2"><EcoBubbleIcon/></div>
                <ChatMessage message={{id:'typing',text:'...',sender:'eco'}} isEcoTyping/>
              </div>
            )}

            <div ref={refFimMensagens}/>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="flex justify-center w-full p-4">
        <div className="max-w-2xl w-full">
          <ChatInput
            onSendMessage={handleSendMessage}
            onMoreOptionSelected={opt=>{ if (opt==='go_to_voice_page') navigate('/voice'); }}
            onSendAudio={()=>console.log('Áudio enviado')}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
