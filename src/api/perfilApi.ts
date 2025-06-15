// src/api/perfilApi.ts
import { supabase } from '../lib/supabaseClient';
import axios from 'axios';

/* -------------------------------------------------------------------------- */
/*  Base da API                                                               */
/* -------------------------------------------------------------------------- */
const API_BASE = '/api/perfil-emocional';

/* -------------------------------------------------------------------------- */
/*  Tipagem opcional                                                          */
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
/*  JWT do usuário autenticado via Supabase                                  */
/* -------------------------------------------------------------------------- */
async function getAuthHeaders() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error('⚠️ Usuário não autenticado ou sessão inválida.');
  }

  return {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  API pública: buscar perfil emocional                                     */
/* -------------------------------------------------------------------------- */

/**
 * 🔍 Busca o perfil emocional do usuário autenticado
 * (ou de um `userId` específico — se admin quiser usar externamente)
 */
export const buscarPerfilEmocional = async (
  userId?: string
): Promise<PerfilEmocional | null> => {
  try {
    const config = await getAuthHeaders();
    const url = userId ? `${API_BASE}/${userId}` : API_BASE;

    const response = await axios.get<{ success: boolean; perfil: PerfilEmocional | null }>(
      url,
      config
    );

    if (!response.data?.perfil) {
      console.info('[ℹ️ API] Nenhum perfil emocional encontrado');
      return null;
    }

    return response.data.perfil;
  } catch (err: any) {
    console.error('[❌ Erro] ao buscar perfil emocional:', err?.message || err);
    return null;
  }
};
