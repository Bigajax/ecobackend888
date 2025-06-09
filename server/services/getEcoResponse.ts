import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { supabase } from '../lib/supabaseClient';

let cachedPrompt: string | null = null;

async function carregarPromptProgramavel(): Promise<string> {
  if (cachedPrompt) return cachedPrompt;

  const promptPath = path.join(__dirname, '..', 'assets', 'eco_prompt_programavel.txt');
  cachedPrompt = await fs.readFile(promptPath, 'utf-8');

  return cachedPrompt;
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

async function buscarContexto(userId?: string) {
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
  userName,
}: {
  messages: any[];
  userId?: string;
  userName?: string;
}): Promise<string> {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) throw new Error('OPENROUTER_API_KEY não configurada.');

  const promptBase = await carregarPromptProgramavel();
  const { perfil, mems } = await buscarContexto(userId);

  let contexto = '';

  if (perfil) {
    contexto += `\nPerfil emocional:\n- Emoções: ${Object.keys(perfil.emocoes_frequentes || {}).join(', ') || 'nenhuma'}\n- Temas: ${Object.keys(perfil.temas_recorrentes || {}).join(', ') || 'nenhum'}\n- Última interação: ${perfil.ultima_interacao_significativa || 'não registrada'}\n- Resumo: ${perfil.resumo_geral_ia || 'nenhum'}`;
  }

  if (mems.length > 0) {
    const textos = mems.map(m => `(${m.data_registro?.slice(0, 10)}): ${m.resumo_eco} [tags: ${(m.tags || '').toString()}]`).join('\n');
    contexto += `\n\nÚltimas memórias:\n${textos}`;
  }

  const nomeSeguro = userName || 'Usuário';
  const systemPrompt = `${promptBase}\n\n${contexto}\n\nNome do usuário: ${nomeSeguro}`;

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(msg => ({
      role: mapRoleForOpenAI(msg.role),
      content: msg.content
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
      max_tokens: 1500
    },
    {
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173' // ✅ Domínio do frontend local
      }
    }
  );

  const raw = response.data.choices[0]?.message?.content;
  if (!raw) throw new Error('Resposta vazia da IA.');

  console.log('[ECO IA] Resposta da IA:\n', raw);
  const textoFinal = limparResposta(raw);

  const jsonMatches = [...raw.matchAll(/### INÍCIO BLOCO JSON ###[\s\S]*?(\{[\s\S]*?\})[\s\S]*?### FIM BLOCO JSON ###/g)];

  if (jsonMatches.length > 0) {
    try {
      const json = JSON.parse(jsonMatches.at(-1)?.[1] || '{}');
      if (userId && json.intensidade >= 7) {
        const { error } = await supabase.from('memories').insert([{
          usuario_id: userId,
          mensagem_id: messages.at(-1)?.id,
          resumo_eco: textoFinal,
          emocao_principal: json.emocao_principal,
          intensidade: json.intensidade,
          contexto: messages.at(-1)?.content,
          categoria: json.rotulo,
          salvar_memoria: true,
          data_registro: new Date().toISOString(),
          dominio_vida: json.dominio_vida,
          padrao_comportamental: json.padrao_comportamental,
          nivel_abertura: json.nivel_abertura,
          analise_resumo: json.analise_resumo,
          tags: Array.isArray(json.tags) ? json.tags.join(', ') : (json.tags || '')
        }]);

        if (error) console.warn('[AVISO] Falha ao salvar memória:', error);
        else console.log('[SUCESSO] Memória salva com sucesso.');
      }
    } catch (err) {
      console.warn('[AVISO] Falha ao processar JSON extraído:', err);
    }
  }

  return textoFinal;
}
