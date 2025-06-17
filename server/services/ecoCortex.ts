import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { updateEmotionalProfile } from './updateEmotionalProfile';
import { montarContextoEco } from '../controllers/promptController';

const mapRoleForOpenAI = (role: string): 'user' | 'assistant' | 'system' => {
  if (role === 'model') return 'assistant';
  if (role === 'system') return 'system';
  return 'user';
};

function limparResposta(text: string): string {
  return text
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/###.*?###/g, '')
    .trim();
}

export async function getEcoResponse({
  messages,
  userId,
  userName,
  accessToken
}: {
  messages: { id?: string; role: string; content: string }[];
  userId?: string;
  userName?: string;
  accessToken: string;
}): Promise<{
  message: string;
  intensidade?: number;
  resumo?: string;
  emocao?: string;
  tags?: string[];
}> {
  try {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Parâmetro "messages" vazio ou inválido.');
    }
    if (!accessToken) {
      throw new Error('Token (accessToken) ausente.');
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY não configurada.');

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    );

    const ultimaMsg = messages.at(-1)?.content;
    const palavrasChave = (ultimaMsg || '')
      .toLowerCase()
      .split(/\W+/)
      .filter(p => p.length > 3);

    const { data: memsPorTags } = await supabase
      .from('memories')
      .select('*')
      .eq('usuario_id', userId)
      .not('tags', 'is', null);

    const memsFiltradas =
      memsPorTags?.filter(mem =>
        Array.isArray(mem.tags) &&
        mem.tags.some((tag: string) =>
          palavrasChave.includes(tag.toLowerCase())
        )
      ).slice(0, 3) || [];

    console.log('[🧠] Memórias puxadas com tags relacionadas:', memsFiltradas.map(m => ({
      id: m.id,
      tags: m.tags,
      resumo: m.resumo_eco
    })));

    const { data: perfil } = await supabase
      .from('perfis_emocionais')
      .select('*')
      .eq('usuario_id', userId)
      .limit(1)
      .maybeSingle();

    const systemPrompt = await montarContextoEco({
      perfil,
      ultimaMsg,
      userId,
      mems: memsFiltradas
    });

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: mapRoleForOpenAI(m.role),
        content: m.content
      }))
    ];

    const { data } = await axios.post(
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

    const raw: string | undefined = data?.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Resposta vazia da IA.');

    const jsonMatches = [...raw.matchAll(/{\s*"emocao_principal"[\s\S]*?}/g)];
    let cleaned = limparResposta(raw);
    let intensidade: number | undefined;
    let emocao: string | undefined;
    let resumo: string | undefined = cleaned;
    let tags: string[] = [];

    if (jsonMatches.length) {
      const json = JSON.parse(jsonMatches.at(-1)![0]);

      console.log('[📦] Bloco técnico extraído da IA:', json);

      intensidade = Number(json.intensidade);
      emocao = json.emocao_principal;
      tags = Array.isArray(json.tags) ? json.tags : [];
      cleaned = cleaned.replace(jsonMatches.at(-1)![0], '').trim();
      resumo = cleaned;

      const salvar = userId && intensidade >= 7;
      if (salvar) {
        const { error } = await supabase.from('memories').insert([{
          usuario_id: userId,
          mensagem_id: messages.at(-1)?.id ?? null,
          resumo_eco: cleaned,
          emocao_principal: emocao ?? null,
          intensidade,
          contexto: ultimaMsg ?? null,
          salvar_memoria: true,
          data_registro: new Date().toISOString(),
          dominio_vida: json.dominio_vida ?? null,
          padrao_comportamental: json.padrao_comportamental ?? null,
          nivel_abertura: json.nivel_abertura ?? null,
          analise_resumo: json.analise_resumo ?? null,
          categoria: json.categoria ?? 'emocional',
          tags
        }]);

        if (error) {
          console.warn('[⚠️] Falha ao salvar memória:', error);
        } else {
          console.log('[💾] Memória registrada com sucesso:', {
            emocao,
            intensidade,
            tags,
            resumo,
            userId
          });
          await updateEmotionalProfile(userId);
        }
      } else {
        console.log('[ℹ️] Intensidade abaixo do limite para salvar memória:', intensidade);
      }
    } else {
      console.log('[❌] Nenhum bloco técnico JSON encontrado na resposta da IA.');
    }

    return { message: cleaned, intensidade, resumo, emocao, tags };
  } catch (err: any) {
    console.error('❌ getEcoResponse error:', err.message || err);
    throw err;
  }
}
