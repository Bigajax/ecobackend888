/**
 * Validador e sanitizador de dados de feedback
 * @module feedbackValidator
 */

import {
  FeedbackRequest,
  FeedbackValidationResult,
  FEEDBACK_CONFIG,
  FeedbackCategory,
} from './feedbackTypes';

/**
 * Valida se uma string é um UUID v4 válido
 */
function isValidUUID(uuid: string): boolean {
  const uuidV4Regex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Regex.test(uuid);
}

/**
 * Sanitiza uma string removendo potenciais vetores de XSS
 */
function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';

  return input
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove <script> tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove <iframe> tags
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers (onclick, onload, etc)
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:text\/html/gi, ''); // Remove data:text/html
}

/**
 * Valida e sanitiza os dados de um feedback
 *
 * @param data - Dados brutos do feedback recebidos do cliente
 * @returns Resultado da validação com dados sanitizados e lista de erros
 *
 * @example
 * ```typescript
 * const result = validateAndSanitizeFeedback({
 *   message: 'Encontrei um bug',
 *   category: 'bug',
 *   guestId: '550e8400-e29b-41d4-a716-446655440000'
 * });
 *
 * if (result.isValid) {
 *   // Usar result.sanitized para salvar no banco
 * } else {
 *   // Retornar result.errors para o cliente
 * }
 * ```
 */
export function validateAndSanitizeFeedback(
  data: FeedbackRequest
): FeedbackValidationResult {
  const errors: string[] = [];
  const sanitized: FeedbackRequest = { ...data };

  // Validação: message é obrigatório
  if (!data.message || typeof data.message !== 'string') {
    errors.push('Campo "message" é obrigatório e deve ser uma string');
  } else {
    // Sanitização da mensagem
    sanitized.message = sanitizeString(data.message);

    // Validação: tamanho da mensagem
    if (sanitized.message.length === 0) {
      errors.push('Mensagem não pode estar vazia após sanitização');
    } else if (sanitized.message.length > FEEDBACK_CONFIG.MAX_MESSAGE_LENGTH) {
      errors.push(
        `Mensagem não pode exceder ${FEEDBACK_CONFIG.MAX_MESSAGE_LENGTH} caracteres (atual: ${sanitized.message.length})`
      );
    }
  }

  // Validação: category (opcional, mas se fornecida deve ser válida)
  if (data.category) {
    if (
      !FEEDBACK_CONFIG.VALID_CATEGORIES.includes(
        data.category as FeedbackCategory
      )
    ) {
      errors.push(
        `Categoria inválida. Valores aceitos: ${FEEDBACK_CONFIG.VALID_CATEGORIES.join(', ')}`
      );
    }
  }

  // Validação: page (opcional)
  if (data.page && typeof data.page === 'string') {
    sanitized.page = sanitizeString(data.page);
    if (sanitized.page.length > FEEDBACK_CONFIG.MAX_PAGE_LENGTH) {
      errors.push(
        `Campo "page" não pode exceder ${FEEDBACK_CONFIG.MAX_PAGE_LENGTH} caracteres`
      );
    }
  }

  // Validação: guestId (opcional, mas se fornecido deve ser UUID válido)
  if (data.guestId) {
    if (typeof data.guestId !== 'string' || !isValidUUID(data.guestId)) {
      errors.push('Campo "guestId" deve ser um UUID v4 válido');
    }
  }

  // Validação: sessionId (opcional, mas se fornecido deve ser UUID válido)
  if (data.sessionId) {
    if (typeof data.sessionId !== 'string' || !isValidUUID(data.sessionId)) {
      errors.push('Campo "sessionId" deve ser um UUID v4 válido');
    }
  }

  // Validação: userAgent (opcional)
  if (data.userAgent && typeof data.userAgent === 'string') {
    sanitized.userAgent = sanitizeString(data.userAgent);
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * Valida se pelo menos um identificador (userId ou guestId) está presente
 */
export function hasValidIdentifier(
  userId?: string,
  guestId?: string
): boolean {
  return !!(userId || guestId);
}

/**
 * Extrai o identificador primário (prioriza userId sobre guestId)
 */
export function getPrimaryIdentifier(
  userId?: string,
  guestId?: string
): string {
  return userId || guestId || 'anonymous';
}
