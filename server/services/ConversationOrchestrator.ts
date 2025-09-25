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
import { microReflexoLocal } from "../core/ResponseGenerator";
import { claudeChatCompletion } from "../core/ClaudeAdapter";
import { GreetGuard } from "../policies/GreetGuard";
import { getDerivados, insightAbertura } from "../services/derivadosService";
import { buscarHeuristicasSemelhantes } from "../services/heuristicaService";

// 👉 usa o builder exportado pelo barrel services/promptContext/index.ts
import { ContextBuilder } from "../services/promptContext";

import {
  respostaSaudacaoAutomatica,
  type Msg as SaudMsg,
} from "../utils/respostaSaudacaoAutomatica";
import { saveMemoryOrReference } from "../services/MemoryService";
import {
  trackMensagemEnviada,
  trackEcoDemorou,
} from "../analytics/events/mixpanelEvents";

// 🔽 logger
import { log, isDebug } from "../services/promptContext/logger";
// 🔽 helpers para cache key previsível
import {
  derivarNivel,
  detectarSaudacaoBreve,
} from "../services/promptContext/Selector";

/* ---------------------------- Consts ---------------------------- */

const DERIVADOS_TIMEOUT_MS = Number(process.env.ECO_DERIVADOS_TIMEOUT_MS ?? 600);
const PARALELAS_TIMEOUT_MS = Number(process.env.ECO_PARALELAS_TIMEOUT_MS ?? 180);

/* ---------------------------- Helpers ---------------------------- */

const firstName = (s?: string) => (s || "").trim().split(/\s+/)[0] || "";

// Remove respostas do tipo “sou a Eco, não o {nome}”
function stripIdentityCorrection(text: string, nome?: string) {
  if (!nome) return text;
  const re = new RegExp(
    String.raw`(?:^|\n).*?(?:eu\s*)?sou\s*a?\s*eco[^.\n]*não\s+o?a?\s*${nome}\b.*`,
    "i"
  );
  return text.replace(re, "").trim();
}

function isLowComplexity(texto: string) {
  const t = (texto || "").trim();
  if (t.length <= 140) return true;
  const words = t.split(/\s+/).length;
  if (words <= 22) return true;
  return !/crise|p[aâ]nico|desesper|vontade de sumir|explod|insuport|plano detalhado|passo a passo/i.test(
    t
  );
}

async function operacoesParalelas(
  ultimaMsg: string,
  userId?: string
): Promise<ParalelasResult> {
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

// Timeout que NÃO quebra o fluxo (retorna null em erro/timeout)
async function withTimeoutOrNull<T>(
  p: Promise<T>,
  ms: number,
  label = "tarefa"
): Promise<T | null> {
  try {
    return (await Promise.race([
      p,
      new Promise<T>((_, rej) =>
        setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms)
      ),
    ])) as T;
  } catch (e: any) {
    log.warn(`[Orchestrator] ${label} falhou/timeout (${ms}ms): ${e?.message}`);
    return null;
  }
}

/**
 * ⚙️ Monta (ou recupera) o contexto com cache por (userId, nível, intensidade).
 * Observação: o ContextBuilder já inclui "Mensagem atual: ..." no prompt final.
 * Portanto, não concatenamos novamente ao ler do cache.
 */
async function montarContextoOtimizado(params: any) {
  const entrada = String(params.texto ?? "");
  const saudacaoBreve = detectarSaudacaoBreve(entrada);
  const nivel = derivarNivel(entrada, saudacaoBreve);
  const intensidade = Math.max(
    0,
    ...(params.mems ?? []).map((m: any) => Number(m?.intensidade ?? 0))
  );
  const cacheKey = `ctx:${params.userId || "anon"}:${nivel}:${Math.round(
    intensidade
  )}`;

  const cached = PROMPT_CACHE.get(cacheKey);
  if (cached) {
    if (isDebug()) log.debug("[Orchestrator] contexto via cache", { cacheKey });
    return cached; // ✅ já inclui "Mensagem atual: ..."
  }

  const t0 = Date.now();
  const contexto = await ContextBuilder.build(params); // ✅ usa builder unificado
  if (isDebug())
    log.debug("[Orchestrator] contexto construído", { ms: Date.now() - t0 });

  // NV1 tende a se repetir mais — cache curto ajuda
  if (nivel <= 2) PROMPT_CACHE.set(cacheKey, contexto);

  return contexto;
}

function heuristicaPreViva(m: string) {
  const texto = (m || "").toLowerCase();
  const len = texto.length;
  const gat = [
    /ang[uú]st/i,
    /p[aâ]nico/i,
    /desesper/i,
    /crise/i,
    /sofr/i,
    /n[aã]o aguento/i,
    /vontade de sumir/i,
    /explod/i,
    /impulsiv/i,
    /medo/i,
    /ansiedad/i,
    /culpa/i,
    /triste/i,
  ];
  return gat.some((r) => r.test(texto)) || len >= 180;
}

/* -------------------------- Fast-lane --------------------------- */

async function fastLaneLLM({
  messages,
  userName,
}: {
  messages: { role: any; content: string }[];
  userName?: string;
}) {
  const nome = firstName(userName);
  const system =
    "Você é a Eco, um coach de autoconhecimento empático e reflexivo, que guia o usuário a se perceber melhor com clareza e leveza. " +
    "Responda curto (1–2 frases), claro e gentil. Evite jargões. Se pedirem passos, no máximo 3 itens. " +
    (nome
      ? `O usuário se chama ${nome}. Use o nome apenas quando fizer sentido. Nunca corrija nomes nem diga frases como "sou a Eco, não o ${nome}". `
      : "Nunca corrija nomes. ");

  const slim: Array<{ role: "system" | "user" | "assistant"; content: string }> =
    [
      { role: "system", content: system },
      ...messages.slice(-3).map((m) => ({
        role: mapRoleForOpenAI((m as any).role) as
          | "system"
          | "user"
          | "assistant",
        content: (m as any).content,
      })),
    ];

  const data = await claudeChatCompletion({
    messages: slim,
    model: process.env.ECO_FAST_MODEL || "anthropic/claude-3-5-haiku",
    temperature: 0.5,
    maxTokens: 220,
  });

  const raw: string = data?.content ?? "";
  let cleaned = formatarTextoEco(limparResposta(raw || "Posso te ajudar nisso!"));
  cleaned = stripIdentityCorrection(cleaned, nome);
  return { cleaned, usage: data?.usage, model: data?.model };
}

/* -------------------------- Orquestrador ------------------------ */

type SaudRole = "user" | "assistant" | "system";
function toSaudRole(r: any): SaudRole | undefined {
  if (r === "user" || r === "assistant" || r === "system") return r;
  const m = mapRoleForOpenAI(r);
  if (m === "user" || m === "assistant" || m === "system") return m;
  return undefined;
}

export async function getEcoResponse(
  {
    messages,
    userId,
    userName,
    accessToken,
    mems = [],
    forcarMetodoViva = false,
    blocoTecnicoForcado = null,
    clientHour,
    // ⬇️ novos
    promptOverride,
    metaFromBuilder,
  }: GetEcoParams & { promptOverride?: string; metaFromBuilder?: any }
): Promise<GetEcoResult> {
  const t0 = now();
  ensureEnvs();

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Parâmetro "messages" vazio ou inválido.');
  }
  const ultimaMsg = (messages as any).at(-1)?.content || "";

  // 0) micro-reflexo local
  const micro = microReflexoLocal(ultimaMsg);
  if (micro) return { message: micro };

  // 1) saudação/despedida
  const saudaMsgs: SaudMsg[] = [];
  for (const m of (messages as any[]).slice(-4)) {
    saudaMsgs.push({
      role: toSaudRole((m as any).role),
      content: (m as any).content || "",
    });
  }
  const auto = respostaSaudacaoAutomatica({ messages: saudaMsgs, userName, clientHour });
  if (auto?.meta?.isFarewell) return { message: auto.text };
  if (auto?.meta?.isGreeting) {
    if (GreetGuard.can(userId)) {
      GreetGuard.mark(userId);
      return { message: auto.text };
    }
  }

  // 2) roteamento
  const saudacaoBreve = detectarSaudacaoBreve(ultimaMsg);
  const nivelRoteador = derivarNivel(ultimaMsg, saudacaoBreve);
  const low = isLowComplexity(ultimaMsg);
  const vivaAtivo = forcarMetodoViva || heuristicaPreViva(ultimaMsg);

  // 🔁 IMPORTANTE: fast-lane reativada por padrão
  // -> Só força rota completa se houver promptOverride.
  const forceFull = !!promptOverride;

  if (isDebug())
    log.debug("[Orchestrator] roteamento", {
      low,
      vivaAtivo,
      forceFull,
      nivelRoteador,
      ultimaLen: (ultimaMsg || "").length,
    });

  const podeFastLane =
    !forceFull && low && !vivaAtivo && !promptOverride && nivelRoteador <= 1;

  if (podeFastLane) {
    const inicioFast = now();
    const fast = await fastLaneLLM({ messages: messages as any, userName });

    let bloco: any = null;
    try {
      bloco = await gerarBlocoTecnicoComCache(ultimaMsg, fast.cleaned);
    } catch {}

    (async () => {
      try {
        if (userId) {
          const supabase = supabaseWithBearer(accessToken);
          await saveMemoryOrReference({
            supabase,
            userId,
            lastMessageId: (messages as any).at(-1)?.id ?? undefined, // ⬅️ was null
            cleaned: fast.cleaned,
            bloco,
            ultimaMsg,
          });
        }
      } catch (e) {
        log.warn("⚠️ Pós-processo fastLane falhou:", (e as Error).message);
      }
    })();

    trackMensagemEnviada({
      userId,
      tempoRespostaMs: now() - inicioFast,
      tokensUsados: fast?.usage?.total_tokens ?? undefined, // ⬅️ was || null
      modelo: fast?.model,
    });

    const resp: GetEcoResult = { message: fast.cleaned };
    if (bloco && typeof bloco.intensidade === "number") {
      resp.intensidade = bloco.intensidade;
      resp.resumo = bloco?.analise_resumo?.trim().length
        ? bloco.analise_resumo.trim()
        : fast.cleaned;
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

  // 3.1) paralelas — só se NÃO houver promptOverride
  let heuristicas: any[] = [];
  let userEmbedding: number[] = [];
  if (!promptOverride) {
    const paralelas = await Promise.race([
      operacoesParalelas(ultimaMsg, userId),
      sleep(PARALELAS_TIMEOUT_MS).then(() => ({
        heuristicas: [],
        userEmbedding: [],
      })),
    ]);
    heuristicas = paralelas.heuristicas;
    userEmbedding = paralelas.userEmbedding;
  }

  // 3.2) derivados — tolerante a timeout/erro; pula se promptOverride ou NV1
  const shouldSkipDerivados =
    !!promptOverride ||
    (metaFromBuilder && Number(metaFromBuilder.nivel) === 1) ||
    !userId;

  const derivados = shouldSkipDerivados
    ? null
    : await withTimeoutOrNull(
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

            const arr = (efeitos || []).map((r: any) => ({
              x: { efeito: (r.efeito as any) ?? "neutro" },
            }));
            const scores = (efeitos || [])
              .map((r: any) => Number(r?.score))
              .filter((v: number) => Number.isFinite(v));
            const media = scores.length
              ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
              : 0;

            return getDerivados(
              (stats || []) as any,
              (marcos || []) as any,
              arr as any,
              media
            );
          } catch {
            return null;
          }
        })(),
        DERIVADOS_TIMEOUT_MS,
        "derivados"
      );

  const aberturaHibrida = derivados
    ? (() => {
        try {
          return insightAbertura(derivados);
        } catch {
          return null;
        }
      })()
    : null;

  // 3.3) system prompt (usa override se veio da rota)
  const systemPrompt =
    promptOverride ??
    (await montarContextoOtimizado({
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
    }));

  const msgs: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...(messages as any[]).slice(-5).map((m) => ({
      role: mapRoleForOpenAI((m as any).role) as
        | "system"
        | "user"
        | "assistant",
      content: (m as any).content,
    })),
  ];

  const maxTokens =
    ultimaMsg.length < 140 ? 420 : ultimaMsg.length < 280 ? 560 : 700;
  const inicioEco = now();
  const data = await claudeChatCompletion({
    messages: msgs,
    model: process.env.ECO_CLAUDE_MODEL || "anthropic/claude-3-5-sonnet",
    temperature: 0.6,
    maxTokens,
  });
  const duracaoEco = now() - inicioEco;
  if (duracaoEco > 2500)
    trackEcoDemorou({ userId, duracaoMs: duracaoEco, ultimaMsg });

  const raw: string = data?.content ?? "";
  // 🔧 também limpamos identidade aqui para evitar repetições do tipo “sou a Eco…”
  const cleaned = stripIdentityCorrection(
    formatarTextoEco(
      limparResposta(
        raw || "Desculpa, não consegui responder agora. Pode tentar de novo?"
      )
    ),
    firstName(userName)
  );

  let bloco: any = null;
  try {
    bloco = await gerarBlocoTecnicoComCache(ultimaMsg, cleaned);
  } catch {}

  const response: GetEcoResult = { message: cleaned };
  if (bloco && typeof bloco.intensidade === "number") {
    response.intensidade = bloco.intensidade;
    response.resumo = bloco?.analise_resumo?.trim().length
      ? bloco.analise_resumo.trim()
      : cleaned;
    response.emocao = bloco.emocao_principal || "indefinida";
    response.tags = Array.isArray(bloco.tags) ? bloco.tags : [];
    response.categoria = bloco.categoria ?? null;
  } else if (bloco) {
    response.categoria = bloco.categoria ?? null;
  }

  (async () => {
    try {
      if (userId) {
        await saveMemoryOrReference({
          supabase,
          userId,
          lastMessageId: (messages as any).at(-1)?.id ?? undefined, // ⬅️ was null
          cleaned,
          bloco,
          ultimaMsg,
        });
      }
    } catch (e) {
      log.warn("⚠️ Pós-processo falhou:", (e as Error).message);
    }
  })();

  trackMensagemEnviada({
    userId,
    tempoRespostaMs: duracaoEco,
    tokensUsados: data?.usage?.total_tokens ?? undefined, // ⬅️ was || null
    modelo: data?.model,
  });

  if (isDebug())
    log.debug("[Orchestrator] resposta pronta", {
      duracaoEcoMs: duracaoEco,
      lenMensagem: (cleaned || "").length,
    });

  return response;
}

export { getEcoResponse as getEcoResponseOtimizado };
