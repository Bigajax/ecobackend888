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
} from "../../analytics/events/mixpanelEvents";
import { log } from "../promptContext/logger";
import {
  firstName,
  stripIdentityCorrection,
  stripRedundantGreeting,
} from "./helpers";
import type { GetEcoResult } from "../../utils";
import type { EcoLatencyMarks } from "./types";
import type { EcoDecisionResult } from "./ecoDecisionHub";

interface ResponseFinalizerDeps {
  gerarBlocoTecnicoComCache: typeof gerarBlocoTecnicoComCache;
  saveMemoryOrReference: typeof saveMemoryOrReference;
  trackMensagemEnviada: typeof trackMensagemEnviada;
  trackEcoDemorou: typeof trackEcoDemorou;
  trackBlocoTecnico: typeof trackBlocoTecnico;
  trackSessaoEntrouChat: typeof trackSessaoEntrouChat;
  identifyUsuario: typeof identifyUsuario;
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
    }
  ) {}

  private getBlocoTimeoutMs(): number {
    const raw = process.env.ECO_BLOCO_TIMEOUT_MS;
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
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
      await this.deps.saveMemoryOrReference({
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
  }: FinalizeParams): Promise<GetEcoResult> {
    const distinctId =
      providedDistinctId ?? sessionMeta?.distinctId ?? guestId ?? userId;

    if (!hasAssistantBefore) {
      const sessaoId = providedSessaoId ?? sessionMeta?.sessaoId ?? undefined;
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

    const debugTrace = {
      inputPreview: ultimaMsg.slice(0, 200),
      intensity: ecoDecision.intensity,
      openness: ecoDecision.openness,
      isVulnerable: ecoDecision.isVulnerable,
      vivaSteps: ecoDecision.vivaSteps,
      saveMemory: ecoDecision.saveMemory,
      hasTechBlock: ecoDecision.hasTechBlock,
      moduleCandidates: moduleCandidates ?? ecoDecision.debug.modules,
      selectedModules: selectedModules ?? ecoDecision.debug.selectedModules,
      signals: ecoDecision.debug,
      latencyMs: now() - startedAt,
      timings: timingsSnapshot ?? undefined,
    };

    if (process.env.ECO_LOGIC_DEBUG === "1") {
      log.info("[ECO_LOGIC_DEBUG] decision", debugTrace);
    }

    response.meta = { ...(response.meta ?? {}), debug_trace: debugTrace };

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
    });

    return response;
  }
}

export const defaultResponseFinalizer = new ResponseFinalizer();
