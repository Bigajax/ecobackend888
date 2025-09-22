// controllers/promptController.ts
import type { Request, Response } from "express";
import { ContextBuilder } from "../services/promptContext/ContextBuilder";

const builder = new ContextBuilder();

export async function montarContextoEco(input: any): Promise<string> {
  // compat: aceita o mesmo objeto que você já passa do orchestrator
  const safe: any = {
    texto: input?.texto ?? input?.ultimaMsg ?? "",
    userId: input?.userId,
    userName: input?.userName,
    perfil: input?.perfil ?? null,
    mems: input?.mems ?? [],
    heuristicas: input?.heuristicas ?? [],
    userEmbedding: input?.userEmbedding ?? [],
    forcarMetodoViva: !!input?.forcarMetodoViva,
    blocoTecnicoForcado: input?.blocoTecnicoForcado ?? null,
    derivados: input?.derivados,
    aberturaHibrida: input?.aberturaHibrida ?? null,
    skipSaudacao: input?.skipSaudacao !== false,
  };
  const out = await builder.build(safe);
  return out.prompt;
}

// opcional: preview com meta
export const getPromptEcoPreview = async (_req: Request, res: Response) => {
  try {
    const out = await builder.build({ texto: "" });
    res.json({ prompt: out.prompt, meta: out.meta });
  } catch (err: any) {
    console.warn("❌ Erro ao montar o prompt:", err);
    res.status(500).json({ error: "Erro ao montar o prompt" });
  }
};
