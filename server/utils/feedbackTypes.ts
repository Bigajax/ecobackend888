/**
 * Types e interfaces para o sistema de feedback de usuários
 * @module feedbackTypes
 */

/**
 * Categorias válidas de feedback
 */
export type FeedbackCategory = 'bug' | 'feature' | 'improvement' | 'other';

/**
 * Request body para submissão de feedback
 */
export interface FeedbackRequest {
  /** Mensagem do feedback (máx 1000 caracteres) */
  message: string;

  /** Categoria do feedback */
  category?: FeedbackCategory;

  /** Página onde o feedback foi enviado */
  page?: string;

  /** ID do guest (para usuários não autenticados) */
  guestId?: string;

  /** ID da sessão */
  sessionId?: string;

  /** User agent do navegador */
  userAgent?: string;
}

/**
 * Response após submissão de feedback
 */
export interface FeedbackResponse {
  /** Indica se a operação foi bem-sucedida */
  success: boolean;

  /** Mensagem descritiva do resultado */
  message: string;

  /** ID do feedback criado (apenas em caso de sucesso) */
  feedbackId?: string;

  /** Lista de erros de validação (apenas em caso de falha) */
  errors?: string[];
}

/**
 * Estrutura do feedback no banco de dados
 */
export interface FeedbackRecord {
  id: string;
  user_id: string | null;
  guest_id: string | null;
  session_id: string | null;
  message: string;
  category: FeedbackCategory | null;
  page: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Parâmetros para validação de feedback
 */
export interface FeedbackValidationResult {
  /** Indica se os dados são válidos */
  isValid: boolean;

  /** Lista de erros encontrados */
  errors: string[];

  /** Dados sanitizados e prontos para uso */
  sanitized: FeedbackRequest;
}

/**
 * Constantes de configuração do sistema de feedback
 */
export const FEEDBACK_CONFIG = {
  /** Tamanho máximo da mensagem em caracteres */
  MAX_MESSAGE_LENGTH: 1000,

  /** Tamanho máximo do campo page */
  MAX_PAGE_LENGTH: 255,

  /** Lista de categorias válidas */
  VALID_CATEGORIES: ['bug', 'feature', 'improvement', 'other'] as const,

  /** Limite de requisições por janela de tempo */
  RATE_LIMIT: {
    MAX_REQUESTS: 5,
    WINDOW_MS: 15 * 60 * 1000, // 15 minutos
  },
} as const;
