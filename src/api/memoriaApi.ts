import axios from 'axios';

export interface Memoria {
  id: string;
  usuario_id: string;
  mensagem_id: string;
  resumo_eco: string;
  data_registro?: string | null;
  emocao_principal?: string | null;
  intensidade?: number | null;
  contexto?: string | null;
  categoria?: string[] | null;
}

export async function buscarMemoriasPorUsuario(usuarioId: string): Promise<Memoria[]> {
  try {
    const response = await axios.get('/api/memories', {
      params: { usuario_id: usuarioId },
    });

    return response.data;
  } catch (error: any) {
    console.error('Erro ao buscar memórias via backend:', error.message);
    throw new Error('Erro ao buscar memórias.');
  }
}
