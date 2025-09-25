// core/ClaudeAdapter.ts

type Msg = { role: "system" | "user" | "assistant"; content: string };

/** Tipos mínimos do retorno da OpenRouter (compatível com strict) */
type ORole = "system" | "user" | "assistant";
interface ORMessage { role: ORole; content?: string }
interface ORChoice { index?: number; message?: ORMessage; finish_reason?: string }
interface ORUsage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
interface ORError { message?: string; type?: string }
interface ORChatCompletion {
  id?: string;
  model?: string;
  choices?: ORChoice[];
  usage?: ORUsage;
  error?: ORError;
  [k: string]: unknown;
}

export async function claudeChatCompletion({
  messages,
  model = process.env.ECO_CLAUDE_MODEL || "anthropic/claude-sonnet-4",
  fallbackModel = process.env.ECO_CLAUDE_MODEL_FALLBACK || "anthropic/claude-3.7-sonnet",
  temperature = 0.5,
  maxTokens = 700,
}: {
  messages: Msg[];
  model?: string;
  fallbackModel?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY ausente no ambiente.");
  }

  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const turns: ORMessage[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
    "X-Title": "Eco App - ClaudeAdapter",
  };

  async function call(modelToUse: string) {
    const payload = {
      model: modelToUse,
      temperature,
      max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: "system", content: system } as ORMessage] : []),
        ...turns,
      ],
    };

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      throw new Error(`OpenRouter error: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as unknown as ORChatCompletion;

    if (data.error?.message) {
      throw new Error(`OpenRouter API error: ${data.error.message}`);
    }

    const text =
      data.choices?.[0]?.message?.content ??
      ""; // segura contra undefined

    return {
      content: text,
      model: data.model ?? modelToUse,
      usage: {
        total_tokens: data.usage?.total_tokens,
        prompt_tokens: data.usage?.prompt_tokens,
        completion_tokens: data.usage?.completion_tokens,
      },
      raw: data,
    };
  }

  try {
    return await call(model);
  } catch (err) {
    console.warn(`⚠️ Claude ${model} falhou, tentando fallback ${fallbackModel}`, err);
    return await call(fallbackModel!);
  }
}
