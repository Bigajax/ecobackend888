import { Request, Response } from "express";
// certo
import { buildContextWithMeta } from "../services/promptContext";


export const getPromptEcoPreview = async (_req: Request, res: Response) => {
  try {
    const out = await buildContextWithMeta({ texto: "" });
    res.json({ prompt: out.prompt, meta: out.meta });
  } catch (err: any) {
    console.warn("❌ Erro ao montar o prompt:", err);
    res.status(500).json({ error: "Erro ao montar o prompt" });
  }
};
