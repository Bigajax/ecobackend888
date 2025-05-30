import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient';

const router = Router();

router.get('/memories', async (req: Request, res: Response) => {
  const { usuario_id, emocao, intensidade_min } = req.query;

  if (!usuario_id) {
    console.warn('[AVISO] Parâmetro usuario_id não fornecido.');
    return res.status(400).json({
      success: false,
      error: 'Parâmetro usuario_id é obrigatório.',
    });
  }

  try {
    let query = supabase
      .from('memories')
      .select('*')
      .eq('usuario_id', usuario_id)
      .order('data_registro', { ascending: false });

    if (emocao) {
      query = query.eq('emocao_principal', emocao);
    }

    if (intensidade_min) {
      const minIntensity = Number(intensidade_min);
      if (!isNaN(minIntensity)) {
        query = query.gte('intensidade', minIntensity);
      } else {
        console.warn('[AVISO] Parâmetro intensidade_min inválido:', intensidade_min);
        return res.status(400).json({
          success: false,
          error: 'Parâmetro intensidade_min deve ser um número válido.',
        });
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ERRO SUPABASE] Erro ao buscar memórias:', error.message || error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar memórias no banco de dados.',
      });
    }

    console.log(`[SUCESSO] Memórias recuperadas para usuario_id ${usuario_id}: ${data?.length || 0} registros.`);

    return res.status(200).json({
      success: true,
      memories: data || [],
    });

  } catch (err: any) {
    console.error('[ERRO GERAL] Falha no endpoint /memories:', err.message || err);
    return res.status(500).json({
      success: false,
      error: 'Erro interno do servidor ao buscar memórias.',
    });
  }
});

export default router;
