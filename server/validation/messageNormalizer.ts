type NormalizedMessage = { id?: string; role: string; content: string };

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeMessages(payload: unknown): { messages: NormalizedMessage[]; shape: string } {
  const body = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  const result: NormalizedMessage[] = [];
  let shape: "text" | "mensagem" | "mensagens" | "invalid" = "invalid";

  const sourceArray: unknown = Array.isArray(body.messages)
    ? body.messages
    : Array.isArray(body.mensagens)
    ? body.mensagens
    : undefined;

  if (Array.isArray(sourceArray)) {
    shape = "mensagens";
    for (const raw of sourceArray) {
      if (!raw || typeof raw !== "object") continue;
      const roleValue = (raw as any).role;
      const contentValue =
        (raw as any).content ??
        (raw as any).text ??
        (raw as any).mensagem ??
        (raw as any).message ??
        (raw as any).delta ??
        (raw as any).value;
      const role = typeof roleValue === "string" && roleValue.trim() ? roleValue.trim() : "user";
      let content: string = "";
      if (typeof contentValue === "string") {
        content = contentValue;
      } else if (contentValue != null) {
        try {
          content = JSON.stringify(contentValue);
        } catch {
          content = String(contentValue);
        }
      }
      const normalized: NormalizedMessage = { role, content };
      if (typeof (raw as any).id === "string") {
        normalized.id = (raw as any).id;
      }
      result.push(normalized);
    }
    return { messages: result, shape };
  }

  const singleText = typeof body.text === "string" && body.text.trim();
  if (singleText) {
    shape = "text";
    result.push({ role: "user", content: body.text });
    return { messages: result, shape };
  }

  const singleMensagem = typeof body.mensagem === "string" && body.mensagem.trim();
  if (singleMensagem) {
    shape = "mensagem";
    result.push({ role: "user", content: body.mensagem });
    return { messages: result, shape };
  }

  return { messages: result, shape };
}

export type { NormalizedMessage };
