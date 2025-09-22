// core/ClaudeAdapter.ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.OPENROUTER_API_KEY! });

type Msg = { role: "system"|"user"|"assistant"; content: string };

export async function claudeChatCompletion({
  messages,
  model = process.env.ECO_CLAUDE_MODEL || "anthropic/claude-4-sonnet",
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
  const system = messages.find(m => m.role === "system")?.content ?? "";
  const turns = messages
    .filter(m => m.role !== "system")
    .map(m => ({ role: m.role as "user"|"assistant", content: m.content }));

  try {
    const resp = await client.messages.create({
      model,
      system: system || undefined,
      max_tokens: maxTokens,
      temperature,
      messages: turns,
    });

    const text = (resp.content?.[0] as any)?.text ?? "";
    return {
      content: text,
      model: resp.model,
      usage: {
        total_tokens: (resp.usage?.input_tokens ?? 0) + (resp.usage?.output_tokens ?? 0),
      },
      raw: resp,
    };
  } catch (err) {
    console.warn(`⚠️ Claude ${model} falhou, tentando fallback ${fallbackModel}`, err);

    const resp = await client.messages.create({
      model: fallbackModel,
      system: system || undefined,
      max_tokens: maxTokens,
      temperature,
      messages: turns,
    });

    const text = (resp.content?.[0] as any)?.text ?? "";
    return {
      content: text,
      model: resp.model,
      usage: {
        total_tokens: (resp.usage?.input_tokens ?? 0) + (resp.usage?.output_tokens ?? 0),
      },
      raw: resp,
    };
  }
}
