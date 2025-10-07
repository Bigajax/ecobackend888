import { callOpenRouterChat } from "../adapters/OpenRouterAdapter";
import { limparResposta, formatarTextoEco } from "../utils/text";
import { hedge } from "./policies/hedge";
import { REFLEXO_PATTERNS } from "./reflexoPatterns";

const MODEL_MAIN     = process.env.ECO_MODEL_MAIN     || "openai/gpt-5-chat";
const MODEL_TECH_ALT = process.env.ECO_MODEL_TECH_ALT || "openai/gpt-5-mini";

export async function fastGreet(prompt: string) {
  const lightSystem =
    "Você é a ECO, acolhedora e concisa. Responda em 1–2 frases, em PT-BR, convidando a pessoa a começar. Evite perguntas múltiplas.";
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
    "X-Title": "Eco App - Fast Lane",
  };
  const data = await callOpenRouterChat(
    {
      model: MODEL_TECH_ALT,
      temperature: 0.6,
      max_tokens: 180,
      messages: [
        { role: "system", content: lightSystem },
        { role: "user", content: prompt },
      ],
    },
    headers,
    6000
  );
  const raw =
    data?.choices?.[0]?.message?.content ??
    "Olá! 🙂 Estou aqui. O que tá pedindo atenção agora?";
  return formatarTextoEco(limparResposta(raw));
}

/* -----------------------------
 * microReflexoLocal (expandido)
 * --------------------------- */

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function microReflexoLocal(msg: string): string | null {
  const t = (msg || "").trim().toLowerCase();
  if (!t) return null;

  const hits: { key: string; priority: number; responses: string[] }[] = [];

  for (const [key, cfg] of Object.entries(REFLEXO_PATTERNS)) {
    if (cfg.patterns.some((rx) => rx.test(t))) {
      hits.push({ key, priority: cfg.priority, responses: cfg.microResponses });
    }
  }

  if (hits.length === 0) return null;

  // menor prioridade = mais urgente (1 > 2 > 3)
  hits.sort((a, b) => a.priority - b.priority);
  const best = hits[0];
  if (!best.responses.length) return null;
  return pickRandom(best.responses) ?? null;
}

export async function chatCompletion(messages: any[], maxTokens: number) {
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
    "X-Title": "Eco App - Chat",
  };
  const main = callOpenRouterChat(
    {
      model: MODEL_MAIN,
      messages,
      temperature: 0.7,
      top_p: 0.9,
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
      max_tokens: maxTokens,
    },
    headers,
    9000
  );
  const mini = callOpenRouterChat(
    {
      model: MODEL_TECH_ALT,
      messages,
      temperature: 0.65,
      top_p: 0.9,
      max_tokens: Math.min(420, maxTokens),
    },
    headers,
    5500
  );
  return hedge(main, mini, 2500);
}
