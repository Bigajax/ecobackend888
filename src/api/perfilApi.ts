import { supabase } from '../lib/supabaseClient';

export const buscarPerfilEmocional = async (userId: string) => {
  try {
    const { data, error, status } = await supabase
      .from('perfis_emocionais')
      .select('*')
      .eq('usuario_id', userId)
      .maybeSingle(); // ✅ melhor que .single() pois lida com null sem lançar erro

    if (error && status !== 406) {
      // erro real (ex: conexão, estrutura)
      console.error('Erro ao buscar perfil emocional:', error.message || error);
      throw new Error('Erro ao buscar perfil emocional.');
    }

    // se status for 406 ou data for null, é apenas ausência de registro
    if (!data) {
      return null;
    }

    return data;
  } catch (error: any) {
    console.error('Erro inesperado ao buscar perfil emocional:', error.message || error);
    throw new Error('Erro ao buscar perfil emocional.');
  }
};
