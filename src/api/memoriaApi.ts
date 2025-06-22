import axios, { AxiosError } from 'axios';
import { supabase } from '../lib/supabaseClient';

/* -------------------------------------------------------------------------- */
/*  Tipagens                                                                  */
/* -------------------------------------------------------------------------- */
export interface Memoria {
  id: string;
  usuario_id: string;
  mensagem_id: string | null;
  resumo_eco: string;
  data_registro?: string | null;
  emocao_principal?: string | null;
  intensidade?: number | null;
  contexto?: string | null;
  dominio_vida?: string | null;
  padrao_comportamental?: string | null;
  categoria?: string | null;
  salvar_memoria?: boolean | 'true' | 'false';
  nivel_abertura?: number | null;
  analise_resumo?: string | null;
  tags?: string[];
}

/* -------------------------------------------------------------------------- */
/*  Axios com JWT automático                                                  */
/* -------------------------------------------------------------------------- */
const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('⚠️ Usuário não autenticado.');
  }

  config.headers.Authorization = `Bearer ${session.access_token}`;
  return config;
});

/* -------------------------------------------------------------------------- */
/*  Tratamento de erro padrão                                                 */
/* -------------------------------------------------------------------------- */
function tratarErro(err: unknown, acao: string): never {
  if (axios.isAxiosError(err)) {
    const e = err as AxiosError<{ error: string }>;

    if (e.response?.data?.error) {
      throw new Error(`Erro do servidor ao ${acao}: ${e.response.data.error}`);
    }
    if (e.response) {
      throw new Error(`Erro HTTP ${e.response.status} ao ${acao}: ${e.response.statusText}`);
    }
    if (e.request) {
      throw new Error(`Erro de rede ao ${acao}: nenhuma resposta recebida`);
    }
    throw new Error(`Erro ao ${acao}: ${e.message}`);
  }

  throw new Error(`Erro inesperado ao ${acao}: ${(err as any)?.message || String(err)}`);
}

/* -------------------------------------------------------------------------- */
/*  API Pública                                                               */
/* -------------------------------------------------------------------------- */

/**
 * 🔍 Busca as últimas memórias do usuário que possuam *alguma* das tags pedidas.
 */
export async function buscarUltimasMemoriasComTags(
  userId: string,
  tags: string[],
  limite = 5
): Promise<Memoria[]> {
  try {
    if (!tags.length) return [];

    const { data } = await api.get<{ success: boolean; memories: Memoria[] }>('/memorias', {
      params: {
        tags,
        limite
      },
      paramsSerializer: (params) => {
        const search = new URLSearchParams();
        if (Array.isArray(params.tags)) {
          params.tags.forEach(tag => search.append('tags', tag));
        }
        if (params.limite) search.set('limite', params.limite);
        return search.toString();
      }
    });

    if (data.success && Array.isArray(data.memories)) {
      return data.memories
        .filter(m => Array.isArray(m.tags) && m.tags.length > 0)
        .sort((a, b) =>
          new Date(b.data_registro || '').getTime() - new Date(a.data_registro || '').getTime()
        )
        .slice(0, limite);
    }

    return [];
  } catch (err) {
    tratarErro(err, 'buscar memórias com tags');
  }
}

/**
 * 📥 Busca todas as memórias do usuário (opcional: por ID).
 */
export async function buscarMemoriasPorUsuario(userId?: string): Promise<Memoria[]> {
  try {
    const { data } = await api.get<{ success: boolean; memories: Memoria[] }>('/memorias', {
      params: userId ? { usuario_id: userId } : undefined
    });

    if (data.success && Array.isArray(data.memories)) {
      return data.memories;
    }

    console.warn('[memoriaApi] Resposta inesperada:', data);
    return [];
  } catch (err) {
    tratarErro(err, 'buscar memórias');
  }
}
