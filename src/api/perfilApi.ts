// src/api/perfilApi.ts
import { supabase } from '../lib/supabaseClient';
import axios from 'axios';

/* -------------------------------------------------------------------------- */
/*  Base da API                                                               */
/* -------------------------------------------------------------------------- */
const API_BASE = '/api/perfil-emocional';

/* -------------------------------------------------------------------------- */
/*  Tipagem                                                                   */
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
/*  Helper: cabeçalho JWT                                                     */
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
/*  API pública: buscar perfil emocional                                      */
/* -------------------------------------------------------------------------- */

/**
 * 🔍 Busca o perfil emocional do usuário indicado por `userId`.
 * `userId` é obrigatório porque o backend só possui GET /api/perfil-emocional/:userId
 */
export const buscarPerfilEmocional = async (
  userId: string
): Promise<PerfilEmocional | null> => {
  if (!userId) throw new Error('userId é obrigatório para buscar o perfil emocional.');

  try {
    const config = await getAuthHeaders();
    const url = `${API_BASE}/${userId}`;

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
