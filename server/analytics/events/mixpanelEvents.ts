// server/events/mixpanelEvents.ts
import mixpanel from '../../lib/mixpanel';
import type { RetrieveMode } from '../../services/supabase/memoriaRepository';

type BaseProps = { distinctId?: string; userId?: string };

type TrackParams<T extends Record<string, unknown>> = BaseProps & T;

const withDistinctId = <T extends Record<string, unknown>>(
  props: TrackParams<T>
): Record<string, unknown> => {
  const { distinctId, userId, ...rest } = props;
  const trackId = distinctId || userId;
  return {
    ...(trackId ? { distinct_id: trackId } : {}),
    ...(userId ? { userId } : {}),
    ...rest,
  };
};

export const identifyUsuario = ({
  distinctId,
  userId,
  versaoApp,
  device,
  ambiente,
}: {
  distinctId?: string;
  userId?: string;
  versaoApp?: string | null;
  device?: string | null;
  ambiente?: string | null;
}): void => {
  if (!distinctId) return;

  const props: Record<string, unknown> = {};
  if (userId) props.user_id = userId;
  if (versaoApp !== undefined) props.versao_app = versaoApp;
  if (device !== undefined) props.device = device;
  if (ambiente !== undefined) props.ambiente = ambiente;

  if (Object.keys(props).length === 0) return;

  mixpanel.register_once(props);
  mixpanel.people.set_once(distinctId, props);
};

export const trackMensagemEnviada = ({
  distinctId,
  userId,
  tempoRespostaMs,
  tokensUsados,
  modelo,
  blocoStatus,
}: TrackParams<{
  tempoRespostaMs?: number;
  tokensUsados?: number;
  modelo?: string;
  blocoStatus: "pending" | "ready" | "missing" | "skipped";
}>) => {
  mixpanel.track(
    'Mensagem enviada',
    withDistinctId({
      distinctId,
      userId,
      tempoRespostaMs,
      tokensUsados,
      modelo,
      blocoStatus,
    })
  );
};

const toIsoTimestamp = (value: Date | string | number | undefined): string | undefined => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? undefined : value.toISOString();
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }

  return undefined;
};

export const trackMensagemRecebida = ({
  distinctId,
  userId,
  origem,
  tipo,
  tamanhoCaracteres,
  tamanhoBytes,
  duracaoMs,
  timestamp,
  sessaoId,
  origemSessao,
}: TrackParams<{
  origem: 'texto' | 'voz';
  tipo?: 'inicial' | 'continuacao';
  tamanhoCaracteres?: number;
  tamanhoBytes?: number;
  duracaoMs?: number;
  timestamp: Date | string | number;
  sessaoId?: string | null;
  origemSessao?: string | null;
}>) => {
  const isoTimestamp = toIsoTimestamp(timestamp);

  mixpanel.track(
    'Mensagem recebida',
    withDistinctId({
      distinctId,
      userId,
      origem,
      tipo,
      ...(typeof tamanhoCaracteres === 'number'
        ? { tamanhoCaracteres }
        : {}),
      ...(typeof tamanhoBytes === 'number' ? { tamanhoBytes } : {}),
      ...(typeof duracaoMs === 'number' ? { duracaoMs } : {}),
      ...(isoTimestamp ? { timestamp: isoTimestamp } : {}),
      ...(sessaoId !== undefined ? { sessaoId } : {}),
      ...(origemSessao !== undefined ? { origemSessao } : {}),
    })
  );
};

export const trackEcoCache = ({
  distinctId,
  userId,
  status,
  key,
  source,
}: TrackParams<{
  status: "hit" | "miss";
  key?: string;
  source: "openrouter" | string;
}>) => {
  mixpanel.track(
    "Eco response cache",
    withDistinctId({
      distinctId,
      userId,
      status,
      ...(key ? { key } : {}),
      source,
    })
  );
};

export const trackGuestStart = ({
  guestId,
  sessaoId,
  origem,
}: {
  guestId: string;
  sessaoId?: string | null;
  origem?: string | null;
}): void => {
  if (!guestId) return;
  const payload: Record<string, unknown> = {
    distinct_id: guestId,
    guestId,
  };
  if (sessaoId !== undefined) payload.sessaoId = sessaoId;
  if (origem !== undefined) payload.origem = origem;
  mixpanel.track("guest_start", payload);
};

export const trackGuestMessage = ({
  guestId,
  ordem,
  max,
  tamanhoCaracteres,
  sessaoId,
  origem,
}: {
  guestId: string;
  ordem: number;
  max: number;
  tamanhoCaracteres: number;
  sessaoId?: string | null;
  origem?: string | null;
}): void => {
  if (!guestId) return;
  const payload: Record<string, unknown> = {
    distinct_id: guestId,
    guestId,
    ordem,
    max,
    tamanhoCaracteres,
  };
  if (sessaoId !== undefined) payload.sessaoId = sessaoId;
  if (origem !== undefined) payload.origem = origem;
  mixpanel.track("guest_message", payload);
};

export const trackGuestClaimed = ({
  guestId,
  userId,
}: {
  guestId: string;
  userId: string;
}): void => {
  if (!guestId || !userId) return;
  mixpanel.track("guest_claimed", {
    distinct_id: guestId,
    guestId,
    userId,
  });
};

export const trackEcoDemorou = ({
  distinctId,
  userId,
  duracaoMs,
  ultimaMsg,
}: TrackParams<{
  duracaoMs: number;
  ultimaMsg: string;
}>) => {
  mixpanel.track(
    'Eco demorou',
    withDistinctId({ distinctId, userId, duracaoMs, ultimaMsg })
  );
};

export const trackPerguntaProfunda = ({
  distinctId,
  userId,
  emocao,
  intensidade,
  categoria,
  dominioVida,
}: TrackParams<{
  emocao: string;
  intensidade?: number;
  categoria?: string | null;
  dominioVida?: string | null;
}>) => {
  mixpanel.track(
    'Pergunta profunda feita',
    withDistinctId({
      distinctId,
      userId,
      emocao,
      intensidade,
      categoria,
      dominioVida,
    })
  );
};

export const trackMemoriaRegistrada = ({
  distinctId,
  userId,
  intensidade,
  emocao,
  categoria,
  dominioVida,
}: TrackParams<{
  intensidade?: number;
  emocao: string;
  categoria?: string | null;
  dominioVida?: string | null;
}>) => {
  mixpanel.track(
    'Memória registrada',
    withDistinctId({
      distinctId,
      userId,
      intensidade,
      emocao,
      categoria,
      dominioVida,
    })
  );
};

export const trackReferenciaEmocional = ({
  distinctId,
  userId,
  intensidade,
  emocao,
  tags,
  categoria,
}: TrackParams<{
  intensidade?: number;
  emocao: string;
  tags: string[];
  categoria?: string | null;
}>) => {
  mixpanel.track(
    'Referência emocional',
    withDistinctId({ distinctId, userId, intensidade, emocao, tags, categoria })
  );
};

export const trackBlocoTecnico = ({
  distinctId,
  userId,
  status,
  mode,
  skipBloco,
  duracaoMs,
  intensidade,
  erro,
}: TrackParams<{
  status: 'success' | 'failure' | 'timeout' | 'pending';
  mode: 'fast' | 'full';
  skipBloco: boolean;
  duracaoMs?: number;
  intensidade?: number | null;
  erro?: string;
}>) => {
  mixpanel.track(
    'Bloco técnico',
    withDistinctId({
      distinctId,
      userId,
      status,
      mode,
      skipBloco,
      ...(duracaoMs !== undefined ? { duracaoMs } : {}),
      ...(intensidade !== undefined ? { intensidade } : {}),
      ...(erro ? { erro } : {}),
    })
  );
};

export const trackRelatorioEmocionalAcessado = ({
  distinctId,
  userId,
  origem,
  view,
}: TrackParams<{
  origem: string;
  view?: string | null;
}>) => {
  mixpanel.track(
    'Relatório emocional acessado',
    withDistinctId({
      distinctId,
      userId,
      origem,
      ...(view ? { view } : {}),
    })
  );
};

export const trackSessaoEntrouChat = ({
  distinctId,
  userId,
  mode,
  origem,
  sessaoId,
  versaoApp,
  device,
  ambiente,
}: TrackParams<{
  mode: "fast" | "full";
  origem?: string | null;
  sessaoId?: string | null;
  versaoApp?: string | null;
  device?: string | null;
  ambiente?: string | null;
}>) => {
  const payload = withDistinctId({
    distinctId,
    userId,
    mode,
    ...(sessaoId ? { sessaoId } : {}),
    ...(origem ? { origem } : {}),
    ...(versaoApp !== undefined ? { versaoApp } : {}),
    ...(device !== undefined ? { device } : {}),
    ...(ambiente !== undefined ? { ambiente } : {}),
  });

  mixpanel.track("Sessão entrou no chat", payload);
};

export const trackRetrieveMode = ({
  distinctId,
  userId,
  mode,
  reason,
  word_count,
  char_length,
}: TrackParams<{
  mode: RetrieveMode;
  reason: string;
  word_count?: number;
  char_length?: number;
}>) => {
  mixpanel.track(
    'Retrieve_Mode',
    withDistinctId({
      distinctId,
      userId,
      mode,
      reason,
      ...(typeof word_count === 'number' ? { word_count } : {}),
      ...(typeof char_length === 'number' ? { char_length } : {}),
    })
  );
};

export const trackRespostaQ = ({
  distinctId,
  userId,
  Q,
  estruturado_ok,
  memoria_ok,
  bloco_ok,
  tokens_total,
  tokens_aditivos,
  mem_count,
}: TrackParams<{
  Q: number;
  estruturado_ok: boolean;
  memoria_ok: boolean;
  bloco_ok: boolean;
  tokens_total?: number;
  tokens_aditivos?: number | undefined;
  mem_count?: number;
}>) => {
  mixpanel.track(
    'Resposta_Q',
    withDistinctId({
      distinctId,
      userId,
      Q,
      estruturado_ok,
      memoria_ok,
      bloco_ok,
      ...(typeof tokens_total === 'number' ? { tokens_total } : {}),
      ...(typeof tokens_aditivos === 'number' ? { tokens_aditivos } : {}),
      ...(typeof mem_count === 'number' ? { mem_count } : {}),
    })
  );
};

export const trackKnapsackDecision = ({
  distinctId,
  userId,
  budget,
  adotados,
  marginal_gain,
  tokens_aditivos,
}: TrackParams<{
  budget: number;
  adotados: string[];
  marginal_gain: number;
  tokens_aditivos?: number;
}>) => {
  mixpanel.track(
    'Knapsack_Decision',
    withDistinctId({
      distinctId,
      userId,
      budget,
      adotados,
      marginal_gain,
      ...(typeof tokens_aditivos === 'number' ? { tokens_aditivos } : {}),
    })
  );
};

export const trackBanditArmPick = ({
  distinctId,
  userId,
  pilar,
  arm,
}: TrackParams<{ pilar: string; arm: string }>) => {
  mixpanel.track(
    'Bandit_Arm_Pick',
    withDistinctId({
      distinctId,
      userId,
      pilar,
      arm,
    })
  );
};

export const trackBanditArmUpdate = ({
  distinctId,
  userId,
  pilar,
  arm,
  recompensa,
}: TrackParams<{ pilar: string; arm: string; recompensa: number }>) => {
  mixpanel.track(
    'Bandit_Arm_Update',
    withDistinctId({
      distinctId,
      userId,
      pilar,
      arm,
      recompensa,
    })
  );
};
