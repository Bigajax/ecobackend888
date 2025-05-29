import { supabase } from '../lib/supabaseClient';

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
  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('data_registro', { ascending: false });

  if (error) {
    console.error('Erro ao buscar memórias:', error.message);
    throw new Error('Erro ao buscar memórias.');
  }

  return data as Memoria[];
}
