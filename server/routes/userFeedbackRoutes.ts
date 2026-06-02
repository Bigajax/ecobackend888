/**
 * Rotas para sistema de feedback de usuários
 * @module userFeedbackRoutes
 *
 * Endpoint principal: POST /api/user-feedback
 *
 * Permite que usuários (autenticados ou guests) enviem feedback categorizado
 * sobre o aplicativo. Implementa rate limiting (5 req/15min) e validação de entrada.
 */

import { Router, Request, Response } from 'express';
import { ensureSupabaseConfigured } from '../lib/supabaseAdmin';
import {
  FeedbackRequest,
  FeedbackResponse,
  FeedbackRecord,
} from '../utils/feedbackTypes';
import {
  validateAndSanitizeFeedback,
  hasValidIdentifier,
} from '../utils/feedbackValidator';
import { feedbackRateLimiter } from '../utils/rateLimiter';

const router = Router();

/**
 * POST /api/user-feedback
 *
 * Recebe e persiste feedback de usuários no Supabase
 *
 * Headers:
 *   - x-eco-guest-id: UUID do guest (opcional, mas necessário se não autenticado)
 *   - x-eco-session-id: UUID da sessão (opcional)
 *   - Authorization: Bearer token (opcional para usuários autenticados)
 *
 * Body (JSON):
 *   - message: string (obrigatório, máx 1000 chars)
 *   - category: 'bug' | 'feature' | 'improvement' | 'other' (opcional)
 *   - page: string (opcional, máx 255 chars)
 *   - userAgent: string (opcional)
 *
 * Responses:
 *   - 201: Feedback criado com sucesso
 *   - 400: Dados inválidos ou falta de identificador
 *   - 429: Rate limit excedido (5 req/15min)
 *   - 500: Erro interno ao salvar no banco
 *
 * @example
 * ```bash
 * curl -X POST http://localhost:3001/api/user-feedback \
 *   -H "Content-Type: application/json" \
 *   -H "x-eco-guest-id: 550e8400-e29b-41d4-a716-446655440000" \
 *   -d '{"message":"Encontrei um bug","category":"bug"}'
 * ```
 */
router.post(
  '/',
  feedbackRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // 1. Extrair identificadores dos headers
      const guestId = req.headers['x-eco-guest-id'] as string | undefined;
      const sessionId = req.headers['x-eco-session-id'] as string | undefined;

      // Tentar obter userId do middleware de autenticação (se presente)
      // @ts-ignore - res.locals pode conter userId injetado por ensureIdentity
      const userId = res.locals?.userId as string | undefined;

      // 2. Validar que existe pelo menos um identificador
      if (!hasValidIdentifier(userId, guestId)) {
        res.status(400).json({
          success: false,
          message:
            'Requisição deve incluir x-eco-guest-id no header ou token de autenticação válido',
          errors: ['Missing user identifier (userId or guestId)'],
        } as FeedbackResponse);
        return;
      }

      // 3. Validar e sanitizar dados do body
      const rawData: FeedbackRequest = {
        message: req.body.message,
        category: req.body.category,
        page: req.body.page,
        guestId,
        sessionId,
        userAgent: req.headers['user-agent'],
      };

      const validation = validateAndSanitizeFeedback(rawData);

      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          message: 'Dados de entrada inválidos. Verifique os erros abaixo.',
          errors: validation.errors,
        } as FeedbackResponse);
        return;
      }

      // 4. Preparar dados para inserção no banco
      const sanitized = validation.sanitized;
      const feedbackData = {
        user_id: userId || null,
        guest_id: sanitized.guestId || null,
        session_id: sanitized.sessionId || null,
        message: sanitized.message,
        category: sanitized.category || null,
        page: sanitized.page || null,
        user_agent: sanitized.userAgent || null,
      };

      // 5. Inserir no Supabase (tabela user_feedback)
      const supabase = ensureSupabaseConfigured();
      const { data, error } = await supabase
        .from('user_feedback')
        .insert(feedbackData)
        .select()
        .single<FeedbackRecord>();

      if (error) {
        console.error('❌ Erro ao salvar feedback no Supabase:', error);
        res.status(500).json({
          success: false,
          message: 'Erro interno ao processar feedback. Tente novamente.',
          errors: [error.message],
        } as FeedbackResponse);
        return;
      }

      // 6. Sucesso - retornar confirmação
      console.log('✅ Feedback salvo com sucesso:', {
        id: data.id,
        category: data.category,
        userId: userId || 'guest',
      });

      res.status(201).json({
        success: true,
        message: 'Feedback recebido com sucesso! Obrigado por contribuir.',
        feedbackId: data.id,
      } as FeedbackResponse);
    } catch (error) {
      console.error('❌ Erro inesperado no endpoint de feedback:', error);

      res.status(500).json({
        success: false,
        message:
          'Erro inesperado ao processar feedback. Por favor, tente novamente mais tarde.',
        errors: [
          error instanceof Error ? error.message : 'Unknown error occurred',
        ],
      } as FeedbackResponse);
    }
  }
);

/**
 * GET /api/user-feedback/stats (endpoint administrativo opcional)
 *
 * Retorna estatísticas agregadas de feedback
 * Requer autenticação de admin (implementar verificação se necessário)
 *
 * @future Implementar quando houver dashboard administrativo
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const supabase = ensureSupabaseConfigured();

    // Buscar estatísticas agregadas
    const { data, error } = await supabase.rpc('get_feedback_stats');

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas de feedback:', error);

    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estatísticas',
      errors: [
        error instanceof Error ? error.message : 'Unknown error occurred',
      ],
    });
  }
});

export default router;
