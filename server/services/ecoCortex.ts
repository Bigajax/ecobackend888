import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { supabase } from '../lib/supabaseClient';
import { updateEmotionalProfile } from './updateEmotionalProfile';

let cachedPrompt: string | null = null;

async function carregarPromptProgramavel(): Promise<string> {
  if (cachedPrompt) return cachedPrompt;
  const assetsDir = path.join(__dirname, '..', 'assets');
  const promptPath = path.join(assetsDir, 'eco_prompt_programavel.txt');
  cachedPrompt = await fs.readFile(promptPath, 'utf-8');
  return cachedPrompt.trim();
}

const mapRoleForOpenAI = (role: string): 'user' | 'assistant' | 'system' => {
  if (role === 'model') return 'assistant';
  if (role === 'system') return 'system';
  return 'user';
};

function limparResposta(text: string): string {
  const match = text.match(/### INÍCIO RESPOSTA ECO\s*([\s\S]*?)\s*### FIM RESPOSTA ECO/);
  if (match) return match[1].trim();
  return text
    .replace(/### INÍCIO BLOCO JSON\s*{[\s\S]*?}\s*### FIM BLOCO JSON/gi, '')
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();
}

async function buscarContextoEmocional(userId?: string) {
  if (!userId) return { perfil: null, mems: [] };
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

  return { perfil, mems: mems || [] };
}

export async function getEcoResponse({
  messages,
  userId,
  userName
}: {
  messages: { id?: string; role: string; content: string }[];
  userId?: string;
  userName?: string;
}): Promise<{
  message: string;
  intensidade?: number;
  resumo?: string;
  emocao?: string;
  tags?: string[];
}> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY não configurada.');

  const promptBase = await carregarPromptProgramavel();
  const { perfil, mems } = await buscarContextoEmocional(userId);
  const ultimaMsg = messages.at(-1)?.content;

  let contexto = '';

  if (perfil) {
    contexto += `\nPerfil emocional:\n- Emoções: ${Object.keys(perfil.emocoes_frequentes || {}).join(', ') || 'nenhuma'}\n- Temas: ${Object.keys(perfil.temas_recorrentes || {}).join(', ') || 'nenhum'}\n- Última interação: ${perfil.ultima_interacao_significativa || 'não registrada'}\n- Resumo: ${perfil.resumo_geral_ia || 'nenhum'}`;
  }

  if (mems.length > 0) {
    const textos = mems.map(m => `(${m.data_registro?.slice(0, 10)}): ${m.resumo_eco} [tags: ${(m.tags || []).join(', ')}]`).join('\n');
    contexto += `\n\nÚltimas memórias com tags:\n${textos}`;
  }

  const systemPrompt = `${promptBase}\n\n${contexto}`;

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(msg => ({
      role: mapRoleForOpenAI(msg.role),
      content: msg.content
    }))
  ];

  console.log('🧠 Enviando para OpenRouter:\n', JSON.stringify(chatMessages, null, 2));

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'openai/gpt-4o',
      messages: chatMessages,
      temperature: 0.8,
      top_p: 0.95,
      presence_penalty: 0.3,
      frequency_penalty: 0.2,
      max_tokens: 1500
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173'
      }
    }
  );

  const raw = response.data.choices?.[0]?.message?.content;
  if (!raw || typeof raw !== 'string') {
    console.error('⚠️ Resposta da IA vazia ou inválida:', raw);
    throw new Error('Resposta vazia da IA.');
  }

  const cleaned = limparResposta(raw);

  let intensidade: number | undefined;
  let emocao: string | undefined;
  let resumo: string | undefined = cleaned;
  let tags: string[] = [];

  const jsonMatches = [...raw.matchAll(/### INÍCIO BLOCO JSON\s*\n?({[\s\S]*?})\s*### FIM BLOCO JSON/g)];

  if (jsonMatches.length === 0) {
    console.log('[INFO] Nenhum bloco JSON foi encontrado na resposta da IA.');
  }

  if (jsonMatches.length > 0) {
    try {
      const json = JSON.parse(jsonMatches.at(-1)?.[1] || '{}');

      intensidade = json.intensidade;
      emocao = json.emocao_principal;
      tags = Array.isArray(json.tags) ? json.tags : [];

      const salvar = userId && typeof intensidade === 'number' && intensidade >= 7;

      if (salvar) {
        const { error } = await supabase.from('memories').insert([{
          usuario_id: userId,
          mensagem_id: messages.at(-1)?.id,
          resumo_eco: cleaned,
          emocao_principal: emocao || null,
          intensidade: intensidade || null,
          contexto: ultimaMsg || null,
          salvar_memoria: true,
          data_registro: new Date().toISOString(),
          dominio_vida: json.dominio_vida || null,
          padrao_comportamental: json.padrao_comportamental || null,
          nivel_abertura: json.nivel_abertura || null,
          analise_resumo: json.analise_resumo || null,
          tags
        }]);

        if (!error) {
          console.log('[✅] Memória salva com sucesso.');
          await updateEmotionalProfile(userId);
        } else {
          console.warn('[⚠️] Falha ao salvar memória:', error);
        }
      }
    } catch (err) {
      console.warn('[⚠️] Falha ao processar JSON da IA:', err);
    }
  }

  return {
    message: cleaned,
    intensidade,
    resumo,
    emocao,
    tags
  };
}
