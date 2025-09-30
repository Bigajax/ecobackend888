// routes/openrouterRoutes.ts
import express, { type Request, type Response } from "express";
import { supabase } from "../lib/supabaseAdmin"; // ✅ usa a instância (não é função)

import { getEcoResponse } from "../services/ConversationOrchestrator";
import { embedTextoCompleto } from "../adapters/embeddingService";
import { buscarMemoriasSemelhantes } from "../services/buscarMemorias";
import { extractSessionMeta } from "./sessionMeta";
import { trackMensagemRecebida } from "../analytics/events/mixpanelEvents";

// montar contexto e log
import { ContextBuilder } from "../services/promptContext";
import { log, isDebug } from "../services/promptContext/logger";

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
        k: 5,
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

    // orquestrador (usa promptOverride)
    const resposta = await getEcoResponse({
      messages: mensagensParaIA,
      userId: usuario_id,
      userName: nome_usuario,
      accessToken: token,
      mems: memsSimilares,
      promptOverride: prompt, // <- string
      sessionMeta,
    } as any); // se o tipo ainda não tiver promptOverride

    return res.status(200).json(resposta);
  } catch (err: any) {
    log.error("❌ Erro no /ask-eco:", { message: err?.message, stack: err?.stack });
    return res.status(500).json({
      error: "Erro interno ao processar a requisição.",
      details: { message: err?.message, stack: err?.stack },
    });
  }
});

export default router;
