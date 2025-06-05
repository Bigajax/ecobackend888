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
  rotulo?: string | null;
  dominio_vida?: string | null;
  padrao_comportamental?: string | null;
  categoria?: string | null;
  salvar_memoria?: boolean;
  nivel_abertura?: number | null;
  analise_resumo?: string | null;
  tags?: string[]; // ✅ corrigido
}

export async function buscarMemoriasPorUsuario(usuarioId: string): Promise<Memoria[]> {
  try {
    const response = await axios.get('/api/memories', {
      params: { usuario_id: usuarioId },
    });

    if (response.status >= 200 && response.status < 300) {
      if (response.data && response.data.success) {
        return response.data.memories || [];
      } else {
        console.warn('Resposta do backend sem sucesso ou sem memórias:', response.data);
        return [];
      }
    } else {
      const errorMessage = response.data?.message || 'Erro desconhecido ao buscar memórias.';
      throw new Error(errorMessage);
    }
  } catch (error: any) {
    let finalMessage = 'Erro ao buscar memórias.';
    if (axios.isAxiosError(error)) {
      if (error.response?.data?.error) {
        finalMessage = `Erro do servidor: ${error.response.data.error}`;
      } else if (error.response?.status) {
        finalMessage = `Erro do servidor (status ${error.response.status}): ${error.response.statusText || 'Resposta inesperada'}`;
      } else if (error.request) {
        finalMessage = `Erro de rede: Nenhuma resposta recebida. Detalhes: ${error.message}`;
      } else {
        finalMessage = `Erro na requisição: ${error.message}`;
      }
    } else {
      finalMessage = `Erro inesperado: ${error.message || error.toString()}`;
    }
    console.error(finalMessage);
    throw new Error(finalMessage);
  }
}

// ✅ Buscar últimas memórias que tenham tags (não usa mais 'categoria')
export async function buscarUltimasMemoriasComTags(usuarioId: string, limite: number = 5): Promise<Memoria[]> {
  try {
    const response = await axios.get('/api/memories', {
      params: {
        usuario_id: usuarioId,
        limite: limite,
      },
    });

    if (response.status >= 200 && response.status < 300) {
      const todas = response.data.memories || [];
      const comTags = todas
        .filter((mem: Memoria) => mem.tags && mem.tags.length > 0)
        .sort((a: Memoria, b: Memoria) =>
          new Date(b.data_registro || '').getTime() - new Date(a.data_registro || '').getTime()
        )
        .slice(0, limite);

      return comTags;
    } else {
      throw new Error(response.data?.message || 'Erro ao buscar memórias com tags.');
    }
  } catch (error: any) {
    console.error('Erro ao buscar memórias com tags:', error.message);
    return [];
  }
}
