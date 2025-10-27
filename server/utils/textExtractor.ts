/** Sanitiza a saída removendo blocos ```json``` e JSON final pendurado */
export function sanitizeOutput(input?: string): string {
  const txt = input ?? "";
  return txt
    // remove blocos ```json ... ```
    .replace(/```(?:json)?[\s\S]*?```/gi, "")
    // remove possível payload JSON final
    .replace(/\{[\s\S]*?\}\s*$/g, "")
    // remove caracteres de controle perigosos, preservando espaços comuns
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/** Extrai texto de payloads em formatos variados (defensivo) */
export function extractTextLoose(payload: any): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === "string" && payload.trim()) return payload.trim();

  const tryList = (val: any): string | undefined => {
    if (!val) return undefined;
    if (typeof val === "string" && val.trim()) return val.trim();

    if (Array.isArray(val)) {
      for (const v of val) {
        const t = tryList(v);
        if (t) return t;
      }
    } else if (typeof val === "object") {
      const keysTextFirst = [
        "text",
        "content",
        "texto",
        "output_text",
        "outputText",
        "output",
        "answer",
        "reply",
        "resposta",
        "respostaFinal",
        "fala",
        "speech",
        "message",
        "delta",
      ];
      for (const k of keysTextFirst) {
        const t = tryList((val as any)[k]);
        if (t) return t;
      }

      const paths = [
        ["response", "text"],
        ["response", "content"],
        ["response", "message"],
        ["result", "text"],
        ["result", "content"],
        ["result", "message"],
        ["payload", "text"],
        ["payload", "content"],
        ["payload", "message"],
      ] as const;
      for (const p of paths) {
        const t = tryList((val as any)[p[0]]?.[p[1]]);
        if (t) return t;
      }

      if (Array.isArray((val as any).choices)) {
        for (const c of (val as any).choices) {
          const t =
            tryList((c as any).delta) ||
            tryList((c as any).message) ||
            tryList((c as any).text) ||
            tryList((c as any).content);
          if (t) return t;
        }
      }
    }
    return undefined;
  };

  return tryList(payload);
}

/**
 * Extrai texto de eventos vindos do orquestrador de streaming.
 * Os adaptadores nem sempre usam a mesma chave, então varremos uma lista ampla
 * de campos conhecidos, caindo em `extractTextLoose` para objetos aninhados.
 */
export function extractEventText(event: unknown): string | undefined {
  if (!event) return undefined;

  const candidates: unknown[] = [];

  if (typeof event === "string") {
    candidates.push(event);
  } else if (typeof event === "object") {
    const obj = event as Record<string, unknown>;
    const delta = obj.delta;
    if (delta !== undefined) {
      candidates.push(delta);
      if (typeof delta === "object" && delta !== null) {
        const deltaObj = delta as Record<string, unknown>;
        candidates.push(deltaObj.content, deltaObj.text, deltaObj.value);
        if (Array.isArray(deltaObj.content)) {
          candidates.push(deltaObj.content.join(""));
        }
      }
    }
    candidates.push(
      obj.content,
      obj.text,
      obj.message,
      obj.output,
      obj.output_text,
      obj.response,
      obj.value
    );
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string") {
      const normalized = candidate.replace(/\r\n/g, "\n");
      if (normalized.length > 0) {
        return normalized;
      }
      continue;
    }
    const extracted = extractTextLoose(candidate);
    if (extracted) {
      return extracted;
    }
  }

  if (typeof event === "string") {
    return event.replace(/\r\n/g, "\n");
  }
  return extractTextLoose(event);
}
