// routes/memoryRoutes.ts
import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient';

const router = Router();

router.get('/memories', async (req: Request, res: Response) => {
  const { usuario_id, emocao, intensidade_min } = req.query;

  if (!usuario_id) {
    return res.status(400).json({ error: 'Parâmetro usuario_id é obrigatório.' });
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
      // Ensure intensity_min is a valid number before using it
      const minIntensity = Number(intensidade_min);
      if (!isNaN(minIntensity)) {
        query = query.gte('intensidade', minIntensity);
      } else {
        return res.status(400).json({ error: 'Parâmetro intensidade_min deve ser um número válido.' });
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar memórias:', error.message);
      return res.status(500).json({ error: 'Erro ao buscar memórias.' });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Erro geral no endpoint /memories:', err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

export default router;