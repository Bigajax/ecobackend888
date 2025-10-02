// server/controllers/memoriasController.ts
import { supabaseWithBearer } from "../adapters/SupabaseAdapter";
import type { Request, Response } from "express";

export async function registrarMemoriaHandler(req: Request, res: Response) {
  try {
    // ajuste conforme seu middleware de auth
    const usuarioId = (req as any)?.auth?.user?.id || (req as any)?.user?.id;
    if (!usuarioId) return res.status(401).json({ error: "Não autenticado" });

    const { texto, intensidade, tags, dominio_vida, padrao_comportamental, meta } = req.body;
    if (typeof intensidade !== "number") {
      return res.status(400).json({ error: "intensidade deve ser número" });
    }

    // pegue o token do header Authorization, se seu helper exigir
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    const supabase = supabaseWithBearer(token || req); // conforme seu helper

    const { data, error } = await supabase.rpc("registrar_memoria", {
      p_usuario: usuarioId,
      p_texto: texto ?? "",
      p_intensidade: intensidade,
      p_tags: Array.isArray(tags) ? tags : null,
      p_dominio_vida: dominio_vida ?? null,
      p_padrao_comportamental: padrao_comportamental ?? null,
      p_meta: meta ?? {},
    });

    if (error) return res.status(400).json({ error: error.message });

    const row = Array.isArray(data) ? data[0] : data;
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
