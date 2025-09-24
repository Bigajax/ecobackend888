// controllers/promptController.ts
import type { Request, Response } from "express";
// Pode importar pelo barrel (index)…
import { ContextBuilder } from "../services/promptContext";
// …ou direto do módulo:
// import montarContextoEco, { ContextBuilder } from "../services/promptContext/ContextBuilder";

/**
 * Monta o contexto ECO a partir do input do orquestrador.
 * Retorna apenas a string do prompt (o builder atual não retorna meta).
 */
export async function montarContextoEco(input: any): Promise<string> {
  const safe: any = {
    texto: input?.texto ?? input?.ultimaMsg ?? "",
    userId: input?.userId ?? null,
    userName: input?.userName ?? null,
    perfil: input?.perfil ?? null,
    mems: Array.isArray(input?.mems) ? input.mems : [],
    heuristicas: Array.isArray(input?.heuristicas) ? input.heuristicas : [],
    userEmbedding: Array.isArray(input?.userEmbedding) ? input.userEmbedding : [],
    forcarMetodoViva: !!input?.forcarMetodoViva,
    blocoTecnicoForcado: input?.blocoTecnicoForcado ?? null,
    derivados: input?.derivados ?? null,
    aberturaHibrida: input?.aberturaHibrida ?? null,
    // no comportamento anterior você queria "pular saudação" por padrão?
    // Aqui mantemos a semântica original: se não vier nada, vira false (não pular).
    skipSaudacao: !!input?.skipSaudacao,
  };

  // O builder atual retorna string diretamente.
  const prompt = await ContextBuilder.build(safe);
  return prompt;
}

/**
 * Endpoint opcional de preview.
 * Devolve apenas { prompt } porque o builder não calcula meta.
 */
export const getPromptEcoPreview = async (_req: Request, res: Response) => {
  try {
    const prompt = await ContextBuilder.build({ texto: "" });
    res.json({ prompt });
  } catch (err: any) {
    console.warn("❌ Erro ao montar o prompt:", err);
    res.status(500).json({ error: "Erro ao montar o prompt" });
  }
};
