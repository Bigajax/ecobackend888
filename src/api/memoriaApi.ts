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
  categoria?: string | null; // cuidado: no backend vem como string separada por vírgulas
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
        return []; // ✅ retorna array vazio se não achar, para não quebrar o front
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
