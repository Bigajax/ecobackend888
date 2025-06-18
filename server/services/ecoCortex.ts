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
    .replace(/```json[\s\S]*?```/gi, '')
    .replace(/```[\s\S]*?```/gi, '')
    .replace(/{\s*"emocao_principal"[\s\S]*?}/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/###.*?###/g, '')
    .trim();
}

async function gerarBlocoTecnicoSeparado({
  mensagemUsuario,
  respostaIa,
  apiKey
}: {
  mensagemUsuario: string;
  respostaIa: string;
  apiKey: string;
}): Promise<any | null> {
  try {
    const { data } = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              `Você é uma IA sensível que reconhece emoções humanas com profundidade, mesmo quando expressas de forma sutil. Analise a conversa abaixo e gere um bloco JSON com os campos: emocao_principal, intensidade (de 0 a 10), tags, dominio_vida, padrao_comportamental, nivel_abertura, analise_resumo e categoria.

Se houver indício de emoção significativa (mesmo não verbalizada com força), estime a intensidade emocional. Se a intensidade for igual ou maior que 7, gere o bloco. Se não, responda apenas: null.

Erro por excesso é melhor do que por omissão.`
          },
          {
            role: 'user',
            content: `Mensagem do usuário: ${mensagemUsuario}\n\nResposta da IA: ${respostaIa}`
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw || raw === 'null') return null;

    const jsonClean = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    return JSON.parse(jsonClean);
  } catch (err) {
    console.warn('[⚠️] Erro ao gerar bloco técnico separado:', err);
    return null;
  }
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
    const systemPrompt = await montarContextoEco({
      userId,
      ultimaMsg,
      perfil: null,
      mems: []
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

    const cleaned = limparResposta(raw);

    const bloco = await gerarBlocoTecnicoSeparado({
      mensagemUsuario: ultimaMsg || '',
      respostaIa: cleaned,
      apiKey
    });

    let intensidade: number | undefined;
    let emocao: string | undefined;
    let tags: string[] = [];
    let resumo: string | undefined = cleaned;

    if (bloco) {
      intensidade = Number(bloco.intensidade);
      emocao = bloco.emocao_principal;
      tags = Array.isArray(bloco.tags) ? bloco.tags : [];

      // Correção aqui: normaliza nivel_abertura para número
      const nivelNumerico =
        typeof bloco.nivel_abertura === 'number'
          ? bloco.nivel_abertura
          : bloco.nivel_abertura === 'baixo'
          ? 1
          : bloco.nivel_abertura === 'médio'
          ? 2
          : bloco.nivel_abertura === 'alto'
          ? 3
          : null;

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
          dominio_vida: bloco.dominio_vida ?? null,
          padrao_comportamental: bloco.padrao_comportamental ?? null,
          nivel_abertura: nivelNumerico,
          analise_resumo: bloco.analise_resumo ?? null,
          categoria: bloco.categoria ?? 'emocional',
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
      }
    } else {
      console.log('[ℹ️] Nenhum bloco técnico necessário. Intensidade provavelmente abaixo de 7.');
    }

    return { message: cleaned, intensidade, resumo, emocao, tags };
  } catch (err: any) {
    console.error('❌ getEcoResponse error:', err.message || err);
    throw err;
  }
}
