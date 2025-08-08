import express from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { getEcoResponse } from "../services/ecoCortex";
import { embedTextoCompleto } from "../services/embeddingService";
import { buscarMemoriasSemelhantes } from "../services/buscarMemorias"; // usando helper

const router = express.Router();

router.post("/ask-eco", async (req, res) => {
  const { usuario_id, mensagem, messages, mensagens, nome_usuario } = req.body;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de acesso ausente." });
  }
  const token = authHeader.replace("Bearer ", "").trim();

  const mensagensParaIA =
    messages ||
    mensagens ||
    (mensagem ? [{ role: "user", content: mensagem }] : null);

  if (!usuario_id || !mensagensParaIA) {
    return res
      .status(400)
      .json({ error: "usuario_id e messages são obrigatórios." });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res
        .status(401)
        .json({ error: "Token inválido ou usuário não encontrado." });
    }

    // 🌱 1) Gera embedding da última mensagem (quando fizer sentido)
    const ultimaMsg = mensagensParaIA.at(-1)?.content ?? "";
    let queryEmbedding: number[] | null = null;
    if (typeof ultimaMsg === "string" && ultimaMsg.trim().length >= 6) {
      try {
        queryEmbedding = await embedTextoCompleto(ultimaMsg);
      } catch (e) {
        console.warn("⚠️ Falha ao gerar embedding da última mensagem:", (e as Error)?.message);
      }
    }

    // 🌱 2) Busca memórias semanticamente semelhantes (usando o embedding se existir)
    let memsSimilares: any[] = [];
    try {
      memsSimilares = await buscarMemoriasSemelhantes(usuario_id, {
        userEmbedding: queryEmbedding ?? undefined,
        texto: queryEmbedding ? undefined : ultimaMsg, // fallback por texto se não teve embedding
        k: 5,
      });
      console.log("[ℹ️] Memórias semelhantes retornadas:", memsSimilares);
    } catch (memErr) {
      console.warn("[ℹ️] Falha na busca de memórias semelhantes:", (memErr as Error)?.message);
    }

    // 🔥 3) PRIMEIRA RODADA — sem forçar METODO_VIVA
    const resposta1 = await getEcoResponse({
      messages: mensagensParaIA,
      userId: usuario_id,
      userName: nome_usuario,
      accessToken: token,
      mems: memsSimilares,
    });

    console.log("✅ Resposta 1 gerada.");

    // 🌱 4) Decide se precisa de segunda rodada com METODO_VIVA
    //    Agora usamos os CAMPOS retornados pelo getEcoResponse, não JSON no corpo da mensagem.
    const intensidade = typeof resposta1.intensidade === "number" ? resposta1.intensidade : 0;

    // mapeia string -> número caso venha no bloco
    const nivelAberturaStr = (resposta1 as any)?.nivel_abertura as string | undefined;
    const nivelAbertura =
      typeof nivelAberturaStr === "string"
        ? nivelAberturaStr === "alto"
          ? 3
          : nivelAberturaStr === "médio"
          ? 2
          : 1
        : null;

    const ativaViva =
      intensidade >= 7 || (intensidade >= 5 && nivelAbertura === 3);

    if (!ativaViva) {
      // 🎯 Retorna a primeira resposta
      return res.status(200).json({ message: resposta1.message });
    }

    // 🔥 5) SEGUNDA RODADA — com METODO_VIVA forçado
    console.log("🔄 Rodada 2 com METODO_VIVA.txt forçado!");

    // Monta um bloco técnico mínimo a partir do que já temos da primeira rodada
    const blocoTecnicoForcado = {
      analise_resumo: resposta1.resumo ?? resposta1.message,
      emocao_principal: resposta1.emocao ?? null,
      intensidade: intensidade,
      tags: resposta1.tags ?? [],
      categoria: resposta1.categoria ?? null,
      nivel_abertura:
        nivelAbertura === 3 ? "alto" : nivelAbertura === 2 ? "médio" : "baixo",
    };

    const resposta2 = await getEcoResponse({
      messages: mensagensParaIA,
      userId: usuario_id,
      userName: nome_usuario,
      accessToken: token,
      mems: memsSimilares,
      blocoTecnicoForcado,
      forcarMetodoViva: true,
    });

    return res.status(200).json({ message: resposta2.message });
  } catch (err: any) {
    console.error("❌ Erro no /ask-eco:", err);
    return res.status(500).json({
      error: "Erro interno ao processar a requisição.",
      details: {
        message: err?.message,
        stack: err?.stack,
      },
    });
  }
});

export default router;
