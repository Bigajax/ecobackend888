import type { Response } from "express";

import {
  CORS_ALLOW_CREDENTIALS,
  EXPOSE_HEADERS_HEADER,
  isAllowedOrigin,
} from "../bootstrap/cors";

export const MAX_ERROR_DETAIL_BYTES = 1024 * 2; // 2 KiB

export function attachCors(res: Response, origin?: string | null): void {
  res.setHeader("Vary", "Origin");
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader(
    "Access-Control-Allow-Credentials",
    CORS_ALLOW_CREDENTIALS ? "true" : "false"
  );
  res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS_HEADER);
}

export class HttpError extends Error {
  status: number;

  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>, message?: string) {
    super(message ?? (typeof body?.code === "string" ? body.code : "HttpError"));
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

export function createHttpError(
  status: number,
  code: string,
  message?: string,
  extra: Record<string, unknown> = {}
): HttpError {
  const payload: Record<string, unknown> = { code, ...extra };
  if (typeof message === "string" && message.trim()) {
    payload.message = message.trim();
  }
  return new HttpError(status, payload, message);
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function limitErrorDetail(input: unknown, maxBytes = MAX_ERROR_DETAIL_BYTES): string {
  const normalized = (() => {
    if (input == null) return "";
    if (typeof input === "string") return input;
    if (typeof input === "object") {
      try {
        return JSON.stringify(input);
      } catch {
        return Object.prototype.toString.call(input);
      }
    }
    return String(input);
  })();

  if (normalized.length <= 0) return "";

  const encoder = new TextEncoder();
  const bytes = encoder.encode(normalized);
  if (bytes.byteLength <= maxBytes) {
    return normalized;
  }
  const view = bytes.slice(0, maxBytes);
  const decoder = new TextDecoder();
  return `${decoder.decode(view)}…`;
}

export function resolveErrorStatus(error: unknown): number | null {
  const candidate = (error as any)?.status ?? (error as any)?.statusCode ?? null;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate;
  }
  const responseStatus = (error as any)?.response?.status;
  if (typeof responseStatus === "number" && Number.isFinite(responseStatus)) {
    return responseStatus;
  }
  const message: string | undefined = (error as any)?.message;
  if (typeof message === "string") {
    const match = message.match(/\b(\d{3})\b/);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

export function extractErrorDetail(error: unknown): string | null {
  const responseData = (error as any)?.response?.data;
  if (responseData != null) {
    const detail = limitErrorDetail(responseData);
    if (detail) return detail;
  }
  const body = (error as any)?.body ?? (error as any)?.data;
  if (body != null) {
    const detail = limitErrorDetail(body);
    if (detail) return detail;
  }
  const message = (error as any)?.message;
  if (typeof message === "string" && message.trim()) {
    return limitErrorDetail(message.trim());
  }
  return null;
}
