import axios from 'axios';
import { updateEmotionalProfile } from './updateEmotionalProfile';
import { montarContextoEco } from '../controllers/promptController';
import { createSupabaseWithToken } from '../lib/supabaseClient';

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

async function buscarContextoEmocional(supabaseClient: ReturnType<typeof createSupabaseWithToken>, userId?: string) {
  if (!userId) return { perfil: null, mems: [] };

  const { data: perfil } = await supabaseClient
    .from('perfis_emocionais')
    .select('*')
    .eq('usuario_id', userId)
    .limit(1)
    .maybeSingle();

  const { data: mems } = await supabaseClient
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
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY não configurada.');

  const supabaseClient = createSupabaseWithToken(accessToken);

  const ultimaMsg = messages.at(-1)?.content;
  const { perfil, mems } = await buscarContextoEmocional(supabaseClient, userId);
  const systemPrompt = await montarContextoEco({ perfil, mems, ultimaMsg, modo_compacto: false });

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
      model: 'openai/gpt-4',
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

  const jsonMatches = [...raw.matchAll(/{\s*"emocao_principal"[\s\S]*?}/g)];

  if (jsonMatches.length > 0) {
    console.log('[📦] Bloco JSON detectado:\n', jsonMatches.at(-1)?.[0]);
    try {
      const json = JSON.parse(jsonMatches.at(-1)?.[0] || '{}');

      intensidade = Number(json.intensidade);
      if (isNaN(intensidade) || intensidade < 0 || intensidade > 10) {
        console.warn('[⚠️] Intensidade inválida:', json.intensidade);
        intensidade = undefined;
      }

      emocao = json.emocao_principal;
      tags = Array.isArray(json.tags) ? json.tags : [];

      const salvar = userId && typeof intensidade === 'number' && intensidade >= 7;

      if (salvar) {
        const { error } = await supabaseClient.from('memories').insert([{
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
  } else {
    console.warn('[ℹ️] Nenhum bloco JSON detectado na resposta da IA.');
  }

  return {
    message: cleaned,
    intensidade,
    resumo,
    emocao,
    tags
  };
}
