// routes/openrouterRoutes.ts
import express, { type Request, type Response } from "express";
import { supabase } from "../lib/supabaseAdmin"; // ✅ usa a instância (não é função)

import {
  getEcoResponse,
  type EcoStreamHandler,
  type EcoLatencyMarks,
} from "../services/ConversationOrchestrator";
import { embedTextoCompleto } from "../adapters/embeddingService";
import { buscarMemoriasSemelhantes } from "../services/buscarMemorias";
import { extractSessionMeta } from "./sessionMeta";
import { trackMensagemRecebida } from "../analytics/events/mixpanelEvents";

// montar contexto e log
import { ContextBuilder } from "../services/promptContext";
import { log, isDebug } from "../services/promptContext/logger";
import { now } from "../utils";

const router = express.Router();

// log seguro
const safeLog = (s: string) =>
  process.env.NODE_ENV === "production" ? (s || "").slice(0, 60) + "…" : s || "";

const getMensagemTipo = (
  mensagens: Array<{ role?: string }> | null | undefined
): "inicial" | "continuacao" => {
  if (!Array.isArray(mensagens) || mensagens.length === 0) return "inicial";
  if (mensagens.length === 1) return mensagens[0]?.role === "assistant" ? "continuacao" : "inicial";

  let previousUserMessages = 0;
  for (let i = 0; i < mensagens.length - 1; i += 1) {
    const role = mensagens[i]?.role;
    if (role === "assistant") return "continuacao";
    if (role === "user") previousUserMessages += 1;
  }

  return previousUserMessages > 0 ? "continuacao" : "inicial";
};

// normalizador
function normalizarMensagens(body: any): Array<{ role: string; content: any }> | null {
  const { messages, mensagens, mensagem } = body || {};
  if (Array.isArray(messages)) return messages;
  if (Array.isArray(mensagens)) return mensagens;
  if (mensagem) return [{ role: "user", content: mensagem }];
  return null;
}

router.post("/ask-eco", async (req: Request, res: Response) => {
  const t0 = now();
  const { usuario_id, nome_usuario } = req.body;
  const mensagensParaIA = normalizarMensagens(req.body);

  // auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de acesso ausente." });
  }
  const token = authHeader.replace("Bearer ", "").trim();

  if (!usuario_id || !mensagensParaIA) {
    return res.status(400).json({ error: "usuario_id e messages são obrigatórios." });
  }

  try {
    // ✅ NÃO chamar como função: o cliente já é a instância
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Token inválido ou usuário não encontrado." });
    }

    const sessionMeta = extractSessionMeta(req.body);

    const streamingRes = res as Response & { flush?: () => void; flushHeaders?: () => void };
    let sseStarted = false;
    let streamClosed = false;
    let latestTimings: EcoLatencyMarks | undefined;
    let firstChunkLogged = false;

    const startSse = () => {
      if (sseStarted) return;
      sseStarted = true;
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream"); // LATENCY: formato SSE imediato.
      res.setHeader("Cache-Control", "no-cache"); // LATENCY: evita buffering no cliente.
      res.setHeader("Connection", "keep-alive"); // LATENCY: mantém socket aberto.
      streamingRes.flushHeaders?.(); // LATENCY: envia cabeçalhos sem aguardar payload.
      streamingRes.flush?.(); // LATENCY: força o envio imediato do preâmbulo.
    };

    const sendSse = (payload: Record<string, unknown>) => {
      if (streamClosed) return;
      startSse();
      streamingRes.write(`data: ${JSON.stringify(payload)}\n\n`); // LATENCY: chunk incremental da resposta.
      streamingRes.flush?.(); // LATENCY: garante entrega sem buffering adicional.
    };

    const emitLatency = (
      stage: "prompt_ready" | "ttfb" | "ttlc",
      at: number,
      timings?: EcoLatencyMarks
    ) => {
      const sinceStartMs = at - t0;
      log.info(`// LATENCY: ${stage}`, {
        at,
        sinceStartMs,
        timings,
      });
      sendSse({ type: "latency", stage, at, sinceStartMs, timings });
    };

    startSse();

    req.on("close", () => {
      streamClosed = true;
    });

    const ultimaMsg = String(mensagensParaIA.at(-1)?.content ?? "");
    log.info("🗣️ Última mensagem:", safeLog(ultimaMsg));

    trackMensagemRecebida({
      distinctId: sessionMeta?.distinctId,
      userId: usuario_id,
      origem: "texto",
      tipo: getMensagemTipo(mensagensParaIA),
      tamanhoCaracteres: ultimaMsg.length,
      timestamp: new Date().toISOString(),
      sessaoId: sessionMeta?.sessaoId ?? null,
      origemSessao: sessionMeta?.origem ?? null,
    });

    const sendErrorAndEnd = (message: string) => {
      sendSse({ type: "error", message });
      if (!streamClosed) {
        streamClosed = true;
        streamingRes.end(); // LATENCY: encerra imediatamente o fluxo SSE.
      }
    };

    // embedding opcional (garante number[])
    let queryEmbedding: number[] | undefined;
    if (ultimaMsg.trim().length >= 6) {
      try {
        const raw = await embedTextoCompleto(ultimaMsg);
        const arr = Array.isArray(raw) ? raw : JSON.parse(String(raw));
        if (Array.isArray(arr)) {
          const coerced = (arr as unknown[]).map((v) => Number(v));
          if (!coerced.some((n) => Number.isNaN(n))) {
            queryEmbedding = coerced;
          }
        }
      } catch (e) {
        log.warn("⚠️ Falha ao gerar embedding:", (e as Error)?.message);
      }
    }

    // threshold adaptativo
    let threshold = 0.15;
    if (ultimaMsg.trim().length < 20) threshold = 0.1;
    if (/lembr|record|memó/i.test(ultimaMsg)) threshold = Math.min(threshold, 0.12);

    // memórias
    let memsSimilares: any[] = [];
    try {
      memsSimilares = await buscarMemoriasSemelhantes(usuario_id, {
        userEmbedding: queryEmbedding,
        texto: queryEmbedding ? undefined : ultimaMsg,
        k: 4, // LATENCY: top_k
        threshold,
      });
      log.info(
        "🔎 Memórias similares:",
        memsSimilares.map((m) => ({
          id: typeof m.id === "string" ? m.id.slice(0, 8) : m.id,
          sim: m.similaridade ?? m.similarity ?? 0,
        }))
      );
    } catch (memErr) {
      log.warn("⚠️ Falha na busca de memórias semelhantes:", (memErr as Error)?.message);
      memsSimilares = [];
    }

    // ===== monta contexto com ContextBuilder (sem 'new') =====
    const buildIn = {
      userId: usuario_id,
      texto: ultimaMsg,
      perfil: req.body?.perfil ?? null,
      heuristicas: req.body?.heuristicas ?? null,
      mems: memsSimilares,
      blocoTecnicoForcado: req.body?.blocoTecnicoForcado ?? null,
      forcarMetodoViva: req.body?.forcarMetodoViva ?? false,
      aberturaHibrida: req.body?.aberturaHibrida ?? null,
    };
    const contexto = await ContextBuilder.build(buildIn);
    const prompt = contexto.montarMensagemAtual(ultimaMsg);

    if (isDebug()) {
      log.debug("[ask-eco] Contexto montado", {
        promptLen: typeof prompt === "string" ? prompt.length : -1,
      });
    }

    let doneNotified = false;
    const streamHandler: EcoStreamHandler = {
      async onEvent(event) {
        if (event.type === "chunk") {
          if (!firstChunkLogged) {
            firstChunkLogged = true;
            const at = now();
            emitLatency("ttfb", at, latestTimings);
          }
          sendSse({ type: "chunk", delta: event.content, index: event.index });
          return;
        }

        if (event.type === "error") {
          sendErrorAndEnd(event.error.message);
          return;
        }

        if (event.type === "control") {
          if (event.name === "prompt_ready") {
            latestTimings = event.timings ?? latestTimings;
            const at = now();
            emitLatency("prompt_ready", at, latestTimings);
            sendSse({
              type: "prompt_ready",
              at,
              sinceStartMs: at - t0,
              timings: latestTimings,
            });
            return;
          }
          if (event.name === "first_token") {
            sendSse({ type: "first_token" });
            return;
          }
          if (event.name === "reconnect") {
            sendSse({ type: "reconnect", attempt: event.attempt ?? 0 });
            return;
          }
          if (event.name === "done") {
            doneNotified = true;
            latestTimings = event.timings ?? latestTimings;
            const at = now();
            emitLatency("ttlc", at, latestTimings);
            sendSse({
              type: "done",
              meta: event.meta ?? {},
              at,
              sinceStartMs: at - t0,
              timings: latestTimings,
            });
            if (!streamClosed) {
              streamClosed = true;
              streamingRes.end(); // LATENCY: encerra o SSE logo após o sinal de conclusão.
            }
          }
        }
      },
    };

    const resposta = await getEcoResponse({
      messages: mensagensParaIA,
      userId: usuario_id,
      userName: nome_usuario,
      accessToken: token,
      mems: memsSimilares,
      promptOverride: prompt, // <- string
      sessionMeta,
      stream: streamHandler,
    });

    setImmediate(() => {
      Promise.allSettled([resposta.finalize()])
        .then((settled) => {
          settled.forEach((result) => {
            if (result.status === "rejected") {
              log.warn("⚠️ Pós-processamento /ask-eco falhou:", result.reason);
            }
          });
        })
        .catch((finalErr) => {
          log.warn("⚠️ Pós-processamento /ask-eco rejeitado:", finalErr);
        });
    });

    if (!doneNotified && !streamClosed) {
      const at = now();
      const fallbackTimings = (resposta as { timings?: EcoLatencyMarks })?.timings ?? latestTimings;
      latestTimings = fallbackTimings ?? latestTimings;
      emitLatency("ttlc", at, latestTimings);
      sendSse({
        type: "done",
        meta: resposta?.usage ? { usage: resposta.usage } : {},
        at,
        sinceStartMs: at - t0,
        timings: latestTimings,
      });
      streamClosed = true;
      streamingRes.end();
    }

    return;
  } catch (err: any) {
    log.error("❌ Erro no /ask-eco:", { message: err?.message, stack: err?.stack });
    const message = err?.message || "Erro interno ao processar a requisição.";
    if (sseStarted || res.headersSent) {
      sendSse({ type: "error", message });
      if (!streamClosed) {
        streamClosed = true;
        streamingRes.end();
      }
      return;
    }
    return res.status(500).json({
      error: "Erro interno ao processar a requisição.",
      details: { message: err?.message, stack: err?.stack },
    });
  }
});

export default router;
