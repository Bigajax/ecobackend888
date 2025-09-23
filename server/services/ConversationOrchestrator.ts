// server/services/ConversationOrchestrator.ts
import {
  ensureEnvs,
  formatarTextoEco,
  limparResposta,
  mapRoleForOpenAI,
  now,
  sleep,
  type GetEcoParams,
  type GetEcoResult,
  type ParalelasResult,
} from "../utils";

import { supabaseWithBearer } from "../adapters/SupabaseAdapter";
import { PROMPT_CACHE } from "../services/CacheService";
import { getEmbeddingCached } from "../adapters/EmbeddingAdapter";
import { gerarBlocoTecnicoComCache } from "../core/EmotionalAnalyzer";
import { fastGreet, microReflexoLocal } from "../core/ResponseGenerator";
import { claudeChatCompletion } from "../core/ClaudeAdapter"; // ✅ Claude via OpenRouter
import { GreetGuard } from "../policies/GreetGuard";
import { getDerivados, insightAbertura } from "../services/derivadosService";
import { buscarHeuristicasSemelhantes } from "../services/heuristicaService";
import { montarContextoEco } from "../services/promptContext";
import { respostaSaudacaoAutomatica, type Msg as SaudMsg } from "../utils/respostaSaudacaoAutomatica";
import { saveMemoryOrReference } from "../services/MemoryService";
import { trackMensagemEnviada, trackEcoDemorou } from "../analytics/events/mixpanelEvents";

/* ------------------------------------------------------------------ */
/* ---------------------------- Helpers ------------------------------ */
/* ------------------------------------------------------------------ */

function hasSubstance(msg: string) {
  const t = (msg || "").trim().toLowerCase();
  if (t.length >= 30) return true;
  return /cansad|triste|ansios|irritad|preocupad|estou|sinto|tive|aconteceu|preciso|quero|dor|insônia|medo/.test(t);
}

// Heurística de baixa complexidade → ativa fast-lane
function isLowComplexity(texto: string) {
  const t = (texto || "").trim();
  if (t.length <= 120) return true;
  const words = t.split(/\s+/).length;
  if (words <= 18) return true;
  return !/crise|p[aâ]nico|desesper|vontade de sumir|explod|insuport|plano detalhado|passo a passo/i.test(t);
}

async function operacoesParalelas(ultimaMsg: string, userId?: string): Promise<ParalelasResult> {
  let userEmbedding: number[] = [];
  if (ultimaMsg.trim().length > 0) {
    userEmbedding = await getEmbeddingCached(ultimaMsg, "entrada_usuario");
  }

  let heuristicas: any[] = [];
  if (userEmbedding.length > 0) {
    try {
      heuristicas = await buscarHeuristicasSemelhantes({
        usuarioId: userId ?? null,
        userEmbedding,
        matchCount: 5,
      });
    } catch {
      heuristicas = [];
    }
  }
  return { heuristicas, userEmbedding };
}

async function operacoesParalelasComOrcamento(ultimaMsg: string, userId?: string): Promise<ParalelasResult> {
  const short = ultimaMsg.trim().length < 80 || ultimaMsg.trim().split(/\s+/).length < 12;
  if (short) return { heuristicas: [], userEmbedding: [] };

  let result: ParalelasResult = { heuristicas: [], userEmbedding: [] };
  await Promise.race([
    (async () => { result = await operacoesParalelas(ultimaMsg, userId); })(),
    (async () => { await sleep(250); })(),
  ]);
  return result;
}

async function montarContextoOtimizado(params: any) {
  const cacheKey = `${params.userId}_${params.nivel}_${params.intensidade}`;
  if (PROMPT_CACHE.has(cacheKey)) {
    return PROMPT_CACHE.get(cacheKey)! + `\n\nMensagem atual: ${params.texto}`;
  }
  const contexto = await montarContextoEco(params);
  if ((params.nivel ?? 2) <= 2) PROMPT_CACHE.set(cacheKey, contexto);
  return contexto;
}

function heuristicaPreViva(m: string) {
  const texto = (m || "").toLowerCase();
  const len = texto.length;
  const gat = [
    /ang[uú]st/i, /p[aâ]nico/i, /desesper/i, /crise/i, /sofr/i,
    /n[aã]o aguento/i, /vontade de sumir/i, /explod/i, /impulsiv/i,
    /medo/i, /ansiedad/i, /culpa/i, /triste/i,
  ];
  return gat.some(r => r.test(texto)) || len >= 180;
}

// Timeout lógico: não deixa tarefas auxiliares atrasarem a resposta
async function withTimeout<T>(p: Promise<T>, ms: number, label = "tarefa"): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms)),
  ]) as Promise<T>;
}

// Rota rápida: modelo leve, histórico curto, tokens baixos
async function fastLaneLLM({
  messages,
}: {
  messages: { role: string; content: string }[];
}) {
  const system =
    "Você é a Eco. Responda curto (1–2 frases), claro e gentil. Evite jargões. Se pedirem passos, no máximo 3 itens.";
  const slim = [
    { role: "system", content: system },
    ...messages.slice(-3).map(m => ({ role: mapRoleForOpenAI(m.role) as "system" | "user" | "assistant", content: m.content })),
  ];

  const data = await claudeChatCompletion({
    messages: slim,
    model: process.env.ECO_FAST_MODEL || "anthropic/claude-3-5-haiku",
    temperature: 0.5,
    maxTokens: 220,
  });

  const raw: string = data?.content ?? "";
  the const cleaned = formatarTextoEco(limparResposta(raw || "Posso te ajudar nisso!"));
  return { cleaned, usage: data?.usage, model: data?.model };
}

/* ------------------------------------------------------------------ */
/* -------------------------- Orquestrador --------------------------- */
/* ------------------------------------------------------------------ */

export async function getEcoResponse({
  messages,
  userId,
  userName,
  accessToken,
  mems = [],
  forcarMetodoViva = false,
  blocoTecnicoForcado = null,
  clientHour,
}: GetEcoParams): Promise<GetEcoResult> {
  const t0 = now();
  ensureEnvs();

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Parâmetro "messages" vazio ou inválido.');
  }
  const ultimaMsg = messages.at(-1)?.content || "";
  const trimmed = ultimaMsg.trim();

  // 0) micro-reflexo local → retorno imediato
  const micro = microReflexoLocal(ultimaMsg);
  if (micro) return { message: micro };

  // 1) SAUDAÇÃO/DESPEDIDA AUTOMÁTICA (backend decide)
  // 🔧 Converte o histórico para o tipo esperado pelo util (role union)
  const saudaMsgs: SaudMsg[] = messages.slice(-4).map((m: any) => ({
    role: mapRoleForOpenAI(m.role) as "user" | "assistant" | "system",
    content: m.content,
  }));
  const auto = respostaSaudacaoAutomatica({ messages: saudaMsgs, userName, clientHour });

  if (auto?.meta?.isFarewell) {
    return { message: auto.text };
  }
  if (auto?.meta?.isGreeting) {
    if (GreetGuard.can(userId)) {
      GreetGuard.mark(userId);
      return { message: auto.text };
    }
    // se bloqueado pelo guard, cai para fast-lane/rota normal
  }

  // 2) roteamento rápido (baixa complexidade e sem VIVA forçado)
  const low = isLowComplexity(ultimaMsg);
  const vivaAtivo = forcarMetodoViva || heuristicaPreViva(ultimaMsg);
  if (low && !vivaAtivo) {
    const inicioFast = now();
    const fast = await fastLaneLLM({ messages });

    // bloco técnico com orçamento mínimo (não travar)
    let bloco: any = null;
    try {
      bloco = await withTimeout(gerarBlocoTecnicoComCache(ultimaMsg, fast.cleaned), 250, "bloco-tecnico");
    } catch {}

    // pós-processo assíncrono (salvar memória) sem bloquear a resposta
    (async () => {
      try {
        if (userId) {
          const supabase = supabaseWithBearer(accessToken);
          await saveMemoryOrReference({
            supabase,
            userId,
            lastMessageId: (messages as any).at(-1)?.id ?? null,
            cleaned: fast.cleaned,
            bloco,
            ultimaMsg,
          });
        }
      } catch (e) {
        console.warn("⚠️ Pós-processo fastLane falhou:", (e as Error).message);
      }
    })();

    // telemetria da rota rápida
    trackMensagemEnviada({
      userId,
      tempoRespostaMs: now() - inicioFast,
      tokensUsados: fast?.usage?.total_tokens || null,
      modelo: fast?.model,
    });

    const resp: GetEcoResult = { message: fast.cleaned };
    if (bloco && typeof bloco.intensidade === "number") {
      resp.intensidade = bloco.intensidade;
      resp.resumo = bloco?.analise_resumo?.trim().length ? bloco.analise_resumo.trim() : fast.cleaned;
      resp.emocao = bloco.emocao_principal || "indefinida";
      resp.tags = Array.isArray(bloco.tags) ? bloco.tags : [];
      resp.categoria = bloco.categoria ?? null;
    } else if (bloco) {
      resp.categoria = bloco.categoria ?? null;
    }
    return resp;
  }

  // 3) rota completa
  const supabase = supabaseWithBearer(accessToken);

  // 3.1) paralelas (embeddings/heurísticas) com orçamento curto
  const { heuristicas, userEmbedding } = await Promise.race([
    operacoesParalelas(ultimaMsg, userId),
    sleep(180).then(() => ({ heuristicas: [], userEmbedding: [] })),
  ]);

  // 3.2) derivados com timeout curto
  const derivados = userId
    ? await withTimeout(
        (async () => {
          try {
            const { data: stats } = await supabase
              .from("user_theme_stats")
              .select("tema,freq_30d,int_media_30d")
              .eq("user_id", userId)
              .order("freq_30d", { ascending: false })
              .limit(5);

            const { data: marcos } = await supabase
              .from("user_temporal_milestones")
              .select("tema,resumo_evolucao,marco_at")
              .eq("user_id", userId)
              .order("marco_at", { ascending: false })
              .limit(3);

            const { data: efeitos } = await supabase
              .from("interaction_effects")
              .select("efeito,score,created_at")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(30);

            const arr = (efeitos || []).map((r: any) => ({ x: { efeito: (r.efeito as any) ?? "neutro" } }));
            const scores = (efeitos || [])
              .map((r: any) => Number(r?.score))
              .filter((v: number) => Number.isFinite(v));
            const media = scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;

            return getDerivados((stats || []) as any, (marcos || []) as any, arr as any, media);
          } catch {
            return null;
          }
        })(),
        180,
        "derivados"
      )
    : null;

  const aberturaHibrida = derivados ? (() => { try { return insightAbertura(derivados); } catch { return null; } })() : null;

  // 3.3) system prompt (com cache)
  const systemPrompt = await montarContextoOtimizado({
    userId,
    userName,
    perfil: null,
    mems,
    forcarMetodoViva: vivaAtivo,
    blocoTecnicoForcado,
    texto: ultimaMsg,
    heuristicas,
    userEmbedding,
    skipSaudacao: true,
    derivados,
    aberturaHibrida,
  });

  const msgs: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...messages.slice(-5).map((m) => ({
      role: mapRoleForOpenAI(m.role) as "system" | "user" | "assistant",
      content: m.content,
    })),
  ];

  // 3.4) chamada ao modelo principal → Claude Sonnet 4.x via OpenRouter
  const maxTokens = ultimaMsg.length < 140 ? 420 : ultimaMsg.length < 280 ? 560 : 700;
  const inicioEco = now();
  const data = await claudeChatCompletion({
    messages: msgs,
    model: process.env.ECO_CLAUDE_MODEL || "anthropic/claude-4-sonnet",
    temperature: 0.6,
    maxTokens,
  });
  const duracaoEco = now() - inicioEco;
  if (duracaoEco > 2500) trackEcoDemorou({ userId, duracaoMs: duracaoEco, ultimaMsg });

  const raw: string = data?.content ?? "";
  const cleaned = formatarTextoEco(
    limparResposta(raw || "Desculpa, não consegui responder agora. Pode tentar de novo?")
  );

  // 3.5) bloco técnico com orçamento curto
  let bloco: any = null;
  try {
    bloco = await withTimeout(gerarBlocoTecnicoComCache(ultimaMsg, cleaned), 300, "bloco-tecnico");
  } catch {}

  const response: GetEcoResult = { message: cleaned };
  if (bloco && typeof bloco.intensidade === "number") {
    response.intensidade = bloco.intensidade;
    response.resumo = bloco?.analise_resumo?.trim().length ? bloco.analise_resumo.trim() : cleaned;
    response.emocao = bloco.emocao_principal || "indefinida";
    response.tags = Array.isArray(bloco.tags) ? bloco.tags : [];
    response.categoria = bloco.categoria ?? null;
  } else if (bloco) {
    response.categoria = bloco.categoria ?? null;
  }

  // 3.6) pós-processo assíncrono
  (async () => {
    try {
      if (userId) {
        await saveMemoryOrReference({
          supabase,
          userId,
          lastMessageId: (messages as any).at(-1)?.id ?? null,
          cleaned,
          bloco,
          ultimaMsg,
        });
      }
    } catch (e) {
      console.warn("⚠️ Pós-processo falhou:", (e as Error).message);
    }
  })();

  // 3.7) telemetria
  trackMensagemEnviada({
    userId,
    tempoRespostaMs: duracaoEco,
    tokensUsados: data?.usage?.total_tokens || null,
    modelo: data?.model,
  });

  return response;
}

// compat
export { getEcoResponse as getEcoResponseOtimizado };
