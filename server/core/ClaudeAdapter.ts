// core/ClaudeAdapter.ts
type Msg = { role: "system" | "user" | "assistant"; content: string };

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
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const turns = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
    "X-Title": "Eco App - ClaudeAdapter",
  };

  async function call(modelToUse: string) {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelToUse,
        temperature,
        max_tokens: maxTokens,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          ...turns,
        ],
      }),
    });

    if (!resp.ok) {
      throw new Error(`OpenRouter error: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content ?? "";

    return {
      content: text,
      model: data?.model,
      usage: {
        total_tokens: data?.usage?.total_tokens ?? null,
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
