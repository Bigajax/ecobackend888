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
      .single();

    if (error) {
      console.error('[ERRO SUPABASE]', error);
      return res.status(500).json({ success: false, message: 'Erro ao consultar o banco de dados.' });
    }

    if (!data) {
      console.warn('[AVISO] Nenhum perfil encontrado para este usuário.');
      return res.status(404).json({ success: false, message: 'Perfil emocional não encontrado.' });
    }

    console.log('[SUCESSO] Perfil emocional encontrado:', data);
    res.status(200).json({ success: true, perfil: data });

  } catch (err: any) {
    console.error('[ERRO SERVIDOR]', err);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
});

export default router;
