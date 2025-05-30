import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient';

const router = Router();

router.get('/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;

  console.log(`[ROTA] Buscando perfil emocional para userId: ${userId}`);

  try {
    const { data, error } = await supabase
      .from('perfis_emocionais')
      .select('*')
      .eq('usuario_id', userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[ERRO SUPABASE]', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao consultar o banco de dados.',
        details: error.message || error,
      });
    }

    if (!data) {
      console.warn('[AVISO] Nenhum perfil encontrado para este usuário.');
      return res.status(404).json({
        success: false,
        error: 'Perfil emocional não encontrado.',
      });
    }

    console.log('[SUCESSO] Perfil emocional encontrado:', data);
    return res.status(200).json({
      success: true,
      perfil: data,
    });
  } catch (err: any) {
    console.error('[ERRO SERVIDOR]', err);
    return res.status(500).json({
      success: false,
      error: 'Erro interno do servidor.',
      details: err.message || err,
    });
  }
});

export default router;
