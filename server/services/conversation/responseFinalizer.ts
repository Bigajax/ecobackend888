import {
  formatarTextoEco,
  limparResposta,
  now,
  type SessionMetadata,
} from "../../utils";
import { gerarBlocoTecnicoComCache } from "../../core/EmotionalAnalyzer";
import { saveMemoryOrReference } from "../../services/MemoryService";
import {
  trackEcoDemorou,
  trackMensagemEnviada,
  trackBlocoTecnico,
  trackSessaoEntrouChat,
  identifyUsuario,
  trackRespostaQ,
  trackKnapsackDecision,
  trackBanditArmUpdate,
} from "../../analytics/events/mixpanelEvents";
import mixpanel from "../../lib/mixpanel";
import { log } from "../promptContext/logger";
import {
  firstName,
  stripIdentityCorrection,
  stripRedundantGreeting,
} from "./helpers";
import {
  checkBlocoTecnico,
  checkEstrutura,
  checkMemoria,
  computeQ,
} from "../quality/validators";
import { qualityAnalyticsStore } from "../analytics/analyticsStore";
import { ModuleStore } from "../promptContext/ModuleStore";
import type { GetEcoResult } from "../../utils";
import type { EcoHints } from "../../utils/types";
import type { EcoLatencyMarks } from "./types";
import type { EcoDecisionResult } from "./ecoDecisionHub";
import {
  updateArm as updateBanditArm,
  type BanditSelectionMap,
} from "../orchestrator/bandits/ts";
import { logInteraction } from "../telemetry/interactionLogger";
import type { AnySupabase } from "../../adapters/SupabaseAdapter";
import { createHash } from "node:crypto";

const BANDIT_TOKEN_PENALTY_LAMBDA = 0.01;

type PromptMessage = { role: string; content: string; name?: string };

function computePromptHash(messages?: PromptMessage[]): string | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  const canonical = messages.map((msg) => ({
    role: msg.role,
    content: typeof msg.content === "string" ? msg.content : "",
    ...(typeof (msg as { name?: string }).name === "string"
      ? { name: (msg as { name?: string }).name }
      : {}),
  }));

  try {
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  } catch (error) {
    log.warn("[responseFinalizer] prompt_hash_error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function isSupabaseClient(value: unknown): value is AnySupabase {
  return !!value && typeof (value as AnySupabase).from === "function";
}

interface ResponseFinalizerDeps {
  gerarBlocoTecnicoComCache: typeof gerarBlocoTecnicoComCache;
  saveMemoryOrReference: typeof saveMemoryOrReference;
  trackMensagemEnviada: typeof trackMensagemEnviada;
  trackEcoDemorou: typeof trackEcoDemorou;
  trackBlocoTecnico: typeof trackBlocoTecnico;
  trackSessaoEntrouChat: typeof trackSessaoEntrouChat;
  identifyUsuario: typeof identifyUsuario;
  trackRespostaQ: typeof trackRespostaQ;
  trackKnapsackDecision: typeof trackKnapsackDecision;
  trackBanditArmUpdate: typeof trackBanditArmUpdate;
  telemetry?: { track?: (event: string, payload: Record<string, unknown>) => void };
}

export interface FinalizeParams {
  raw: string;
  ultimaMsg: string;
  userName?: string;
  hasAssistantBefore: boolean;
  userId?: string;
  supabase?: any;
  lastMessageId?: string;
  mode: "fast" | "full";
  startedAt: number;
  usageTokens?: number;
  modelo?: string;
  trackDelayThresholdMs?: number;
  skipBloco?: boolean;
  sessionMeta?: SessionMetadata;
  distinctId?: string;
  sessaoId?: string | null;
  origemSessao?: string | null;
  precomputed?: PrecomputedFinalizeArtifacts;
  isGuest?: boolean;
  guestId?: string | null;
  ecoDecision: EcoDecisionResult;
  moduleCandidates?: Array<{ id: string; activated: boolean; rule?: string | null; threshold?: number | null; signals?: string[] }>;
  selectedModules?: string[];
  timingsSnapshot?: EcoLatencyMarks;
  calHints?: EcoHints | null;
  memsSemelhantes?: Array<{ id?: string | null; tags?: string[] | null }>;
  promptMessages?: PromptMessage[];
  promptTokens?: number;
  completionTokens?: number;
  contextFlags?: Record<string, unknown>;
  contextMeta?: Record<string, unknown>;
  continuity?: {
    hasContinuity: boolean;
    memoryRef: Record<string, unknown> | null;
    similarity?: number | null;
    diasDesde?: number | null;
  };
}

export interface NormalizedEcoResponse {
  base: string;
  identityCleaned: string;
  cleaned: string;
  blocoTarget: string;
}

export interface PrecomputedFinalizeArtifacts {
  normalized: NormalizedEcoResponse;
  blocoPromise?: Promise<any | null>;
  blocoRacePromise?: Promise<any | null>;
}

function ensureTechBlock(
  bloco: any,
  decision: EcoDecisionResult,
  cleaned: string
) {
  const safe = bloco && typeof bloco === "object" ? { ...bloco } : {};
  const safeEmotion = typeof safe.emocao_principal === "string" ? safe.emocao_principal.trim() : "";
  const safeSummary = typeof safe.analise_resumo === "string" ? safe.analise_resumo.trim() : "";
  const safeTags = Array.isArray(safe.tags)
    ? safe.tags
        .map((tag: any) => (typeof tag === "string" ? tag.trim() : ""))
        .filter((tag: string) => tag.length > 0)
    : [];

  return {
    ...safe,
    emocao_principal: safeEmotion || "indefinida",
    intensidade: decision.intensity,
    tags: safeTags,
    dominio_vida: typeof safe.dominio_vida === "string" && safe.dominio_vida.trim().length
      ? safe.dominio_vida
      : null,
    padrao_comportamental:
      typeof safe.padrao_comportamental === "string" && safe.padrao_comportamental.trim().length
        ? safe.padrao_comportamental
        : null,
    nivel_abertura: decision.openness,
    analise_resumo: safeSummary || cleaned,
    categoria:
      typeof safe.categoria === "string" && safe.categoria.trim().length
        ? safe.categoria.trim()
        : null,
  };
}

export class ResponseFinalizer {
  constructor(
    private readonly deps: ResponseFinalizerDeps = {
      gerarBlocoTecnicoComCache,
      saveMemoryOrReference,
      trackMensagemEnviada,
      trackEcoDemorou,
      trackBlocoTecnico,
      trackSessaoEntrouChat,
      identifyUsuario,
      trackRespostaQ,
      trackKnapsackDecision,
      trackBanditArmUpdate,
      telemetry: mixpanel,
    }
  ) {}

  private getBlocoTimeoutMs(): number {
    const raw = process.env.ECO_BLOCO_TIMEOUT_MS;
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
  }

  private collectMemoryAnchors(
    mems?: Array<{ id?: string | null; tags?: string[] | null }>
  ): string[] {
    if (!Array.isArray(mems) || mems.length === 0) return [];
    const anchors = new Set<string>();
    for (const memoria of mems) {
      const rawId = typeof memoria?.id === "string" ? memoria.id.trim() : "";
      if (rawId) {
        anchors.add(`id:${rawId}`);
      }
      const tags = Array.isArray(memoria?.tags) ? memoria.tags : [];
      for (const tag of tags) {
        if (typeof tag !== "string") continue;
        const trimmed = tag.trim();
        if (!trimmed) continue;
        anchors.add(`tag:${trimmed}`);
      }
    }
    return Array.from(anchors);
  }

  public gerarBlocoComTimeout({
    ultimaMsg,
    blocoTarget,
    mode,
    skipBloco,
    distinctId,
    userId,
    intensidade,
  }: {
    ultimaMsg: string;
    blocoTarget: string;
    mode: "fast" | "full";
    skipBloco: boolean;
    distinctId?: string;
    userId?: string;
    intensidade?: number;
  }): { race: Promise<any | null>; full: Promise<any | null> } {
    const startedAt = now();
    const timeoutMs = this.getBlocoTimeoutMs();
    let timeoutId: NodeJS.Timeout | undefined;

    const fullPromise = this.deps
      .gerarBlocoTecnicoComCache(ultimaMsg, blocoTarget)
      .then((value) => {
        if (timeoutId) clearTimeout(timeoutId);
        const duracao = now() - startedAt;
        this.deps.trackBlocoTecnico({
          distinctId,
          userId,
          status: "success",
          mode,
          skipBloco,
          duracaoMs: duracao,
          intensidade:
            typeof intensidade === "number"
              ? intensidade
              : value && typeof value.intensidade === "number"
              ? value.intensidade
              : undefined,
        });
        return value;
      })
      .catch((error) => {
        if (timeoutId) clearTimeout(timeoutId);
        const duracao = now() - startedAt;
        this.deps.trackBlocoTecnico({
          distinctId,
          userId,
          status: "failure",
          mode,
          skipBloco,
          duracaoMs: duracao,
          erro: error instanceof Error ? error.message : String(error),
        });
        return null;
      });

    if (timeoutMs === 0) {
      return { race: fullPromise, full: fullPromise };
    }

    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => {
        log.warn(
          `⚠️ gerarBlocoTecnicoComCache demorou mais de ${timeoutMs}ms; respondendo sem bloco.`
        );
        const duracao = now() - startedAt;
        this.deps.trackBlocoTecnico({
          distinctId,
          userId,
          status: "timeout",
          mode,
          skipBloco,
          duracaoMs: duracao,
        });
        resolve(null);
      }, timeoutMs);
    });

    const racePromise = Promise.race([fullPromise, timeoutPromise]);

    return { race: racePromise, full: fullPromise };
  }

  private async persistirMemoriaEmBackground(params: {
    userId?: string;
    supabase?: any;
    lastMessageId?: string;
    cleaned: string;
    bloco: any;
    blocoPromise?: Promise<any | null>;
    blocoTarget: string;
    ultimaMsg: string;
    skipBloco: boolean;
    mode: "fast" | "full";
    distinctId?: string;
    isGuest?: boolean;
    ecoDecision: EcoDecisionResult;
    contextFlags?: Record<string, unknown>;
    contextMeta?: Record<string, unknown>;
    continuity?: {
      hasContinuity: boolean;
      memoryRef: Record<string, unknown> | null;
      similarity?: number | null;
      diasDesde?: number | null;
    };
  }): Promise<void> {
    const {
      userId,
      supabase,
      lastMessageId,
      cleaned,
      ultimaMsg,
      skipBloco,
      mode,
      distinctId,
      isGuest,
      ecoDecision,
    } = params;
    if (!userId || !supabase || isGuest) return;

    let blocoParaSalvar = params.bloco;

    if (!blocoParaSalvar && params.blocoPromise) {
      try {
        blocoParaSalvar = await params.blocoPromise;
      } catch (e) {
        const mensagem = e instanceof Error ? e.message : String(e);
        log.warn("⚠️ Pós-processo falhou ao aguardar bloco em background:", mensagem);
      }
    }

    if (!skipBloco) {
      const reprocessStartedAt = now();
      try {
        if (!blocoParaSalvar) {
          blocoParaSalvar = await this.deps.gerarBlocoTecnicoComCache(
            ultimaMsg,
            params.blocoTarget
          );
          const duracao = now() - reprocessStartedAt;
          if (blocoParaSalvar) {
            this.deps.trackBlocoTecnico({
              distinctId,
              userId,
              status: "success",
              mode,
              skipBloco,
              duracaoMs: duracao,
              intensidade:
                typeof blocoParaSalvar?.intensidade === "number"
                  ? blocoParaSalvar.intensidade
                  : undefined,
            });
          }
        }
      } catch (e) {
        const mensagem = e instanceof Error ? e.message : String(e);
        log.warn("⚠️ Pós-processo falhou ao gerar bloco completo:", mensagem);
        this.deps.trackBlocoTecnico({
          distinctId,
          userId,
          status: "failure",
          mode,
          skipBloco,
          duracaoMs: now() - reprocessStartedAt,
          erro: mensagem,
        });
      }
    }

    try {
      const saveOutcome = await this.deps.saveMemoryOrReference({
        supabase,
        userId,
        lastMessageId,
        cleaned,
        bloco: blocoParaSalvar,
        ultimaMsg,
        decision: ecoDecision,
      });

      if (lastMessageId && supabase) {
        const intensidadeRounded = Math.max(0, Math.round(ecoDecision.intensity));
        const shouldSaveMemory = ecoDecision.saveMemory && intensidadeRounded >= 7;
        const sentimentoRaw = blocoParaSalvar?.emocao_principal;
        const updates: Record<string, unknown> = { salvar_memoria: shouldSaveMemory };

        if (typeof sentimentoRaw === "string" && sentimentoRaw.trim()) {
          updates.sentimento = sentimentoRaw.trim();
        }

        try {
          await supabase.from("mensagem").update(updates).eq("id", lastMessageId);
        } catch (updateError) {
          const message = updateError instanceof Error ? updateError.message : String(updateError);
          log.warn("[mensagem] Falha ao atualizar mensagem:", message);
        }
      }

      const savedMemoryId =
        saveOutcome && typeof saveOutcome === "object" && saveOutcome !== null
          ? (() => {
              const rawId = (saveOutcome as any).memoryId;
              return typeof rawId === "string" && rawId.trim().length ? rawId.trim() : null;
            })()
          : null;

      const continuityContextFlags = params.contextFlags;
      const continuityMeta = params.contextMeta;
      const continuityFromPipeline = params.continuity;
      const hasContinuityFlag = Boolean(
        typeof (continuityContextFlags as any)?.HAS_CONTINUITY === "boolean"
          ? (continuityContextFlags as any).HAS_CONTINUITY
          : continuityFromPipeline?.hasContinuity
      );
      const continuityRef =
        (continuityMeta as any)?.continuityRef ?? continuityFromPipeline?.memoryRef ?? null;
      const continuityRefId =
        continuityRef && typeof (continuityRef as any)?.id === "string"
          ? String((continuityRef as any).id).trim()
          : "";

      if (hasContinuityFlag && continuityRefId && savedMemoryId) {
        const rpc = supabase?.rpc;
        if (typeof rpc === "function") {
          try {
            await rpc("vincular_memorias", {
              origem_id: continuityRefId,
              destino_id: savedMemoryId,
            });
          } catch (linkError) {
            log.warn({
              msg: "link_memorias_failed",
              err: linkError instanceof Error ? linkError.message : String(linkError),
            });
          }
        } else {
          log.info({ msg: "link_memorias_skipped", reason: "rpc_unavailable" });
        }
      }
    } catch (e) {
      log.warn("⚠️ Pós-processo falhou:", (e as Error).message);
    }
  }

  public normalizeRawResponse({
    raw,
    userName,
    hasAssistantBefore,
    mode,
  }: {
    raw: string;
    userName?: string;
    hasAssistantBefore: boolean;
    mode: "fast" | "full";
  }): NormalizedEcoResponse {
    const base = formatarTextoEco(
      limparResposta(
        raw || "Desculpa, não consegui responder agora. Pode tentar de novo?"
      )
    );
    const nome = firstName(userName);
    const identityCleaned = stripIdentityCorrection(base, nome);
    const cleaned = stripRedundantGreeting(identityCleaned, hasAssistantBefore);
    const blocoTarget = mode === "fast" ? identityCleaned : cleaned;

    return { base, identityCleaned, cleaned, blocoTarget };
  }

  async finalize({
    raw,
    ultimaMsg,
    userName,
    hasAssistantBefore,
    userId,
    supabase,
    lastMessageId,
    mode,
    startedAt,
    usageTokens,
    modelo,
    trackDelayThresholdMs = 2500,
    skipBloco = false,
    sessionMeta,
    distinctId: providedDistinctId,
    sessaoId: providedSessaoId,
    origemSessao,
    precomputed,
    isGuest = false,
    guestId,
    ecoDecision,
    moduleCandidates,
    selectedModules,
    timingsSnapshot,
    calHints,
    memsSemelhantes,
    promptMessages,
    promptTokens,
    completionTokens,
    contextFlags,
    contextMeta,
    continuity,
  }: FinalizeParams): Promise<GetEcoResult> {
    const distinctId =
      providedDistinctId ?? sessionMeta?.distinctId ?? guestId ?? userId;
    const resolvedSessaoId = providedSessaoId ?? sessionMeta?.sessaoId ?? null;
    const supabaseClient = isSupabaseClient(supabase) ? (supabase as AnySupabase) : null;
    const promptHash = computePromptHash(promptMessages);

    if (!hasAssistantBefore) {
      const sessaoId = resolvedSessaoId ?? undefined;
      const origem = origemSessao ?? sessionMeta?.origem ?? undefined;

      this.deps.trackSessaoEntrouChat({
        distinctId,
        userId,
        mode,
        sessaoId,
        origem,
        versaoApp: sessionMeta?.versaoApp,
        device: sessionMeta?.device,
        ambiente: sessionMeta?.ambiente,
      });
    }

    const normalized =
      precomputed?.normalized ??
      this.normalizeRawResponse({ raw, userName, hasAssistantBefore, mode });

    const { cleaned, blocoTarget } = normalized;

    const shouldBuildTechBlock = ecoDecision.hasTechBlock && !skipBloco;

    let bloco: any = null;
    let blocoPromise: Promise<any | null> | undefined;
    let blocoRacePromise: Promise<any | null> | undefined;
    if (shouldBuildTechBlock) {
      blocoPromise = precomputed?.blocoPromise;
      blocoRacePromise = precomputed?.blocoRacePromise ?? blocoPromise;

      if (!blocoPromise || !blocoRacePromise) {
        const blocoTimeout = this.gerarBlocoComTimeout({
          ultimaMsg,
          blocoTarget,
          mode,
          skipBloco: false,
          distinctId: providedDistinctId ?? sessionMeta?.distinctId ?? userId,
          userId,
          intensidade: ecoDecision.intensity,
        });
        blocoPromise = blocoTimeout.full;
        blocoRacePromise = blocoTimeout.race;
      }

      if (mode === "fast") {
        this.deps.trackBlocoTecnico({
          distinctId: providedDistinctId ?? sessionMeta?.distinctId ?? userId,
          userId,
          status: "pending",
          mode,
          skipBloco: false,
        });
      } else {
        bloco = await blocoRacePromise;
      }
    }

    const normalizedBloco = shouldBuildTechBlock
      ? ensureTechBlock(bloco, ecoDecision, cleaned)
      : null;

    const response: GetEcoResult = { message: cleaned, intensidade: ecoDecision.intensity };
    if (normalizedBloco) {
      response.resumo = normalizedBloco.analise_resumo;
      response.emocao = normalizedBloco.emocao_principal || "indefinida";
      response.tags = normalizedBloco.tags ?? [];
      response.categoria = normalizedBloco.categoria ?? null;
    } else {
      response.resumo = cleaned;
      response.tags = [];
      response.categoria = null;
      response.emocao = "indefinida";
    }

    const resolvedSelectedModules = Array.isArray(selectedModules)
      ? selectedModules
      : ecoDecision.debug.selectedModules;

    const moduleTokenCache = new Map<string, number | null>();
    const moduleUsageLogs = resolvedSelectedModules.map((moduleId, index) => {
      let cached = moduleTokenCache.get(moduleId);
      if (cached === undefined) {
        try {
          const count = ModuleStore.tokenCountOf(moduleId);
          cached = Number.isFinite(count) ? Number(count) : null;
        } catch {
          cached = null;
        }
        moduleTokenCache.set(moduleId, cached);
      }

      return {
        moduleKey: moduleId,
        tokens: cached,
        position: index,
      };
    });

    const banditRewardRecords: Array<{ pilar: string; arm: string; recompensa: number }> = [];
    const moduleOutcomeRecords: Array<{
      module_id: string;
      tokens: number;
      q: number;
      vpt: number | null;
    }> = [];

    const debugTrace = {
      inputPreview: ultimaMsg.slice(0, 200),
      intensity: ecoDecision.intensity,
      openness: ecoDecision.openness,
      isVulnerable: ecoDecision.isVulnerable,
      vivaSteps: ecoDecision.vivaSteps,
      saveMemory: ecoDecision.saveMemory,
      hasTechBlock: ecoDecision.hasTechBlock,
      moduleCandidates: moduleCandidates ?? ecoDecision.debug.modules,
      selectedModules: resolvedSelectedModules,
      signals: ecoDecision.debug,
      latencyMs: now() - startedAt,
      timings: timingsSnapshot ?? undefined,
    };

    if (process.env.ECO_LOGIC_DEBUG === "1") {
      log.info("[ECO_LOGIC_DEBUG] decision", debugTrace);
    }

    const contextFlagValue =
      contextFlags && typeof (contextFlags as any)?.HAS_CONTINUITY === "boolean"
        ? Boolean((contextFlags as any).HAS_CONTINUITY)
        : false;
    const continuityFlag = Boolean(
      continuity?.hasContinuity ?? contextFlagValue
    );
    const continuityRef = continuity?.memoryRef ?? (contextMeta as any)?.continuityRef ?? null;

    try {
      const continuityRefId =
        continuityFlag && continuityRef && typeof (continuityRef as any)?.id === "string"
          ? String((continuityRef as any).id)
          : null;
      const continuitySimilarity =
        continuityFlag && typeof (continuityRef as any)?.similarity === "number"
          ? Number((continuityRef as any).similarity)
          : null;
      this.deps.telemetry?.track?.("eco_continuity_used", {
        user_id: userId ?? null,
        has_continuity: continuityFlag,
        memory_ref_id: continuityRefId,
        similarity: continuitySimilarity,
      });
    } catch (telemetryError) {
      if (process.env.ECO_DEBUG === "1") {
        log.debug("[telemetry] eco_continuity_used_failed", {
          message:
            telemetryError instanceof Error ? telemetryError.message : String(telemetryError),
        });
      }
    }

    response.meta = {
      ...(response.meta ?? {}),
      continuity: {
        hasContinuity: continuityFlag,
        memoryRef: continuityFlag ? (continuityRef ?? null) : null,
      },
      debug_trace: debugTrace,
    };

    const duracao = now() - startedAt;
    if (sessionMeta && !isGuest) {
      this.deps.identifyUsuario({
        distinctId,
        userId,
        versaoApp: sessionMeta.versaoApp ?? null,
        device: sessionMeta.device ?? null,
        ambiente: sessionMeta.ambiente ?? null,
      });
    }

    if (mode === "full" && duracao > trackDelayThresholdMs) {
      this.deps.trackEcoDemorou({
        userId,
        distinctId,
        duracaoMs: duracao,
        ultimaMsg,
      });
    }

    const blocoStatus = shouldBuildTechBlock
      ? mode === "fast"
        ? "pending"
        : normalizedBloco
        ? "ready"
        : "missing"
      : "skipped";

    this.deps.trackMensagemEnviada({
      userId,
      distinctId,
      tempoRespostaMs: duracao,
      tokensUsados: usageTokens,
      modelo,
      blocoStatus,
    });

    const memoryAnchors = this.collectMemoryAnchors(memsSemelhantes);
    const memCount = Array.isArray(memsSemelhantes) ? memsSemelhantes.length : 0;
    const estruturadoOk = checkEstrutura(cleaned);
    const memoriaOk =
      memoryAnchors.length > 0
        ? checkMemoria(response.message ?? cleaned, memoryAnchors)
        : false;
    const blocoOk = checkBlocoTecnico(raw, ecoDecision.intensity);
    const q = computeQ({
      estruturado_ok: estruturadoOk,
      memoria_ok: memoriaOk,
      bloco_ok: blocoOk,
    });
    const tokensTotal =
      typeof usageTokens === "number" && Number.isFinite(usageTokens)
        ? Number(usageTokens)
        : undefined;
    const tokensTotalValue = tokensTotal ?? null;
    const promptTokenCount =
      typeof promptTokens === "number" && Number.isFinite(promptTokens)
        ? Number(promptTokens)
        : null;
    const completionTokenCount =
      typeof completionTokens === "number" && Number.isFinite(completionTokens)
        ? Number(completionTokens)
        : null;

    const knapsackInfo = ecoDecision.debug.knapsack ?? null;
    let tokensAditivos: number | undefined;
    if (knapsackInfo) {
      const storedTokens = Number(knapsackInfo.tokensAditivos);
      if (Number.isFinite(storedTokens) && storedTokens > 0) {
        tokensAditivos = storedTokens;
      } else if (Array.isArray(knapsackInfo.adotados)) {
        try {
          const sum = knapsackInfo.adotados.reduce((acc, id) => {
            const tokens = ModuleStore.tokenCountOf(id);
            return acc + (Number.isFinite(tokens) ? tokens : 0);
          }, 0);
          tokensAditivos = sum > 0 ? sum : undefined;
        } catch {
          tokensAditivos = undefined;
        }
      }

      try {
        this.deps.trackKnapsackDecision({
          distinctId,
          userId,
          budget: knapsackInfo.budget,
          adotados: Array.isArray(knapsackInfo.adotados)
            ? knapsackInfo.adotados
            : [],
          marginal_gain: knapsackInfo.marginalGain,
          tokens_aditivos: tokensAditivos,
        });
      } catch (error) {
        if (process.env.ECO_DEBUG === "1") {
          const message = error instanceof Error ? error.message : String(error);
          log.debug("[Knapsack] track_failed", { message });
        }
      }
    }

    const banditSelections =
      (ecoDecision.banditArms as BanditSelectionMap | undefined) ??
      (ecoDecision.debug?.bandits as BanditSelectionMap | undefined);
    if (banditSelections && Object.values(banditSelections).some(Boolean)) {
      const safeTokens =
        typeof tokensTotal === "number" && Number.isFinite(tokensTotal)
          ? Math.max(tokensTotal, 0)
          : 0;
      const reward = q - BANDIT_TOKEN_PENALTY_LAMBDA * (safeTokens / 1000);
      if (Number.isFinite(reward)) {
        for (const selection of Object.values(banditSelections)) {
          if (!selection) continue;
          const moduleId = typeof selection.module === "string" ? selection.module : "";
          if (!moduleId) continue;
          if (!resolvedSelectedModules.includes(moduleId)) continue;

          updateBanditArm(selection.pilar, selection.arm, reward);
          banditRewardRecords.push({
            pilar: selection.pilar,
            arm: selection.arm,
            recompensa: Number(reward),
          });
          try {
            this.deps.trackBanditArmUpdate({
              distinctId,
              userId,
              pilar: selection.pilar,
              arm: selection.arm,
              recompensa: reward,
            });
          } catch {
            // telemetria é best-effort
          }
        }
      }
    }

    if (resolvedSelectedModules.length) {
      const uniqueModules = Array.from(new Set(resolvedSelectedModules));
      for (const moduleId of uniqueModules) {
        try {
          let tokens = moduleTokenCache.get(moduleId);
          if (tokens === undefined) {
            const count = ModuleStore.tokenCountOf(moduleId);
            tokens = Number.isFinite(count) ? Number(count) : null;
            moduleTokenCache.set(moduleId, tokens);
          }

          if (!Number.isFinite(tokens) || (tokens ?? 0) <= 0) continue;

          const numericTokens = Number(tokens);
          qualityAnalyticsStore.recordModuleOutcome(moduleId, {
            q,
            tokens: numericTokens,
          });
          const computedVpt = numericTokens > 0 ? q / numericTokens : null;
          moduleOutcomeRecords.push({
            module_id: moduleId,
            tokens: numericTokens,
            q,
            vpt:
              computedVpt != null && Number.isFinite(computedVpt)
                ? Number(computedVpt.toFixed(6))
                : null,
          });
        } catch {
          // métricas são best-effort
        }
      }
    }

    try {
      this.deps.trackRespostaQ({
        distinctId,
        userId,
        Q: q,
        estruturado_ok: estruturadoOk,
        memoria_ok: memoriaOk,
        bloco_ok: blocoOk,
        tokens_total: tokensTotal,
        tokens_aditivos: tokensAditivos,
        mem_count: memCount,
      });
    } catch (error) {
      if (process.env.ECO_DEBUG === "1") {
        const message = error instanceof Error ? error.message : String(error);
        log.debug("[Quality] track_failed", { message });
      }
    }

    try {
      qualityAnalyticsStore.recordQualitySample({
        timestamp: now(),
        q,
        estruturado_ok: estruturadoOk,
        memoria_ok: memoriaOk,
        bloco_ok: blocoOk,
      });
    } catch {
      // store failures não devem bloquear fluxo
    }

    void this.persistirMemoriaEmBackground({
      userId,
      supabase,
      lastMessageId,
      cleaned,
      bloco: normalizedBloco,
      blocoPromise: shouldBuildTechBlock ? blocoPromise : undefined,
      blocoTarget,
      ultimaMsg,
      skipBloco: !shouldBuildTechBlock,
      mode,
      distinctId,
      isGuest,
      ecoDecision,
      contextFlags,
      contextMeta,
      continuity,
    });

    if (calHints && typeof calHints.score === "number") {
      response.meta = {
        ...(response.meta ?? {}),
        cal_used: calHints.score >= 0.6,
        cal_key: calHints.key ?? null,
        cal_flags: calHints.flags ?? [],
        cal_score: calHints.score,
      };
    }

    const analyticsMeta = {
      response_id: null as string | null,
      q,
      estruturado_ok: estruturadoOk,
      memoria_ok: memoriaOk,
      bloco_ok: blocoOk,
      tokens_total: tokensTotalValue,
      prompt_tokens: promptTokenCount,
      completion_tokens: completionTokenCount ?? tokensTotalValue,
      tokens_aditivos: tokensAditivos ?? null,
      mem_count: memCount,
      bandit_rewards: banditRewardRecords,
      module_outcomes: moduleOutcomeRecords,
      knapsack: knapsackInfo
        ? {
            budget: Number.isFinite(knapsackInfo.budget) ? Number(knapsackInfo.budget) : null,
            adotados: Array.isArray(knapsackInfo.adotados)
              ? knapsackInfo.adotados.filter((value) => typeof value === "string")
              : [],
            ganho_estimado: Number.isFinite(knapsackInfo.marginalGain)
              ? Number(knapsackInfo.marginalGain)
              : null,
            tokens_aditivos: tokensAditivos ?? null,
          }
        : null,
      latency: {
        ttfb_ms: null as number | null,
        ttlc_ms:
          typeof debugTrace.latencyMs === "number" && Number.isFinite(debugTrace.latencyMs)
            ? Number(debugTrace.latencyMs)
            : null,
        tokens_total: tokensTotalValue,
      },
    };

    const latencyMs = Number.isFinite(duracao) ? Math.max(0, Math.round(duracao)) : null;

    let interactionId: string | null = null;

    if (supabaseClient) {
      try {
        interactionId = await logInteraction({
          supabase: supabaseClient,
          interaction: {
            userId: userId ?? null,
            sessionId: resolvedSessaoId,
            messageId: lastMessageId ?? null,
            promptHash,
            moduleCombo: resolvedSelectedModules,
            tokensIn: promptTokenCount,
            tokensOut: completionTokenCount ?? tokensTotalValue,
            latencyMs,
          },
          moduleUsages: moduleUsageLogs,
        });
      } catch (error) {
        log.warn("[responseFinalizer] interaction_log_error", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      const mixpanelProps: Record<string, unknown> = {
        latencyMs,
        mode,
        hasTechBlock: shouldBuildTechBlock,
        moduleCount: moduleUsageLogs.length,
      };

      if (distinctId) {
        mixpanelProps.distinct_id = distinctId;
      }
      if (userId) {
        mixpanelProps.userId = userId;
      }
      if (resolvedSessaoId) {
        mixpanelProps.sessionId = resolvedSessaoId;
      }
      if (lastMessageId) {
        mixpanelProps.messageId = lastMessageId;
      }
      if (promptHash) {
        mixpanelProps.promptHash = promptHash;
      }
      if (promptTokenCount != null) {
        mixpanelProps.tokensIn = promptTokenCount;
      }
      const tokensOutForEvent = completionTokenCount ?? tokensTotalValue;
      if (tokensOutForEvent != null) {
        mixpanelProps.tokensOut = tokensOutForEvent;
      }
      if (resolvedSelectedModules.length) {
        mixpanelProps.moduleCombo = resolvedSelectedModules;
      }

      mixpanel.track("BE:Interaction Logged", mixpanelProps);
    } catch (error) {
      log.warn("[responseFinalizer] mixpanel_interaction_log_error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    analyticsMeta.response_id = interactionId ?? null;

    response.meta = {
      ...(response.meta ?? {}),
      analytics: analyticsMeta,
      interaction_id: interactionId ?? null,
    };

    return response;
  }
}

export const defaultResponseFinalizer = new ResponseFinalizer();
