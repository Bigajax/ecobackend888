import type { Request } from "express";

import type { GuestSessionMeta } from "../../core/http/middlewares/guestSession";

export type GuestAwareRequest = Request & { guest?: GuestSessionMeta; userId?: string };

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const MAX_GUEST_MESSAGE_LENGTH = parsePositiveInt(
  process.env.GUEST_MAX_MESSAGE_LENGTH,
  2000
);

const normalizeStreamParam = (value: unknown): string | boolean | undefined => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : undefined;
  }
  return value as string | boolean | undefined;
};

const isStreamDisabled = (value: unknown): boolean => {
  const normalized = normalizeStreamParam(value);
  if (typeof normalized === "string") {
    const lowered = normalized.trim().toLowerCase();
    return lowered === "false" || lowered === "0" || lowered === "no" || lowered === "off";
  }
  if (typeof normalized === "boolean") {
    return normalized === false;
  }
  return false;
};

const isTruthyFlag = (value: unknown): boolean => {
  if (value === true) return true;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    return lowered === "true" || lowered === "1" || lowered === "yes";
  }
  return false;
};

export const parsePromptReadyImmediate = (req: Request): boolean => {
  return (
    req.body?.promptReadyImmediate === true ||
    req.body?.promptReadyImmediate === "true" ||
    req.body?.latency?.promptReadyImmediate === true ||
    req.body?.latency?.promptReadyImmediate === "true"
  );
};

export const isDebugRequested = (req: Request): boolean => {
  return isTruthyFlag((req.query as any)?.debug) || isTruthyFlag((req.body as any)?.debug);
};

export const resolveStreamPreference = (
  req: Request,
  isGuest: boolean
): {
  respondAsStream: boolean;
  streamDisabled: boolean;
  hasStreamPreference: boolean;
} => {
  const rawStreamQuery = (req.query as any)?.stream;
  const rawStreamBody = (req.body as any)?.stream;
  const hasStreamPreference =
    typeof rawStreamQuery !== "undefined" || typeof rawStreamBody !== "undefined";
  const streamDisabled = isStreamDisabled(rawStreamQuery) || isStreamDisabled(rawStreamBody);
  const respondAsStream = !streamDisabled && (!isGuest ? true : hasStreamPreference);
  return { respondAsStream, streamDisabled, hasStreamPreference };
};

const stripHtml = (text: string): string => text.replace(/<[^>]*>/g, " ");
const normalizeWhitespace = (text: string): string => text.replace(/\s+/g, " ").trim();

export type NormalizedMessage = { id?: string; role: string; content: any };

export const sanitizeGuestMessages = (
  messages: Array<{ role?: string; content?: any }>
): Array<NormalizedMessage> => {
  return messages.map((message) => {
    const role = typeof message?.role === "string" ? message.role : "";
    if (role !== "user") {
      return { ...message, role } as NormalizedMessage;
    }
    const rawContent =
      typeof message?.content === "string"
        ? message.content
        : message?.content != null
        ? String(message.content)
        : "";
    const withoutHtml = stripHtml(rawContent);
    const sanitized = normalizeWhitespace(withoutHtml);
    if (sanitized.length > MAX_GUEST_MESSAGE_LENGTH) {
      const error = new Error("Mensagem excede o limite permitido para convidados.");
      (error as any).status = 400;
      (error as any).code = "GUEST_MESSAGE_TOO_LONG";
      throw error;
    }
    return { ...message, role, content: sanitized } as NormalizedMessage;
  });
};

export function normalizarMensagens(body: any): Array<NormalizedMessage> | null {
  const { messages, mensagens, mensagem, text } = body || {};
  if (Array.isArray(messages)) return messages as Array<NormalizedMessage>;
  if (Array.isArray(mensagens)) return mensagens as Array<NormalizedMessage>;
  if (mensagem) return [{ role: "user", content: mensagem }];
  if (text) return [{ role: "user", content: text }];
  return null;
}

export const getMensagemTipo = (
  mensagens: Array<{ role?: string }> | null | undefined
): "inicial" | "continuacao" => {
  if (!Array.isArray(mensagens) || mensagens.length === 0) return "inicial";
  if (mensagens.length === 1) return mensagens[0]?.role === "assistant" ? "continuacao" : "inicial";

  let previousUserMessages = 0;
  for (let i = 0; i < mensagens.length - 1; i += 1) {
    const role = mensagens[i]?.role;
    if (role === "assistant") return "continuacao";
    if (role === "user") previousUserMessages += 1;
  }
  return previousUserMessages > 0 ? "continuacao" : "inicial";
};

export const safeLog = (s: string): string =>
  process.env.NODE_ENV === "production" ? (s || "").slice(0, 60) + "…" : s || "";
