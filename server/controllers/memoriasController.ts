// server/controllers/memoriasController.ts
import { supabaseWithBearer } from "../adapters/SupabaseAdapter";
import { supabase } from "../lib/supabaseAdmin";
import type { Request, Response } from "express";

export async function registrarMemoriaHandler(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const { data, error: getUserError } = await supabase.auth.getUser(token);
    if (getUserError || !data?.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const usuarioId = data.user.id;

    const { texto, intensidade, tags, dominio_vida, padrao_comportamental, meta } = req.body;
    if (typeof intensidade !== "number") {
      return res.status(400).json({ error: "intensidade deve ser número" });
    }

    // pegue o token do header Authorization, se seu helper exigir
    const supabaseClient = supabaseWithBearer(token);

    const { data: rpcData, error } = await supabaseClient.rpc("registrar_memoria", {
      p_usuario: usuarioId,
      p_texto: texto ?? "",
      p_intensidade: intensidade,
      p_tags: Array.isArray(tags) ? tags : null,
      p_dominio_vida: dominio_vida ?? null,
      p_padrao_comportamental: padrao_comportamental ?? null,
      p_meta: meta ?? {},
    });

    if (error) return res.status(400).json({ error: error.message });

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!row) return res.status(500).json({ error: "RPC não retornou dados" });

    return res.json({
      memoria: {
        id: row.id,
        usuario_id: row.usuario_id,
        resumo_eco: row.resumo_eco ?? row.texto ?? "",
        intensidade: row.intensidade,
        tags: row.tags,
        dominio_vida: row.dominio_vida,
        padrao_comportamental: row.padrao_comportamental,
        meta: row.meta,
        created_at: row.created_at,
        emocao_principal: row.emocao_principal ?? null,
        categoria: row.categoria ?? null,
        contexto: row.contexto ?? null,
        nivel_abertura: row.nivel_abertura ?? null,
        analise_resumo: row.analise_resumo ?? null,
      },
      primeiraMemoriaSignificativa: !!row.primeira,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Erro desconhecido" });
  }
}
