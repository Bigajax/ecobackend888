import type { Request, Response } from "express";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { interpretDream, getDreamHistory } from "../services/dreamService";

function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (typeof auth !== "string") return null;
  const normalized = auth.trim();
  if (!normalized.toLowerCase().startsWith("bearer ")) return null;
  const token = normalized.slice("bearer ".length).trim();
  return token || null;
}

function getGuestId(req: Request): string | null {
  const raw = req.headers["x-eco-guest-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

async function resolveIdentity(
  req: Request,
): Promise<{ userId: string; isGuest: boolean } | null> {
  const token = getBearerToken(req);
  if (token) {
    try {
      const admin = ensureSupabaseConfigured();
      const { data, error } = await admin.auth.getUser(token);
      if (!error && data?.user?.id) {
        return { userId: data.user.id, isGuest: false };
      }
    } catch {
      // fall through to guest
    }
  }

  const guestId = getGuestId(req);
  if (guestId) return { userId: guestId, isGuest: true };

  return null;
}

export async function interpretDreamHandler(req: Request, res: Response): Promise<void> {
  const identity = await resolveIdentity(req);
  if (!identity) {
    res.status(401).json({ error: "Identidade não encontrada. Envie Authorization ou X-Eco-Guest-Id." });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const dreamText = typeof body?.dream_text === "string" ? body.dream_text.trim() : "";

  if (!dreamText || dreamText.length < 10) {
    res.status(400).json({ error: "dream_text deve ter pelo menos 10 caracteres." });
    return;
  }

  if (dreamText.length > 2000) {
    res.status(400).json({ error: "dream_text não pode exceder 2000 caracteres." });
    return;
  }

  await interpretDream(identity.userId, identity.isGuest, dreamText, req, res);
}

export async function getDreamHistoryHandler(req: Request, res: Response): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Histórico disponível apenas para usuários autenticados." });
    return;
  }

  let userId: string;
  try {
    const admin = ensureSupabaseConfigured();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) {
      res.status(401).json({ error: "Token inválido." });
      return;
    }
    userId = data.user.id;
  } catch {
    res.status(401).json({ error: "Falha ao verificar autenticação." });
    return;
  }

  try {
    const dreams = await getDreamHistory(userId);
    res.status(200).json({ dreams });
  } catch {
    res.status(500).json({ error: "Erro ao buscar histórico de sonhos." });
  }
}
