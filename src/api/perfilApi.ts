import { supabase } from '../lib/supabaseClient';
import axios from 'axios';

/* -------------------------------------------------------------------------- */
/*  Configurações gerais                                                     */
/* -------------------------------------------------------------------------- */
const API_BASE = '/api/perfil-emocional';

/* -------------------------------------------------------------------------- */
/*  Tipagens                                                                  */
/* -------------------------------------------------------------------------- */
export interface PerfilEmocional {
  id: string;
  usuario_id: string;
  resumo_geral_ia: string | null;
  emocoes_frequentes: Record<string, number>;
  temas_recorrentes: Record<string, number>;
  ultima_interacao_sig: string | null;
  updated_at?: string;
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
/*  API: Buscar perfil emocional completo                                    */
/* -------------------------------------------------------------------------- */

/**
 * 🔍 Recupera o perfil emocional do usuário por ID.
 * @param userId ID do usuário
 * @returns PerfilEmocional | null
 */
export const buscarPerfilEmocional = async (
  userId: string
): Promise<PerfilEmocional | null> => {
  if (!userId) {
    throw new Error('userId é obrigatório para buscar o perfil emocional.');
  }

  try {
    const config = await getAuthHeaders();
    const url = `${API_BASE}/${userId}`;

    const response = await axios.get<{ success: boolean; perfil: PerfilEmocional | null }>(
      url,
      config
    );

    if (!response.data?.perfil) {
      console.info('[ℹ️ API] Nenhum perfil emocional encontrado.');
      return null;
    }

    return response.data.perfil;
  } catch (err: any) {
    console.error('❌ Erro ao buscar perfil emocional:', err?.message || err);
    return null;
  }
};
