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
  }: {
    ultimaMsg: string;
    blocoTarget: string;
    mode: "fast" | "full";
    skipBloco: boolean;
    distinctId?: string;
    userId?: string;
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
            value && typeof value.intensidade === "number"
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
    } = params;
    if (!userId) return;

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
      });
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
  }: FinalizeParams): Promise<GetEcoResult> {
    const distinctId = providedDistinctId ?? sessionMeta?.distinctId ?? userId;

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

    let bloco: any = null;
    let blocoPromise: Promise<any | null> | undefined;
    let blocoRacePromise: Promise<any | null> | undefined;
    if (!skipBloco) {
      blocoPromise = precomputed?.blocoPromise;
      blocoRacePromise = precomputed?.blocoRacePromise ?? blocoPromise;

      if (!blocoPromise || !blocoRacePromise) {
        const blocoTimeout = this.gerarBlocoComTimeout({
          ultimaMsg,
          blocoTarget,
          mode,
          skipBloco,
          distinctId: providedDistinctId ?? sessionMeta?.distinctId ?? userId,
          userId,
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
          skipBloco,
        });
      } else {
        bloco = await blocoRacePromise;
      }
    }

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

    const duracao = now() - startedAt;
    if (sessionMeta) {
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

    const blocoStatus = skipBloco
      ? "skipped"
      : mode === "fast"
      ? "pending"
      : bloco
      ? "ready"
      : "missing";

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
      bloco,
      blocoPromise,
      blocoTarget,
      ultimaMsg,
      skipBloco,
      mode,
      distinctId,
    });

    return response;
  }
}

export const defaultResponseFinalizer = new ResponseFinalizer();
