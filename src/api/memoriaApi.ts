import axios from 'axios';

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
  salvar_memoria?: boolean;
  nivel_abertura?: number | null;
  analise_resumo?: string | null;
  tags?: string[];
}

const API_BASE = '/api/memorias';

// 🔍 Busca TODAS as memórias do usuário
export async function buscarMemoriasPorUsuario(usuarioId: string): Promise<Memoria[]> {
  try {
    const response = await axios.get(API_BASE, {
      params: { usuario_id: usuarioId },
    });

    const { success, memories } = response.data;

    if (response.status >= 200 && response.status < 300 && success && Array.isArray(memories)) {
      return memories;
    } else {
      console.warn('[memoriaApi] Resposta inesperada:', response.data);
      return [];
    }
  } catch (error: any) {
    const mensagem = extrairMensagemErro(error, 'buscar memórias');
    console.error(mensagem);
    throw new Error(mensagem);
  }
}

// 🔍 Busca últimas memórias com tags (ex: para IA usar como contexto)
export async function buscarUltimasMemoriasComTags(usuarioId: string, limite = 5): Promise<Memoria[]> {
  try {
    const response = await axios.get(API_BASE, {
      params: { usuario_id: usuarioId, limite },
    });

    const { success, memories } = response.data;

    if (success && Array.isArray(memories)) {
      return memories
        .filter((mem: Memoria) => Array.isArray(mem.tags) && mem.tags.length > 0)
        .sort((a, b) => new Date(b.data_registro || '').getTime() - new Date(a.data_registro || '').getTime())
        .slice(0, limite);
    }

    return [];
  } catch (error: any) {
    console.error('[memoriaApi] Erro ao buscar memórias com tags:', error.message || error);
    return [];
  }
}

// Utilitário de erro
function extrairMensagemErro(error: any, contexto: string): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.error) {
      return `Erro do servidor ao ${contexto}: ${error.response.data.error}`;
    } else if (error.response?.status) {
      return `Erro HTTP ${error.response.status} ao ${contexto}: ${error.response.statusText}`;
    } else if (error.request) {
      return `Erro de rede ao ${contexto}: nenhuma resposta do servidor.`;
    }
    return `Erro na requisição ao ${contexto}: ${error.message}`;
  } else {
    return `Erro inesperado ao ${contexto}: ${error.message || error.toString()}`;
  }
}
