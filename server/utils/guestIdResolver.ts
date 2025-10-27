import type { Request } from "express";
import { normalizeGuestIdentifier } from "../core/http/guestIdentity";

export function getGuestIdFromCookies(req: Request): string | undefined {
  const cookieGuestId = (req as any)?.cookies?.guest_id;
  if (typeof cookieGuestId === "string" && cookieGuestId.trim()) {
    return cookieGuestId.trim();
  }

  const rawCookie = req.headers.cookie;
  if (!rawCookie) return undefined;

  for (const piece of rawCookie.split(";")) {
    const [key, ...rest] = piece.split("=");
    if (!key) continue;
    if (key.trim() === "guest_id") {
      try {
        const value = rest.join("=");
        const decoded = decodeURIComponent(value ?? "");
        if (decoded.trim()) {
          return decoded.trim();
        }
      } catch {
        /* ignore decode errors */
      }
    }
  }

  return undefined;
}

export function resolveGuestId(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const normalized = normalizeGuestIdentifier(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}
