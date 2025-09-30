// server/events/mixpanelEvents.ts
import mixpanel from '../../lib/mixpanel';

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

  mixpanel.people.set_once(distinctId, props);
};

export const trackMensagemEnviada = ({
  distinctId,
  userId,
  tempoRespostaMs,
  tokensUsados,
  modelo,
}: TrackParams<{
  tempoRespostaMs?: number;
  tokensUsados?: number;
  modelo?: string;
}>) => {
  mixpanel.track(
    'Mensagem enviada',
    withDistinctId({ distinctId, userId, tempoRespostaMs, tokensUsados, modelo })
  );
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
