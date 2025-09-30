import { formatarTextoEco, limparResposta, now, type SessionMetadata } from "../../utils";
import { gerarBlocoTecnicoComCache } from "../../core/EmotionalAnalyzer";
import { saveMemoryOrReference } from "../../services/MemoryService";
import {
  trackEcoDemorou,
  trackMensagemEnviada,
  trackBlocoTecnico,
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
}

export class ResponseFinalizer {
  constructor(
    private readonly deps: ResponseFinalizerDeps = {
      gerarBlocoTecnicoComCache,
      saveMemoryOrReference,
      trackMensagemEnviada,
      trackEcoDemorou,
      trackBlocoTecnico,
      identifyUsuario,
    }
  ) {}

  private getBlocoTimeoutMs(): number {
    const raw = process.env.ECO_BLOCO_TIMEOUT_MS;
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
  }

  private gerarBlocoComTimeout({
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
  }): Promise<any | null> {
    const startedAt = now();
    const timeoutMs = this.getBlocoTimeoutMs();
    if (timeoutMs === 0) {
      return this.deps
        .gerarBlocoTecnicoComCache(ultimaMsg, blocoTarget)
        .then((value) => {
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
    }

    let timeoutId: NodeJS.Timeout | undefined;
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

    const blocoPromise = this.deps
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

    return Promise.race([blocoPromise, timeoutPromise]);
  }

  private async persistirMemoriaEmBackground(params: {
    userId?: string;
    supabase?: any;
    lastMessageId?: string;
    cleaned: string;
    bloco: any;
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

    if (!skipBloco) {
      const reprocessStartedAt = now();
      try {
        blocoParaSalvar = await this.deps.gerarBlocoTecnicoComCache(
          ultimaMsg,
          params.blocoTarget
        );
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
  }: FinalizeParams): Promise<GetEcoResult> {
    const base = formatarTextoEco(
      limparResposta(
        raw || "Desculpa, não consegui responder agora. Pode tentar de novo?"
      )
    );
    const nome = firstName(userName);
    const identityCleaned = stripIdentityCorrection(base, nome);
    const cleaned = stripRedundantGreeting(identityCleaned, hasAssistantBefore);
    const blocoTarget = mode === "fast" ? identityCleaned : cleaned;

    let bloco: any = null;
    if (!skipBloco) {
      bloco = await this.gerarBlocoComTimeout({
        ultimaMsg,
        blocoTarget,
        mode,
        skipBloco,
        distinctId: providedDistinctId ?? sessionMeta?.distinctId ?? userId,
        userId,
      });
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
    const distinctId =
      providedDistinctId ?? sessionMeta?.distinctId ?? userId;
    if (!hasAssistantBefore && sessionMeta?.distinctId) {
      this.deps.identifyUsuario({
        distinctId: sessionMeta.distinctId,
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

    this.deps.trackMensagemEnviada({
      userId,
      distinctId,
      tempoRespostaMs: duracao,
      tokensUsados: usageTokens,
      modelo,
    });

    void this.persistirMemoriaEmBackground({
      userId,
      supabase,
      lastMessageId,
      cleaned,
      bloco,
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
