import { claudeChatCompletion, type Msg } from "../../core/ClaudeAdapter";
import { log } from "../promptContext/logger";
import { now } from "../../utils";

import { buildStreamingMetaPayload } from "./responseMetadata";
import { salvarMemoriaViaRPC } from "./memoryPersistence";
import { defaultResponseFinalizer } from "./responseFinalizer";
import type { ChatMessage, GetEcoResult } from "../../utils";
import type { EcoLatencyMarks } from "./types";

interface FullExecutionParams {
  prompt: Msg[];
  maxTokens: number;
  principalModel: string;
  ultimaMsg: string;
  userName?: string | null;
  decision: { hasAssistantBefore: boolean };
  userId: string;
  supabase: any;
  lastMessageId?: string;
  sessionMeta?: any;
  timings: EcoLatencyMarks;
  thread: ChatMessage[];
}

export async function executeFullLLM({
  prompt,
  maxTokens,
  principalModel,
  ultimaMsg,
  userName,
  decision,
  userId,
  supabase,
  lastMessageId,
  sessionMeta,
  timings,
  thread,
}: FullExecutionParams): Promise<GetEcoResult> {
  let data: any;
  timings.llmStart = now();
  log.info("// LATENCY: llm_request_start", {
    at: timings.llmStart,
    sincePromptReadyMs:
      timings.contextBuildEnd && timings.llmStart
        ? timings.llmStart - timings.contextBuildEnd
        : undefined,
  });

  try {
    data = await claudeChatCompletion({
      messages: prompt,
      model: principalModel,
      temperature: 0.6,
      maxTokens,
    });
  } catch (error: any) {
    log.warn(`[getEcoResponse] LLM rota completa falhou: ${error?.message}`);
    const msg = "Desculpa, tive um problema técnico agora. Topa tentar de novo?";
    return defaultResponseFinalizer.finalize({
      raw: msg,
      ultimaMsg,
      userName: userName ?? undefined,
      hasAssistantBefore: decision.hasAssistantBefore,
      userId,
      supabase,
      lastMessageId,
      mode: "full",
      startedAt: timings.llmStart,
      usageTokens: undefined,
      modelo: "full-fallback",
      skipBloco: true,
      sessionMeta,
      sessaoId: sessionMeta?.sessaoId ?? undefined,
      origemSessao: sessionMeta?.origem ?? undefined,
    });
  }

  timings.llmEnd = now();
  log.info("// LATENCY: llm_request_end", {
    at: timings.llmEnd,
    durationMs:
      timings.llmStart && timings.llmEnd ? timings.llmEnd - timings.llmStart : undefined,
  });

  const finalized = await defaultResponseFinalizer.finalize({
    raw: data?.content ?? "",
    ultimaMsg,
    userName: userName ?? undefined,
    hasAssistantBefore: decision.hasAssistantBefore,
    userId,
    supabase,
    lastMessageId,
    mode: "full",
    startedAt: timings.llmStart,
    usageTokens: data?.usage?.total_tokens ?? undefined,
    modelo: data?.model,
    sessionMeta,
    sessaoId: sessionMeta?.sessaoId ?? undefined,
    origemSessao: sessionMeta?.origem ?? undefined,
  });

  try {
    const metaPayload = buildStreamingMetaPayload(
      {
        intensidade: finalized.intensidade,
        analise_resumo: finalized.resumo,
        emocao_principal: finalized.emocao,
        categoria: finalized.categoria,
        tags: finalized.tags,
      } as any,
      finalized.message ?? ""
    );

    if (metaPayload && metaPayload.intensidade >= 7) {
      const rpcRes = await salvarMemoriaViaRPC({
        supabase,
        userId,
        mensagemId: (thread.at(-1)?.id as string) ?? null,
        meta: metaPayload,
        origem: "full_sync",
      });
      if (rpcRes.saved) {
        log.info("[FullSync] memoria salva via RPC", {
          memoriaId: rpcRes.memoriaId,
          primeira: rpcRes.primeira,
        });
      }
    }
  } catch (error: any) {
    log.warn("[FullSync] salvarMemoriaViaRPC falhou (ignorado)", { message: error?.message });
  }

  return finalized;
}
