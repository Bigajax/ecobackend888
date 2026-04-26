import fs from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";

import { streamClaudeChatCompletion } from "../core/ClaudeAdapter";
import { buscarMemoriasSemelhantes } from "./buscarMemorias";
import {
  insertDream,
  updateDreamInterpretation,
  listDreamsByUser,
  type DreamRow,
} from "../adapters/supabaseDreamRepository";
import { createSSE } from "../utils/sse";

const DREAM_PROMPT_PATH = path.resolve(
  process.cwd(),
  "server/assets/modulos_extras/eco_dream_interpretacao.txt",
);

let cachedDreamPrompt: string | null = null;

async function getDreamPrompt(): Promise<string> {
  if (cachedDreamPrompt) return cachedDreamPrompt;
  try {
    cachedDreamPrompt = (await fs.readFile(DREAM_PROMPT_PATH, "utf-8")).trim();
    return cachedDreamPrompt;
  } catch {
    return "Você é Eco. Interprete o sonho do usuário com base em Freud e Jung.";
  }
}

function buildMemoryContext(memories: Awaited<ReturnType<typeof buscarMemoriasSemelhantes>>): string {
  if (!memories.length) return "";

  const lines = memories.map((m, i) => {
    const parts: string[] = [`[Memória ${i + 1}] ${m.resumo_eco}`];
    if (m.emocao_principal) parts.push(`Emoção: ${m.emocao_principal}`);
    if (m.intensidade) parts.push(`Intensidade: ${m.intensidade}/10`);
    return parts.join(" | ");
  });

  return `\n\n---\n## Contexto emocional do usuário\n\nEssas memórias emocionais podem enriquecer a interpretação:\n\n${lines.join("\n")}`;
}

export async function interpretDream(
  userId: string,
  isGuest: boolean,
  dreamText: string,
  req: Request,
  res: Response,
): Promise<void> {
  const sse = createSSE(res, req);

  let dreamId: string | null = null;

  try {
    // Save dream record before streaming (interpretation filled in after)
    if (!isGuest) {
      try {
        const row = await insertDream({
          usuario_id: userId,
          is_guest: false,
          dream_text: dreamText,
        });
        dreamId = row.id;
      } catch (err) {
        console.error("[dreamService] Failed to insert dream", (err as Error).message);
      }
    }

    // Fetch emotional memories for context
    let memoryContext = "";
    if (!isGuest) {
      try {
        const memories = await buscarMemoriasSemelhantes(userId, {
          texto: dreamText,
          k: 3,
        });
        memoryContext = buildMemoryContext(memories);
      } catch (err) {
        console.error("[dreamService] Failed to fetch memories", (err as Error).message);
      }
    }

    const dreamPrompt = await getDreamPrompt();
    const systemPrompt = dreamPrompt + memoryContext;

    sse.open();
    sse.prompt_ready({ client_message_id: dreamId ?? "dream" });

    let fullText = "";

    await streamClaudeChatCompletion(
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: dreamText },
        ],
        temperature: 0.65,
        maxTokens: 900,
      },
      {
        onChunk: ({ content }) => {
          fullText += content;
          sse.chunk({ text: content });
        },
        onControl: (event) => {
          if (event.type === "done") {
            sse.done({
              ok: true,
              reason: event.finishReason ?? "stop",
            });
            // Save interpretation asynchronously after stream ends
            if (dreamId && fullText.trim()) {
              updateDreamInterpretation(dreamId, fullText.trim()).catch((err) => {
                console.error("[dreamService] Failed to update interpretation", (err as Error).message);
              });
            }
            sse.end();
          }
        },
        onError: (err) => {
          console.error("[dreamService] LLM stream error", err.message);
          sse.send("error", { message: "Não consegui interpretar o sonho agora. Tente novamente." });
          sse.end();
        },
      },
    );
  } catch (err) {
    console.error("[dreamService] Unexpected error", (err as Error).message);
    if (!res.writableEnded) {
      sse.send("error", { message: "Erro interno. Tente novamente em instantes." });
      sse.end();
    }
  }
}

export async function getDreamHistory(userId: string, limit = 20): Promise<DreamRow[]> {
  return listDreamsByUser(userId, limit);
}
