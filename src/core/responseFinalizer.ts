import mixpanel from "../../server/lib/mixpanel";
import { loadBanditState, persistBanditState } from "../bandits/storage";
import { updateArm } from "../bandits/thompson";
import {
  insertBanditRewards,
  insertKnapsackDecision,
  insertLatencySample,
  insertModuleOutcomes,
  insertRespostaQ,
  type BanditRewardRecord,
} from "../analytics/store";
import { checkBlocoTecnico, checkEstrutura, checkMemoria, computeQ } from "../quality/validators";
import type { MontarContextoEcoResult } from "../promptPlan/montarContextoEco";

export interface FinalizacaoParams {
  textoFinal: string;
  tokensTotal: number;
  tempoPrimeiroByteMs?: number;
  tempoUltimoChunkMs?: number;
  contexto: MontarContextoEcoResult;
}

export interface FinalizacaoResultado {
  flags: {
    estruturado_ok: boolean;
    memoria_ok: boolean;
    bloco_ok: boolean;
  };
  q: number;
  reward: number;
}

type QualityFlags = FinalizacaoResultado["flags"];

function getLambda(): number {
  const parsed = Number(process.env.BANDIT_LAMBDA ?? 0.01);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return 0.01;
}

function featureEnabled(): boolean {
  return process.env.ECO_ANALYTICS_ENABLED === "true";
}

function evaluateResposta(params: FinalizacaoParams): FinalizacaoResultado {
  const flags: QualityFlags = {
    estruturado_ok: checkEstrutura(params.textoFinal),
    memoria_ok: checkMemoria(params.textoFinal, params.contexto.memIdsUsadas),
    bloco_ok: checkBlocoTecnico(params.textoFinal, params.contexto.intensidadeDetectada),
  };

  const q = computeQ(flags);
  const lambda = getLambda();
  const reward = Number((q - lambda * (params.tokensTotal / 1000)).toFixed(4));

  return { flags, q, reward };
}

async function trackRespostaQEvent(params: {
  contexto: MontarContextoEcoResult;
  q: number;
  flags: QualityFlags;
  tokensTotal: number;
  ttfb?: number;
  ttlc?: number;
}): Promise<void> {
  try {
    mixpanel.track("Resposta_Q", {
      response_id: params.contexto.responseId,
      user_id: params.contexto.userId,
      retrieve_mode: params.contexto.retrieveMode,
      q: params.q,
      estruturado_ok: params.flags.estruturado_ok,
      memoria_ok: params.flags.memoria_ok,
      bloco_ok: params.flags.bloco_ok,
      tokens_total: params.tokensTotal,
      tokens_aditivos: params.contexto.tokensAditivos,
      ttfb_ms: params.ttfb,
      ttlc_ms: params.ttlc,
    });
  } catch (error) {
    console.error("[responseFinalizer] mixpanel_resposta_q_error", error);
  }
}

async function trackBanditUpdates(params: {
  contexto: MontarContextoEcoResult;
  reward: number;
  q: number;
  tokensTotal: number;
}): Promise<void> {
  const updates = params.contexto.banditSelections.map((selection) => ({
    event: {
      pilar: selection.pilar,
      arm: selection.arm,
      response_id: params.contexto.responseId,
      reward: params.reward,
      q: params.q,
      tokens_total: params.tokensTotal,
    },
  }));

  for (const update of updates) {
    try {
      mixpanel.track("Bandit_Arm_Update", update.event);
    } catch (error) {
      console.error("[responseFinalizer] mixpanel_bandit_update_error", error);
    }
  }
}

async function applyBanditRewards(
  contexto: MontarContextoEcoResult,
  reward: number
): Promise<BanditRewardRecord[]> {
  const banditState = contexto.banditState ?? (await loadBanditState());
  const banditRewards = contexto.banditSelections.map((selection) => {
    updateArm(selection.pilar, selection.arm, reward, banditState);
    return {
      response_id: contexto.responseId,
      pilar: selection.pilar,
      arm: selection.arm,
      recompensa: reward,
    } as BanditRewardRecord;
  });

  await persistBanditState(banditState);
  return banditRewards;
}

async function persistAnalytics(
  params: FinalizacaoParams,
  resultado: FinalizacaoResultado,
  banditRewards: BanditRewardRecord[]
): Promise<void> {
  if (!featureEnabled()) {
    return;
  }

  try {
    await insertRespostaQ({
      response_id: params.contexto.responseId,
      user_id: params.contexto.userId,
      retrieve_mode: params.contexto.retrieveMode,
      q: resultado.q,
      estruturado_ok: resultado.flags.estruturado_ok,
      memoria_ok: resultado.flags.memoria_ok,
      bloco_ok: resultado.flags.bloco_ok,
      tokens_total: params.tokensTotal,
      tokens_aditivos: params.contexto.tokensAditivos,
      ttfb_ms: params.tempoPrimeiroByteMs,
      ttlc_ms: params.tempoUltimoChunkMs,
    });

    await insertLatencySample({
      response_id: params.contexto.responseId,
      ttfb_ms: params.tempoPrimeiroByteMs,
      ttlc_ms: params.tempoUltimoChunkMs,
      tokens_total: params.tokensTotal,
    });

    await insertModuleOutcomes(
      params.contexto.knapsack.adotados.map((modulo) => ({
        response_id: params.contexto.responseId,
        module_id: modulo.id,
        tokens: modulo.tokens,
        q: resultado.q,
        vpt: modulo.tokens > 0 ? resultado.q / modulo.tokens : null,
      }))
    );

    await insertKnapsackDecision({
      response_id: params.contexto.responseId,
      budget: Number(process.env.ECO_BUDGET_ADITIVO_TOKENS ?? 800),
      adotados: params.contexto.knapsack.adotados.map((modulo) => modulo.id),
      ganho_estimado: params.contexto.ganhoEstimado,
      tokens_aditivos: params.contexto.tokensAditivos,
    });

    await insertBanditRewards(banditRewards);
  } catch (error) {
    console.error("[responseFinalizer] analytics_insert_error", error);
  }
}

export async function finalizarResposta(params: FinalizacaoParams): Promise<FinalizacaoResultado> {
  const resultado = evaluateResposta(params);

  await trackRespostaQEvent({
    contexto: params.contexto,
    q: resultado.q,
    flags: resultado.flags,
    tokensTotal: params.tokensTotal,
    ttfb: params.tempoPrimeiroByteMs,
    ttlc: params.tempoUltimoChunkMs,
  });

  await trackBanditUpdates({
    contexto: params.contexto,
    reward: resultado.reward,
    q: resultado.q,
    tokensTotal: params.tokensTotal,
  });

  const banditRewards = await applyBanditRewards(params.contexto, resultado.reward);

  await persistAnalytics(params, resultado, banditRewards);

  return resultado;
}
