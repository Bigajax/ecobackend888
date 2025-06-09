import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { supabase } from '../lib/supabaseClient';

let cachedFullSystemPrompt: string | null = null;

async function carregarFullSystemPrompt(): Promise<string> {
  if (cachedFullSystemPrompt) return cachedFullSystemPrompt;

  const assetsDir = path.join(__dirname, '..', 'assets');
  const promptFiles = [
    'eco_prompt_programavel.txt',
    'eco_manifesto_fonte.txt',
    'eco_principios_poeticos.txt',
    'eco_behavioral_instructions.txt',
    'eco_core_personality.txt',
    'eco_guidelines_general.txt',
    'eco_emotions.txt',
    'eco_examples_realistic.txt',
    'eco_generic_inputs.txt',
    'eco_forbidden_patterns.txt',
    'eco_farewell.txt',
    'eco_subconscious_guidance.txt'
  ];

  const fileContents = await Promise.all(
    promptFiles.map(f => fs.readFile(path.join(assetsDir, f), 'utf-8'))
  );

  cachedFullSystemPrompt = promptFiles
    .map((f, i) => `## ${f.replace('.txt', '').replace(/_/g, ' ').toUpperCase()}\n\n${fileContents[i].trim()}`)
    .join('\n\n');

  return cachedFullSystemPrompt;
}

const mapRoleForOpenAI = (role: string): 'user' | 'assistant' | 'system' => {
  if (role === 'model') return 'assistant';
  if (role === 'system') return 'system';
  return 'user';
};

function limparResposta(text: string): string {
  return text
    .replace(/### INÍCIO RESPOSTA ECO ###/g, '')
    .replace(/### FIM RESPOSTA ECO ###/g, '')
    .replace(/```json[\s\S]*```/g, '')
    .replace(/```[\s\S]*```/g, '')
    .trim();
}

async function buscarContextoEmocionalCompleto(userId: string) {
  const { data: perfil } = await supabase
    .from('perfis_emocionais')
    .select('*')
    .eq('usuario_id', userId)
    .limit(1)
    .maybeSingle();

  const { data: mems } = await supabase
    .from('memories')
    .select('*')
    .eq('usuario_id', userId)
    .not('tags', 'is', null)
    .order('data_registro', { ascending: false })
    .limit(3);

  return { perfil, mems };
}

// ✅ Função única para usar no Chat ou na Página de Voz
export const getEcoResponse = async ({
  messages,
  userName,
  userId
}: {
  messages: { id?: string; role: string; content: string }[];
  userName?: string;
  userId: string;
}): Promise<{ message: string }> => {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) throw new Error('OPENROUTER_API_KEY não configurada.');

  const fullSystemPrompt = await carregarFullSystemPrompt();
  const latestMessage = messages[messages.length - 1].content;
  const nomeSeguro = userName || 'Usuário';

  const { perfil, mems } = await buscarContextoEmocionalCompleto(userId);
  let blocoContextoEmocional = '';

  if (perfil) {
    const emocoes = Object.keys(perfil.emocoes_frequentes || {}).join(', ') || 'nenhuma destacada';
    const temas = Object.keys(perfil.temas_recorrentes || {}).join(', ') || 'nenhum destacado';
    const ultima = perfil.ultima_interacao_significativa || 'não registrado';
    const resumo = perfil.resumo_geral_ia || 'nenhum resumo disponível';

    blocoContextoEmocional += `\nPerfil emocional acumulado:\n- Emoções mais frequentes: ${emocoes}\n- Temas recorrentes: ${temas}\n- Última interação significativa: ${ultima}\n- Resumo geral: ${resumo}`;
  }

  if (mems && mems.length > 0) {
    const memStrings = mems.map(m =>
      `(${m.data_registro?.slice(0, 10)}): ${m.resumo_eco} [tags: ${(m.tags || '').toString()}]`
    ).join('\n');

    blocoContextoEmocional += `\n\nÚltimas memórias com tags:\n${memStrings}`;
  }

  const promptComInstrucoes = `\n${fullSystemPrompt}\n\n${blocoContextoEmocional}\n\nO nome do usuário logado é: ${nomeSeguro}.\nA IA deve sempre considerar este nome como parte do contexto para personalizar a conversa.`;

  const chatMessages = [
    { role: 'system', content: promptComInstrucoes },
    ...messages.map((msg: any) => ({
      role: mapRoleForOpenAI(msg.role),
      content: msg.content,
    }))
  ];

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'openai/gpt-4o',
      messages: chatMessages,
      temperature: 0.9,
      top_p: 0.95,
      presence_penalty: 0.5,
      frequency_penalty: 0.2,
      max_tokens: 1500,
    },
    {
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'HTTP-Referer': process.env.YOUR_APP_DOMAIN || 'http://localhost:3001',
        'Content-Type': 'application/json',
      },
    }
  );

  const message = response.data.choices[0]?.message?.content;
  if (!message) throw new Error('Resposta vazia da IA.');

  console.log('[ECO IA] Resposta da IA:\n', message);
  const cleaned = limparResposta(message);

  // JSON opcional
  const allJsonMatches = [...message.matchAll(/### INÍCIO BLOCO JSON ###[\s\S]*?(\{[\s\S]*?\})[\s\S]*?### FIM BLOCO JSON ###/g)];
  if (allJsonMatches.length > 0) {
    try {
      const lastJson = allJsonMatches[allJsonMatches.length - 1][1];
      const parsed = JSON.parse(lastJson);

      if (parsed.intensidade >= 7) {
        await supabase.from('memories').insert([{
          usuario_id: userId,
          mensagem_id: messages[messages.length - 1].id,
          resumo_eco: cleaned,
          emocao_principal: parsed.emocao_principal,
          intensidade: parsed.intensidade,
          contexto: latestMessage,
          categoria: parsed.rotulo,
          salvar_memoria: true,
          data_registro: new Date().toISOString(),
          dominio_vida: parsed.dominio_vida,
          padrao_comportamental: parsed.padrao_comportamental,
          nivel_abertura: parsed.nivel_abertura,
          analise_resumo: parsed.analise_resumo,
          tags: Array.isArray(parsed.tags) ? parsed.tags.join(', ') : (parsed.tags || '')
        }]);
      }
    } catch (err) {
      console.warn('[AVISO] Falha ao processar JSON extraído:', err);
    }
  }

  return { message: cleaned };
};
