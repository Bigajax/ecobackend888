import express from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';

const router = express.Router();

// 🔐 Extrai o usuário autenticado a partir do token Bearer
async function getUsuarioAutenticado(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '').trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    console.warn('[🔐 Auth] Falha ao obter usuário:', error?.message);
    return null;
  }

  return data.user;
}

// 📌 POST /api/memorias/registrar → Salva nova memória
router.post('/registrar', async (req, res) => {
  const user = await getUsuarioAutenticado(req);
  if (!user) return res.status(401).json({ erro: 'Usuário não autenticado.' });

  const {
    texto,
    tags,
    intensidade,
    mensagem_id,
    emocao_principal,
    contexto,
    dominio_vida,
    padrao_comportamental,
    salvar_memoria,
    nivel_abertura,
    analise_resumo,
    categoria
  } = req.body;

  if (!texto || typeof intensidade !== 'number' || (!Array.isArray(tags) && typeof tags !== 'object')) {
    return res.status(400).json({ erro: 'Campos obrigatórios ausentes ou inválidos.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('memories')
      .insert([{
        usuario_id: user.id,
        mensagem_id: mensagem_id ?? null,
        resumo_eco: texto,
        tags: tags ?? [],
        intensidade,
        emocao_principal: emocao_principal ?? null,
        contexto: contexto ?? null,
        dominio_vida: dominio_vida ?? null,
        padrao_comportamental: padrao_comportamental ?? null,
        salvar_memoria: salvar_memoria !== false,
        nivel_abertura: typeof nivel_abertura === 'number' ? nivel_abertura : null,
        analise_resumo: analise_resumo ?? null,
        categoria: categoria ?? 'emocional',
        data_registro: new Date().toISOString()
      }])
      .select();

    if (error) {
      console.error('❌ Erro ao salvar memória:', error.message, error.details);
      return res.status(500).json({ erro: 'Erro ao salvar memória no Supabase.' });
    }

    console.log('✅ Memória salva com sucesso:', data);
    return res.status(200).json({ sucesso: true, data });
  } catch (err: any) {
    console.error('❌ Erro inesperado ao salvar memória:', err.message || err);
    return res.status(500).json({ erro: 'Erro inesperado no servidor.' });
  }
});

// 📌 GET /api/memorias → Busca memórias salvas do usuário
router.get('/', async (req, res) => {
  const user = await getUsuarioAutenticado(req);
  if (!user) return res.status(401).json({ error: 'Usuário não autenticado.' });

  const { limite } = req.query;

  try {
    let query = supabaseAdmin
      .from('memories')
      .select('*')
      .eq('usuario_id', user.id)
      .eq('salvar_memoria', true)
      .order('data_registro', { ascending: false });

    if (limite) {
      const lim = Number(limite);
      if (!isNaN(lim) && lim > 0) {
        query = query.range(0, lim - 1);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Erro ao buscar memórias:', error.message, error.details);
      return res.status(500).json({ error: 'Erro ao buscar memórias no Supabase.' });
    }

    const memoriesFiltradas = (data || []).filter(mem =>
      typeof mem.resumo_eco === 'string' &&
      mem.resumo_eco.trim() !== '' &&
      mem.data_registro
    );

    console.log(`📥 ${memoriesFiltradas.length} memórias retornadas para ${user.id}`);
    return res.status(200).json({ success: true, memories: memoriesFiltradas });
  } catch (err: any) {
    console.error('❌ Erro inesperado ao buscar memórias:', err.message || err);
    return res.status(500).json({ error: 'Erro inesperado no servidor.' });
  }
});

export default router;
