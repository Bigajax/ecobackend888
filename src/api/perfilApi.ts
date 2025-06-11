import { supabase } from '../lib/supabaseClient';

export const buscarPerfilEmocional = async (userId: string): Promise<any | null> => {
  try {
    const { data, error, status } = await supabase
      .from('perfis_emocionais')
      .select('*')
      .eq('usuario_id', userId)
      .maybeSingle(); // Retorna 'null' em vez de lançar erro se não encontrar

    // Erros do Supabase exceto "406 Not Acceptable" (quando não encontra registro)
    if (error && status !== 406) {
      console.error('[❌ Supabase] Erro ao buscar perfil emocional:', error.message || error);
      throw new Error('Erro ao buscar perfil emocional.');
    }

    // Nenhum perfil encontrado
    if (!data) {
      console.info('[ℹ️ Supabase] Nenhum perfil emocional encontrado para o usuário:', userId);
      return null;
    }

    return data;
  } catch (err: any) {
    console.error('[❌ Erro Inesperado] ao buscar perfil emocional:', err.message || err);
    throw new Error('Erro ao buscar perfil emocional.');
  }
};
