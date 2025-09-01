import express from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { embedTextoCompleto } from '../services/embeddingService';
import { heuristicaNivelAbertura } from '../utils/heuristicaNivelAbertura';
import { gerarTagsAutomaticasViaIA } from '../services/tagService';

const router = express.Router();

/* ────────────────────────────────────────────────
   🔐 Helper – extrai usuário autenticado (Bearer)
────────────────────────────────────────────────── */
async function getUsuarioAutenticado(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '').trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    console.warn('[Auth] Falha ao obter usuário:', error?.message);
    return null;
  }
  return data.user;
}

/* ────────────────────────────────────────────────
   🧹 Utils
────────────────────────────────────────────────── */
const safeLog = (s: string) =>
  process.env.NODE_ENV === 'production' ? (s || '').slice(0, 60) + '…' : s || '';

/* ────────────────────────────────────────────────
   ✅ Gera um resumoEco bem formatado
────────────────────────────────────────────────── */
function gerarResumoEco(
  texto: string,
  tags: string[] = [],
  intensidade: number,
  emocao_principal?: string | null,
  analise_resumo?: string | null
) {
  const linhas: string[] = [`🗣️ "${(texto || '').trim()}"`];
  if (tags?.length) linhas.push(`🏷️ Tags: ${tags.join(', ')}`);
  if (emocao_principal) linhas.push(`❤️ Emoção: ${emocao_principal}`);
  linhas.push(`🔥 Intensidade: ${intensidade}`);
  if (analise_resumo && analise_resumo.trim()) {
    linhas.push(`\n🧭 Resumo Analítico:\n${analise_resumo.trim()}`);
  } else {
    linhas.push(`⚠️ Sem análise detalhada disponível.`);
  }
  return linhas.join('\n');
}

/* ────────────────────────────────────────────────
   ✅ POST /api/memorias/registrar → salva memória
────────────────────────────────────────────────── */
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
    salvar_memoria = true,
    nivel_abertura,
    analise_resumo,
    categoria = 'emocional',
  } = req.body;

  if (!texto || typeof intensidade !== 'number' || (!Array.isArray(tags) && typeof tags !== 'object')) {
    return res.status(400).json({ erro: 'Campos obrigatórios ausentes ou inválidos.' });
  }

  try {
    const destinoTabela = intensidade >= 7 ? 'memories' : 'referencias_temporarias';

    let finalTags: string[] = Array.isArray(tags) ? tags : [];
    if (finalTags.length === 0) {
      finalTags = await gerarTagsAutomaticasViaIA(texto);
    }

    // Garante number[] mesmo que o serviço retorne string JSON
    const rawSem = await embedTextoCompleto(texto);
    const embedding_semantico: number[] = Array.isArray(rawSem) ? rawSem : JSON.parse(String(rawSem));

    const rawEmo = await embedTextoCompleto(analise_resumo ?? texto);
    const embedding_emocional: number[] = Array.isArray(rawEmo) ? rawEmo : JSON.parse(String(rawEmo));

    const nivelCalc =
      typeof nivel_abertura === 'number' ? nivel_abertura : heuristicaNivelAbertura(texto);

    const { data, error } = await supabaseAdmin
      .from(destinoTabela)
      .insert([{
        usuario_id: user.id,
        mensagem_id: mensagem_id ?? null,
        resumo_eco: gerarResumoEco(texto, finalTags, intensidade, emocao_principal, analise_resumo),
        tags: finalTags,
        intensidade,
        emocao_principal: emocao_principal ?? null,
        contexto: contexto ?? null,
        dominio_vida: dominio_vida ?? null,
        padrao_comportamental: padrao_comportamental ?? null,
        salvar_memoria,
        nivel_abertura: nivelCalc,
        analise_resumo: analise_resumo ?? null,
        categoria,
        created_at: new Date().toISOString(),
        embedding_semantico,
        embedding_emocional,
      }])
      .select();

    if (error) {
      console.error('❌ Erro ao salvar:', error.message, error.details);
      return res.status(500).json({ erro: 'Erro ao salvar no Supabase.' });
    }

    console.log(`✅ Registro salvo em [${destinoTabela}]:`, data);
    return res.status(201).json({ sucesso: true, tabela: destinoTabela, data });
  } catch (err: any) {
    console.error('❌ Erro inesperado ao salvar:', err.message || err);
    return res.status(500).json({ erro: 'Erro inesperado no servidor.' });
  }
});

/* ────────────────────────────────────────────────
   ✅ GET /api/memorias → lista memórias salvas
────────────────────────────────────────────────── */
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
      .order('created_at', { ascending: false });

    if (limite) {
      const lim = Number(limite);
      if (!isNaN(lim) && lim > 0) query = query.range(0, lim - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Erro ao buscar memórias:', error.message, error.details);
      return res.status(500).json({ error: 'Erro ao buscar memórias no Supabase.' });
    }

    const memoriesFiltradas = (data || []).filter(
      (m) => typeof m.resumo_eco === 'string' && m.resumo_eco.trim() !== '' && m.created_at,
    );

    console.log(`📥 ${memoriesFiltradas.length} memórias retornadas para ${user.id}`);
    return res.status(200).json({ success: true, memories: memoriesFiltradas });
  } catch (err: any) {
    console.error('❌ Erro inesperado ao buscar memórias:', err.message || err);
    return res.status(500).json({ error: 'Erro inesperado no servidor.' });
  }
});

/* ────────────────────────────────────────────────
   ✅ POST /api/memorias/similares → busca semântica
────────────────────────────────────────────────── */
router.post('/similares', async (req, res) => {
  const user = await getUsuarioAutenticado(req);
  if (!user) return res.status(401).json({ erro: 'Usuário não autenticado.' });

  // clamps defensivos
  const bodyTexto = (req.body?.texto ?? '') as string;
  const bodyLimite = Number(req.body?.limite ?? 3);
  const bodyThreshold = Number(req.body?.threshold ?? 0.15);

  const k = Math.max(1, Math.min(5, isNaN(bodyLimite) ? 3 : bodyLimite));
  const th = Math.max(0, Math.min(1, isNaN(bodyThreshold) ? 0.15 : bodyThreshold));

  console.log('📩 Requisição recebida em /similares:', {
    texto: safeLog(bodyTexto),
    limite: k,
    threshold: th,
  });

  if (!bodyTexto || typeof bodyTexto !== 'string') {
    return res.status(400).json({ erro: 'Texto para análise é obrigatório.' });
  }

  // curto-circuito para mensagens muito curtas (economiza embedding/DB)
  if (bodyTexto.trim().length < 3) {
    return res.status(200).json({ sucesso: true, similares: [] });
  }

  try {
    // Garante number[]
    const raw = await embedTextoCompleto(bodyTexto);
    const query_embedding: number[] = Array.isArray(raw) ? raw : JSON.parse(String(raw));

    const { data, error } = await supabaseAdmin.rpc(
      'buscar_memorias_semelhantes',
      {
        query_embedding,
        user_id_input: user.id,
        match_count: k,
        match_threshold: th,
      }
    );

    if (error) {
      console.error('❌ Erro ao buscar memórias similares:', error.message, error.details || '');
      // fallback: não bloqueia a experiência do chat
      return res.status(200).json({ sucesso: true, similares: [] });
    }

    // normaliza nomes e garante defaults
    const similares = (data ?? []).map((r: any) => ({
      id: r.id,
      resumo_eco: r.resumo_eco,
      created_at: r.created_at,
      similaridade: r.similaridade ?? r.similarity ?? 0,
      tags: r.tags ?? [],
      emocao_principal: r.emocao_principal ?? null,
      intensidade: r.intensidade ?? null,
    }));

    console.log(`🔍 ${similares.length} memórias semelhantes normalizadas.`);
    return res.status(200).json({ sucesso: true, similares });
  } catch (err: any) {
    console.error('❌ Erro inesperado ao buscar similares:', err.message || err);
    return res.status(500).json({ erro: 'Erro inesperado no servidor.' });
  }
});

export default router;
