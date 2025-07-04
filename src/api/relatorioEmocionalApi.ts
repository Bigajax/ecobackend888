import { supabase } from '../lib/supabaseClient';
import axios from 'axios';

/* -------------------------------------------------------------------------- */
/*  Configurações gerais                                                     */
/* -------------------------------------------------------------------------- */
const API_BASE = '/api/relatorio-emocional';

/* -------------------------------------------------------------------------- */
/*  Tipagens                                                                  */
/* -------------------------------------------------------------------------- */
export interface RelatorioEmocional {
  resumo_geral_ia: string;
  emocoes_frequentes: Record<string, number>;
  temas_recorrentes: Record<string, number>;
  ultima_interacao_sig: string | null;
  mapa_emocional?: { emocao: string; x: number; y: number }[];
  emocoes_dominantes?: { emocao: string; valor: number }[];
  linha_tempo?: { data: string; [dominio: string]: number }[];
  tags_dominantes?: { tag: string; valor: number }[];
  total_memorias?: number;
}

/* -------------------------------------------------------------------------- */
/*  Utilitário: Recupera cabeçalhos com JWT válido                           */
/* -------------------------------------------------------------------------- */
async function getAuthHeaders() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error('⚠️ Sessão inválida ou usuário não autenticado.');
  }

  return {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  API: Buscar relatório emocional completo                                  */
/* -------------------------------------------------------------------------- */

/**
 * 🔍 Recupera o relatório emocional completo do usuário por ID.
 * @param userId ID do usuário
 * @returns RelatorioEmocional | null
 */
export const buscarRelatorioEmocional = async (
  userId: string
): Promise<RelatorioEmocional | null> => {
  if (!userId) {
    throw new Error('userId é obrigatório para buscar o relatório emocional.');
  }

  try {
    const config = await getAuthHeaders();
    const url = `${API_BASE}/${userId}`;

    const response = await axios.get<{ perfil: RelatorioEmocional }>(url, config);

    if (!response.data?.perfil) {
      console.info('[ℹ️ API] Nenhum relatório emocional encontrado.');
      return null;
    }

    return response.data.perfil;
  } catch (err: any) {
    console.error('❌ Erro ao buscar relatório emocional:', err?.message || err);
    return null;
  }
};
