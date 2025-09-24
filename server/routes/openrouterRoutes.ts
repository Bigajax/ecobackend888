import express from "express";
import supabaseAdmin from "../lib/supabaseAdmin";

import { getEcoResponse } from "../services/ConversationOrchestrator";
import { embedTextoCompleto } from "../services/embeddingService";
import { buscarMemoriasSemelhantes } from "../services/buscarMemorias";

// montar contexto e log
import { ContextBuilder } from "../services/promptContext/ContextBuilder";
import { log, isDebug } from "../services/promptContext/logger";

const router = express.Router();

// log seguro
const safeLog = (s: string) =>
  process.env.NODE_ENV === "production" ? (s || "").slice(0, 60) + "…" : s || "";

// normalizador
function normalizarMensagens(body: any): Array<{ role: string; content: any }> | null {
  const { messages, mensagens, mensagem } = body || {};
  if (Array.isArray(messages)) return messages;
  if (Array.isArray(mensagens)) return mensagens;
  if (mensagem) return [{ role: "user", content: mensagem }];
  return null;
}

router.post("/ask-eco", async (req, res) => {
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
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Token inválido ou usuário não encontrado." });
    }

    const ultimaMsg = String(mensagensParaIA.at(-1)?.content ?? "");
    log.info("🗣️ Última mensagem:", safeLog(ultimaMsg));

    // embedding opcional
    let queryEmbedding: number[] | undefined;
    if (ultimaMsg.trim().length >= 6) {
      try {
        const raw = await embedTextoCompleto(ultimaMsg);
        queryEmbedding = Array.isArray(raw) ? raw : JSON.parse(String(raw));
        if (!Array.isArray(queryEmbedding)) queryEmbedding = undefined;
      } catch (e) {
        log.warn("⚠️ Falha ao gerar embedding:", (e as Error)?.message);
      }
    }

    // threshold adaptativo
    let threshold = 0.15;
    if (ultimaMsg.trim().length < 20) threshold = 0.10;
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
        memsSimilares.map((m) => ({ id: m.id?.slice(0, 8), sim: m.similaridade ?? m.similarity ?? 0 }))
      );
    } catch (memErr) {
      log.warn("⚠️ Falha na busca de memórias semelhantes:", (memErr as Error)?.message);
      memsSimilares = [];
    }

    // ===== monta contexto com ContextBuilder =====
    const builder = new ContextBuilder();
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
    const { prompt, meta } = await builder.build(buildIn);

    if (isDebug()) {
      log.debug("[ask-eco] Contexto montado", {
        tokens: meta?.tokens,
        nivel: meta?.nivel,
        usados: meta?.modulos?.incluidos,
        cortados: meta?.modulos?.cortados,
      });
    }

    // orquestrador (usa promptOverride)
    const resposta = await getEcoResponse({
      messages: mensagensParaIA,
      userId: usuario_id,
      userName: nome_usuario,
      accessToken: token,
      mems: memsSimilares,
      // suporte no orchestrator já preparado
      promptOverride: prompt,
    } as any); // <- se GetEcoParams ainda não tipar promptOverride

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
