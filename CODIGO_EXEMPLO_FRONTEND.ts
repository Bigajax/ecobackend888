/**
 * Código de exemplo para implementar feedback de meditação no frontend
 * Copie e adapte conforme necessário
 */

// ============================================================================
// TIPOS / INTERFACES
// ============================================================================

export type MeditationVote = 'positive' | 'negative';

export type FeedbackReason =
  | 'too_long'        // Meditação muito longa
  | 'hard_to_focus'   // Difícil de focar
  | 'voice_music'     // Problema com voz/música
  | 'other';          // Outro motivo

export interface MeditationFeedbackPayload {
  // Feedback principal
  vote: MeditationVote;
  reasons?: FeedbackReason[];

  // Contexto da meditação
  meditation_id: string;
  meditation_title: string;
  meditation_duration_seconds: number;
  meditation_category: string;

  // Métricas de sessão
  actual_play_time_seconds: number;
  completion_percentage: number;
  pause_count?: number;
  skip_count?: number;
  seek_count?: number;

  // Som de fundo (opcional)
  background_sound_id?: string;
  background_sound_title?: string;

  // Metadados
  feedback_source?: string;
}

export interface MeditationFeedbackResponse {
  success: true;
  feedback_id: string;
  message: string;
}

export interface MeditationFeedbackError {
  error: string;
  details?: string[];
  message?: string;
}

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const FEEDBACK_ENDPOINT = `${API_BASE_URL}/api/meditation/feedback`;

// ============================================================================
// FUNÇÃO PRINCIPAL DE ENVIO DE FEEDBACK
// ============================================================================

export async function submitMeditationFeedback(
  feedback: MeditationFeedbackPayload,
  options: {
    sessionId: string;
    guestId?: string;
    authToken?: string;
  }
): Promise<MeditationFeedbackResponse> {

  // 1. Validar campos obrigatórios localmente
  validateFeedbackPayload(feedback);

  // 2. Montar headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Session-Id': options.sessionId,
  };

  // Adicionar identidade (guest ou autenticado)
  if (options.guestId) {
    headers['X-Guest-Id'] = options.guestId;
  }
  if (options.authToken) {
    headers['Authorization'] = `Bearer ${options.authToken}`;
  }

  // 3. Fazer requisição
  try {
    const response = await fetch(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(feedback),
    });

    // 4. Tratar resposta
    if (!response.ok) {
      const error: MeditationFeedbackError = await response.json();
      throw new FeedbackSubmissionError(
        error.message || error.error || 'Failed to submit feedback',
        response.status,
        error.details
      );
    }

    const data: MeditationFeedbackResponse = await response.json();
    return data;

  } catch (error) {
    if (error instanceof FeedbackSubmissionError) {
      throw error;
    }

    // Erro de rede ou outro erro
    throw new FeedbackSubmissionError(
      'Network error: Unable to submit feedback',
      0,
      [(error as Error).message]
    );
  }
}

// ============================================================================
// VALIDAÇÃO LOCAL
// ============================================================================

function validateFeedbackPayload(feedback: MeditationFeedbackPayload): void {
  const errors: string[] = [];

  // Validar vote
  if (!feedback.vote || !['positive', 'negative'].includes(feedback.vote)) {
    errors.push('vote must be "positive" or "negative"');
  }

  // Se negative, reasons é obrigatório
  if (feedback.vote === 'negative') {
    if (!feedback.reasons || feedback.reasons.length === 0) {
      errors.push('reasons are required when vote is "negative"');
    }
  }

  // Validar campos obrigatórios
  if (!feedback.meditation_id?.trim()) {
    errors.push('meditation_id is required');
  }
  if (!feedback.meditation_title?.trim()) {
    errors.push('meditation_title is required');
  }
  if (!feedback.meditation_category?.trim()) {
    errors.push('meditation_category is required');
  }

  // Validar números
  if (typeof feedback.meditation_duration_seconds !== 'number' || feedback.meditation_duration_seconds <= 0) {
    errors.push('meditation_duration_seconds must be a positive number');
  }
  if (typeof feedback.actual_play_time_seconds !== 'number' || feedback.actual_play_time_seconds < 0) {
    errors.push('actual_play_time_seconds must be a non-negative number');
  }
  if (typeof feedback.completion_percentage !== 'number' ||
      feedback.completion_percentage < 0 ||
      feedback.completion_percentage > 100) {
    errors.push('completion_percentage must be between 0 and 100');
  }

  if (errors.length > 0) {
    throw new FeedbackSubmissionError(
      'Validation failed',
      400,
      errors
    );
  }
}

// ============================================================================
// CLASSE DE ERRO CUSTOMIZADA
// ============================================================================

export class FeedbackSubmissionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: string[]
  ) {
    super(message);
    this.name = 'FeedbackSubmissionError';
  }
}

// ============================================================================
// HOOK DO REACT (OPCIONAL)
// ============================================================================

import { useState } from 'react';

export function useMeditationFeedback() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<FeedbackSubmissionError | null>(null);

  const submit = async (
    feedback: MeditationFeedbackPayload,
    options: {
      sessionId: string;
      guestId?: string;
      authToken?: string;
    }
  ) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await submitMeditationFeedback(feedback, options);
      setIsSubmitting(false);
      return result;
    } catch (err) {
      const feedbackError = err instanceof FeedbackSubmissionError
        ? err
        : new FeedbackSubmissionError('Unknown error', 500);

      setError(feedbackError);
      setIsSubmitting(false);
      throw feedbackError;
    }
  };

  return {
    submit,
    isSubmitting,
    error,
  };
}

// ============================================================================
// EXEMPLO DE USO EM COMPONENTE REACT
// ============================================================================

/*
import { useMeditationFeedback } from './meditationFeedback';

function MeditationFeedbackComponent() {
  const { submit, isSubmitting, error } = useMeditationFeedback();
  const [feedbackSent, setFeedbackSent] = useState(false);

  const handlePositiveFeedback = async () => {
    try {
      const result = await submit(
        {
          vote: 'positive',
          meditation_id: meditationData.id,
          meditation_title: meditationData.title,
          meditation_duration_seconds: meditationData.duration,
          meditation_category: meditationData.category,
          actual_play_time_seconds: playerStats.actualPlayTime,
          completion_percentage: playerStats.completionPercentage,
          pause_count: playerStats.pauseCount,
          skip_count: playerStats.skipCount,
          seek_count: playerStats.seekCount,
        },
        {
          sessionId: userSession.sessionId,
          guestId: userSession.guestId,
          authToken: userSession.authToken,
        }
      );

      console.log('Feedback enviado:', result.feedback_id);
      setFeedbackSent(true);
    } catch (err) {
      console.error('Erro ao enviar feedback:', err);
      // Mostrar mensagem de erro para o usuário
    }
  };

  const handleNegativeFeedback = async (reasons: FeedbackReason[]) => {
    try {
      const result = await submit(
        {
          vote: 'negative',
          reasons: reasons,
          meditation_id: meditationData.id,
          meditation_title: meditationData.title,
          meditation_duration_seconds: meditationData.duration,
          meditation_category: meditationData.category,
          actual_play_time_seconds: playerStats.actualPlayTime,
          completion_percentage: playerStats.completionPercentage,
        },
        {
          sessionId: userSession.sessionId,
          guestId: userSession.guestId,
        }
      );

      console.log('Feedback negativo enviado:', result.feedback_id);
      setFeedbackSent(true);
    } catch (err) {
      console.error('Erro ao enviar feedback:', err);
    }
  };

  return (
    <div>
      {!feedbackSent ? (
        <>
          <button onClick={handlePositiveFeedback} disabled={isSubmitting}>
            👍 Gostei
          </button>
          <button onClick={() => handleNegativeFeedback(['too_long'])} disabled={isSubmitting}>
            👎 Não gostei
          </button>
          {error && <p>Erro: {error.message}</p>}
        </>
      ) : (
        <p>Obrigado pelo feedback! 🙏</p>
      )}
    </div>
  );
}
*/

// ============================================================================
// EXEMPLO DE USO SIMPLES (SEM REACT)
// ============================================================================

/*
async function enviarFeedbackPositivo() {
  try {
    const resultado = await submitMeditationFeedback(
      {
        vote: 'positive',
        meditation_id: 'energy_blessing_1',
        meditation_title: 'Bênçãos dos Centros de Energia',
        meditation_duration_seconds: 462,
        meditation_category: 'energy_blessings',
        actual_play_time_seconds: 445,
        completion_percentage: 96.32,
        pause_count: 2,
      },
      {
        sessionId: 'uuid-session-aqui',
        guestId: 'uuid-guest-aqui',
      }
    );

    console.log('Sucesso!', resultado);
    // Mostrar mensagem de agradecimento
  } catch (erro) {
    console.error('Erro:', erro.message, erro.details);
    // Mostrar mensagem de erro
  }
}
*/
