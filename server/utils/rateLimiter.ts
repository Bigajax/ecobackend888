/**
 * Rate limiter middleware para proteger endpoints de feedback
 * @module rateLimiter
 */

import { Request, Response, NextFunction } from 'express';
import { FEEDBACK_CONFIG } from './feedbackTypes';
import { getPrimaryIdentifier } from './feedbackValidator';

/**
 * Estrutura para rastrear requisições por identificador
 */
interface RateLimitRecord {
  /** Número de requisições feitas na janela atual */
  count: number;

  /** Timestamp do início da janela atual (ms) */
  windowStart: number;
}

/**
 * Armazenamento em memória das requisições
 * Chave: identificador do usuário (userId ou guestId)
 * Valor: registro de rate limiting
 */
const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Limpa registros expirados da memória
 * Executado periodicamente para evitar memory leak
 */
function cleanExpiredRecords(): void {
  const now = Date.now();
  const windowMs = FEEDBACK_CONFIG.RATE_LIMIT.WINDOW_MS;

  for (const [identifier, record] of rateLimitStore.entries()) {
    if (now - record.windowStart > windowMs) {
      rateLimitStore.delete(identifier);
    }
  }
}

// Limpar registros expirados a cada 15 minutos
setInterval(cleanExpiredRecords, FEEDBACK_CONFIG.RATE_LIMIT.WINDOW_MS);

/**
 * Verifica se um identificador está dentro do limite de requisições
 *
 * @param identifier - Identificador único do usuário (userId ou guestId)
 * @returns true se ainda está dentro do limite, false se excedeu
 */
function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const windowMs = FEEDBACK_CONFIG.RATE_LIMIT.WINDOW_MS;
  const maxRequests = FEEDBACK_CONFIG.RATE_LIMIT.MAX_REQUESTS;

  const record = rateLimitStore.get(identifier);

  if (!record) {
    // Primeira requisição - criar novo registro
    rateLimitStore.set(identifier, {
      count: 1,
      windowStart: now,
    });
    return true;
  }

  // Verificar se a janela atual expirou
  if (now - record.windowStart > windowMs) {
    // Nova janela - resetar contador
    record.count = 1;
    record.windowStart = now;
    return true;
  }

  // Dentro da janela atual - incrementar contador
  record.count++;

  return record.count <= maxRequests;
}

/**
 * Calcula quanto tempo falta até o reset da janela de rate limit
 *
 * @param identifier - Identificador único do usuário
 * @returns Tempo restante em segundos
 */
function getTimeUntilReset(identifier: string): number {
  const record = rateLimitStore.get(identifier);
  if (!record) return 0;

  const now = Date.now();
  const windowMs = FEEDBACK_CONFIG.RATE_LIMIT.WINDOW_MS;
  const resetTime = record.windowStart + windowMs;

  return Math.ceil((resetTime - now) / 1000);
}

/**
 * Middleware de rate limiting para feedback
 *
 * Limita o número de requisições por identificador (userId ou guestId)
 * Configuração: 5 requisições a cada 15 minutos
 *
 * @example
 * ```typescript
 * router.post('/api/user-feedback', feedbackRateLimiter, async (req, res) => {
 *   // Handler do endpoint
 * });
 * ```
 */
export const feedbackRateLimiter = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Extrair identificadores dos headers customizados
  const guestId = req.headers['x-eco-guest-id'] as string | undefined;
  const sessionId = req.headers['x-eco-session-id'] as string | undefined;

  // Tentar extrair userId do JWT (se autenticado)
  // @ts-ignore - res.locals.userId pode ser injetado pelo middleware de autenticação
  const userId = res.locals?.userId as string | undefined;

  // Obter identificador primário
  const identifier = getPrimaryIdentifier(userId, guestId);

  if (identifier === 'anonymous') {
    // Sem identificador válido - bloquear requisição
    res.status(400).json({
      success: false,
      message:
        'Requisição deve incluir x-eco-guest-id no header ou token de autenticação',
      errors: ['Missing user identifier'],
    });
    return;
  }

  // Verificar rate limit
  const withinLimit = checkRateLimit(identifier);

  if (!withinLimit) {
    const retryAfter = getTimeUntilReset(identifier);

    console.log(
      `⚠️ Rate limit atingido para: ${identifier} (retry após ${retryAfter}s)`
    );

    res.status(429).json({
      success: false,
      message: `Limite de ${FEEDBACK_CONFIG.RATE_LIMIT.MAX_REQUESTS} requisições a cada 15 minutos excedido. Tente novamente em ${retryAfter} segundos.`,
      errors: [`Rate limit exceeded. Retry after ${retryAfter} seconds`],
    });
    return;
  }

  // Dentro do limite - prosseguir
  next();
};

/**
 * Retorna estatísticas de rate limiting (útil para debug)
 */
export function getRateLimitStats(): {
  totalIdentifiers: number;
  records: Array<{ identifier: string; count: number; windowStart: number }>;
} {
  const records = Array.from(rateLimitStore.entries()).map(
    ([identifier, record]) => ({
      identifier,
      count: record.count,
      windowStart: record.windowStart,
    })
  );

  return {
    totalIdentifiers: rateLimitStore.size,
    records,
  };
}

/**
 * Limpa o rate limit para um identificador específico (útil para testes)
 */
export function clearRateLimitFor(identifier: string): void {
  rateLimitStore.delete(identifier);
}

/**
 * Limpa todo o armazenamento de rate limit (útil para testes)
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}
