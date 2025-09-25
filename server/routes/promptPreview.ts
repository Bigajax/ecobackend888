// routes/promptPreview.ts
import { Request, Response } from "express";
import { buildContextWithMeta } from "../services/promptContext";

// Define o formato esperado do retorno
type PromptPreviewOut = {
  prompt: string;
  meta?: Record<string, unknown>;
};

export const getPromptEcoPreview = async (_req: Request, res: Response) => {
  try {
    const out: PromptPreviewOut = await buildContextWithMeta({ texto: "" });
    res.json({
      prompt: out.prompt,
      meta: out.meta ?? {}, // garante objeto vazio se meta não existir
    });
  } catch (err: any) {
    console.warn("✖ Erro ao montar o prompt:", err);
    res.status(500).json({ error: "Erro ao montar o prompt" });
  }
};
