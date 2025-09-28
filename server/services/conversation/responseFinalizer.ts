import { formatarTextoEco, limparResposta, now } from "../../utils";
import { gerarBlocoTecnicoComCache } from "../../core/EmotionalAnalyzer";
import { saveMemoryOrReference } from "../../services/MemoryService";
import {
  trackEcoDemorou,
  trackMensagemEnviada,
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
}

export class ResponseFinalizer {
  constructor(
    private readonly deps: ResponseFinalizerDeps = {
      gerarBlocoTecnicoComCache,
      saveMemoryOrReference,
      trackMensagemEnviada,
      trackEcoDemorou,
    }
  ) {}

  private getBlocoTimeoutMs(): number {
    const raw = process.env.ECO_BLOCO_TIMEOUT_MS;
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
  }

  private gerarBlocoComTimeout(
    ultimaMsg: string,
    blocoTarget: string
  ): Promise<any | null> {
    const timeoutMs = this.getBlocoTimeoutMs();
    if (timeoutMs === 0) {
      return this.deps
        .gerarBlocoTecnicoComCache(ultimaMsg, blocoTarget)
        .catch(() => null);
    }

    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => {
        log.warn(
          `⚠️ gerarBlocoTecnicoComCache demorou mais de ${timeoutMs}ms; respondendo sem bloco.`
        );
        resolve(null);
      }, timeoutMs);
    });

    const blocoPromise = this.deps
      .gerarBlocoTecnicoComCache(ultimaMsg, blocoTarget)
      .then((value) => {
        if (timeoutId) clearTimeout(timeoutId);
        return value;
      })
      .catch(() => {
        if (timeoutId) clearTimeout(timeoutId);
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
  }): Promise<void> {
    const { userId, supabase, lastMessageId, cleaned, ultimaMsg, skipBloco } = params;
    if (!userId) return;

    let blocoParaSalvar = params.bloco;

    if (!skipBloco) {
      try {
        blocoParaSalvar = await this.deps.gerarBlocoTecnicoComCache(
          ultimaMsg,
          params.blocoTarget
        );
      } catch (e) {
        const mensagem = e instanceof Error ? e.message : String(e);
        log.warn("⚠️ Pós-processo falhou ao gerar bloco completo:", mensagem);
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
      bloco = await this.gerarBlocoComTimeout(ultimaMsg, blocoTarget);
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
    if (mode === "full" && duracao > trackDelayThresholdMs) {
      this.deps.trackEcoDemorou({ userId, duracaoMs: duracao, ultimaMsg });
    }

    this.deps.trackMensagemEnviada({
      userId,
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
    });

    return response;
  }
}

export const defaultResponseFinalizer = new ResponseFinalizer();
