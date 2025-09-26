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
      try {
        bloco = await this.deps.gerarBlocoTecnicoComCache(ultimaMsg, blocoTarget);
      } catch {}
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

    if (userId) {
      (async () => {
        try {
          await this.deps.saveMemoryOrReference({
            supabase,
            userId,
            lastMessageId,
            cleaned,
            bloco,
            ultimaMsg,
          });
        } catch (e) {
          log.warn("⚠️ Pós-processo falhou:", (e as Error).message);
        }
      })();
    }

    return response;
  }
}

export const defaultResponseFinalizer = new ResponseFinalizer();
