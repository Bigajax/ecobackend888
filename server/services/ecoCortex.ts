import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { updateEmotionalProfile } from './updateEmotionalProfile';
import { montarContextoEco } from '../controllers/promptController';

const mapRoleForOpenAI = (role: string): 'user' | 'assistant' | 'system' => {
  if (role === 'model')   return 'assistant';
  if (role === 'system')  return 'system';
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
    /* ------------------------------------------------------------------ */
    /*  1. Validação inicial                                              */
    /* ------------------------------------------------------------------ */
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Parâmetro "messages" vazio ou inválido.');
    }
    if (!accessToken) {
      throw new Error('Token (accessToken) ausente.');
    }

    /* ------------------------------------------------------------------ */
    /*  2. Instâncias                                                     */
    /* ------------------------------------------------------------------ */
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY não configurada.');

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    );

    /* ------------------------------------------------------------------ */
    /*  3. Contexto emocional                                             */
    /* ------------------------------------------------------------------ */
    const ultimaMsg = messages.at(-1)?.content;

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

    const systemPrompt = await montarContextoEco({
      perfil,
      mems: mems || [],
      ultimaMsg,
      modo_compacto: false
    });

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: mapRoleForOpenAI(m.role),
        content: m.content
      }))
    ];

    console.log('🧠 Enviando para OpenRouter:', JSON.stringify(chatMessages, null, 2));

    /* ------------------------------------------------------------------ */
    /*  4. Chamada ao OpenRouter                                          */
    /* ------------------------------------------------------------------ */
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

    /* ------------------------------------------------------------------ */
    /*  5. Processa resposta da IA                                        */
    /* ------------------------------------------------------------------ */
    const jsonMatches = [...raw.matchAll(/{\s*"emocao_principal"[\s\S]*?}/g)];
    let cleaned = limparResposta(raw);
    let intensidade: number | undefined;
    let emocao: string | undefined;
    let resumo: string | undefined = cleaned;
    let tags: string[] = [];

    if (jsonMatches.length) {
      const json = JSON.parse(jsonMatches.at(-1)![0]);
      intensidade = Number(json.intensidade);
      emocao      = json.emocao_principal;
      tags        = Array.isArray(json.tags) ? json.tags : [];
      cleaned     = cleaned.replace(jsonMatches.at(-1)![0], '').trim();
      resumo      = cleaned;

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

        if (error) console.warn('[⚠️] Falha ao salvar memória:', error);
        else       await updateEmotionalProfile(userId);
      }
    }

    return { message: cleaned, intensidade, resumo, emocao, tags };
  } catch (err: any) {
    console.error('❌ getEcoResponse error:', err.message || err);
    throw err; // Propaga para o caller (rota) retornar 500 com log detalhado
  }
}
