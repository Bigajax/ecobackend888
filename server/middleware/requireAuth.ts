import type { NextFunction, Request, Response } from "express";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { log } from "../services/promptContext/logger";

/**
 * Extend Express Request to include authenticated user data
 */
declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      email: string;
      [key: string]: any;
    };
  }
}

/**
 * Extract Bearer token from Authorization header
 */
function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== "string") {
    return null;
  }

  const normalized = authHeader.trim();
  if (!normalized.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = normalized.slice("bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Middleware to require JWT authentication via Supabase
 *
 * Validates the Bearer token from Authorization header and injects
 * user data into req.user. Returns 401 if authentication fails.
 *
 * @example
 * router.get('/status', requireAuth, getStatusHandler);
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const logger = log.withContext("require-auth");

  try {
    // Extract Bearer token
    const token = getBearerToken(req);

    if (!token) {
      logger.warn("missing_auth_token", {
        path: req.path,
        method: req.method,
      });

      res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Token de acesso ausente. Envie Authorization: Bearer <token>",
      });
      return;
    }

    // Validate with Supabase
    const supabase = ensureSupabaseConfigured();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      logger.warn("invalid_auth_token", {
        path: req.path,
        method: req.method,
        error: error?.message,
      });

      res.status(401).json({
        error: "INVALID_TOKEN",
        message: "Token inválido ou expirado",
      });
      return;
    }

    // Attach authenticated user to request
    req.user = {
      id: data.user.id,
      email: data.user.email || "",
      ...data.user,
    };

    logger.debug("auth_success", {
      userId: data.user.id,
      path: req.path,
    });

    next();
  } catch (error) {
    logger.error("auth_error", {
      path: req.path,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: "AUTH_ERROR",
      message: "Erro ao validar autenticação",
    });
  }
}
