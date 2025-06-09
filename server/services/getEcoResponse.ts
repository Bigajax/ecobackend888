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
    .map((f, i) => `## ${f.replace('.txt', '').replace(/_/g, ' ').toUpperCase()}

${fileContents[i].trim()}`)
    .join('\n\n');

  return cachedFullSystemPrompt;
}

function mapRole(role: string): 'user' | 'assistant' | 'system' {
  if (role === 'model') return 'assistant';
  if (role === 'system') return 'system';
  return 'user';
}

function limparResposta(text: string): string {
  return text
    .replace(/### IN\u00cdCIO RESPOSTA ECO ###/g, '')
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
}) {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) throw new Error('OPENROUTER_API_KEY não configurada.');

  const promptBase = await carregarFullSystemPrompt();
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
      role: mapRole(msg.role),
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
        'HTTP-Referer': process.env.YOUR_APP_DOMAIN || 'http://localhost:3001',
        'Content-Type': 'application/json'
      }
    }
  );

  const raw = response.data.choices[0].message.content;
  const textoFinal = limparResposta(raw);

  return textoFinal;
}
