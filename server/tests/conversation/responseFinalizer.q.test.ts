import test from "node:test";
import assert from "node:assert/strict";

import { ResponseFinalizer } from "../../services/conversation/responseFinalizer";
import { qualityAnalyticsStore } from "../../services/analytics/analyticsStore";
import type { EcoDecisionResult } from "../../services/conversation/ecoDecisionHub";
import { makeResponseFinalizerDepsStub } from "../../../tests/helpers/makeResponseFinalizerDepsStub";

test("finalize calcula Q completo e registra evento", async () => {
  qualityAnalyticsStore.reset();
  const eventos: any[] = [];

  const finalizer = new ResponseFinalizer(
    makeResponseFinalizerDepsStub({
      gerarBlocoTecnicoComCache: async () => ({
        analise_resumo: "Resumo",
        emocao_principal: "alegria",
        intensidade: 8,
        tags: ["conexao"],
      }),
      saveMemoryOrReference: async () => undefined,
      trackMensagemEnviada: () => undefined,
      trackEcoDemorou: () => undefined,
      trackBlocoTecnico: () => undefined,
      trackSessaoEntrouChat: () => undefined,
      identifyUsuario: () => undefined,
      trackRespostaQ: (payload: any) => {
        eventos.push(payload);
      },
      trackKnapsackDecision: () => undefined,
      trackBanditArmUpdate: () => undefined,
    })
  );

  const ecoDecision: EcoDecisionResult = {
    intensity: 8,
    openness: 3,
    isVulnerable: true,
    vivaSteps: ["V", "I", "A"],
    saveMemory: true,
    hasTechBlock: true,
    tags: [],
    domain: null,
    flags: {} as any,
    signals: {},
    activeBiases: [],
    decayedActiveBiases: [],
    debug: {
      intensitySignals: [],
      vulnerabilitySignals: [],
      modules: [],
      selectedModules: [],
    },
  };

  const raw = [
    "## 1. Espelho de segunda ordem",
    "Você acolhe o medo enquanto protege algo precioso.",
    "## 2. Insight ou padrão",
    "Uma hipótese é que mem_id:abc-123 aponta para vínculo antigo.",
    "## 3. Convite prático",
    "- Observe como o corpo responde quando pensa nisso.",
    "## 4. Pergunta única",
    "Que parte de você pede cuidado agora?",
    '{"emocao_principal":"alegria","analise_resumo":"Resumo","intensidade":8,"tags":["conexao"]}',
  ].join("\n");

  const resultado = await finalizer.finalize({
    raw,
    ultimaMsg: "Preciso entender meus padrões",
    userName: "Luna",
    hasAssistantBefore: true,
    userId: "user-1",
    mode: "full",
    startedAt: Date.now() - 100,
    usageTokens: 128,
    modelo: "test-model",
    ecoDecision,
    moduleCandidates: [],
    selectedModules: [],
    memsSemelhantes: [{ id: "abc-123", tags: ["conexao"] }],
  });

  assert.equal(resultado.message.includes("Espelho"), true);
  assert.equal(eventos.length, 1);
  const payload = eventos[0];
  assert.equal(payload.Q, 1);
  assert.equal(payload.estruturado_ok, true);
  assert.equal(payload.memoria_ok, true);
  assert.equal(payload.bloco_ok, true);
  assert.equal(payload.tokens_total, 128);
  assert.equal(payload.tokens_aditivos, undefined);
  assert.equal(payload.mem_count, 1);

  const snapshot = qualityAnalyticsStore.getQualitySnapshot();
  assert.equal(snapshot.last24h.count, 1);
  assert.equal(snapshot.last7d.count, 1);
});

test("finalize atualiza bandit quando módulo é usado", async () => {
  qualityAnalyticsStore.reset();
  const banditEvents: any[] = [];

  const finalizer = new ResponseFinalizer(
    makeResponseFinalizerDepsStub({
      gerarBlocoTecnicoComCache: async () => null,
      saveMemoryOrReference: async () => undefined,
      trackMensagemEnviada: () => undefined,
      trackEcoDemorou: () => undefined,
      trackBlocoTecnico: () => undefined,
      trackSessaoEntrouChat: () => undefined,
      identifyUsuario: () => undefined,
      trackRespostaQ: () => undefined,
      trackKnapsackDecision: () => undefined,
      trackBanditArmUpdate: (payload: any) => {
        banditEvents.push(payload);
      },
    })
  );

  // Contrato real: o selector anexa as decisões do bandit em
  // ecoDecision.debug.banditPlan.decisions (FamilyDecisionLog[]), e o finalizer
  // grava o posterior usando a própria arm escolhida (chosen === arm.id do
  // manifesto) como armId — vide familyBanditPlanner + moduleSelector.
  const chosenArm = "LINGUAGEM_NATURAL_rules.txt";
  const ecoDecision: EcoDecisionResult = {
    intensity: 6,
    openness: 2,
    isVulnerable: true,
    vivaSteps: ["V", "I", "A"],
    saveMemory: true,
    hasTechBlock: false,
    tags: [],
    domain: null,
    flags: {} as any,
    signals: {},
    activeBiases: [],
    decayedActiveBiases: [],
    debug: {
      intensitySignals: [],
      vulnerabilitySignals: [],
      modules: [],
      selectedModules: [chosenArm],
      knapsack: null,
      banditPlan: {
        decisions: [
          {
            familyId: "Linguagem",
            // reward_key da família: "like_bias" => reward = clamp(Q), e Q=1
            // com estrutura + memória citada, então reward > 0 e o evento dispara.
            rewardKey: "like_bias",
            baseline: chosenArm,
            chosen: chosenArm,
            chosenBy: "ts",
            tokensPlanned: 100,
          },
        ],
        excluded: [],
        dependencies: [],
        tokensPlanned: 100,
      },
    } as any,
  };

  // raw com as 4 seções + memória citada (mem_id) garante Q=1 (estruturado_ok,
  // memoria_ok e bloco_ok), o que torna o like_bias positivo.
  const raw = [
    "## 1. Espelho de segunda ordem",
    "Você reconhece o esforço em nomear o que sente.",
    "## 2. Insight ou padrão",
    "Uma hipótese é que mem_id:xyz aponta para um vínculo recorrente.",
    "## 3. Convite prático",
    "- Observe o corpo quando isso aparece.",
    "## 4. Pergunta única",
    "O que essa parte de você precisa agora?",
    '{"emocao_principal":"medo","analise_resumo":"Resumo","intensidade":7,"tags":["vinculo"]}',
  ].join("\n");

  await finalizer.finalize({
    raw,
    ultimaMsg: "Preciso de ajuda",
    hasAssistantBefore: true,
    mode: "full",
    startedAt: Date.now() - 20,
    usageTokens: 500,
    ecoDecision,
    moduleCandidates: [],
    selectedModules: [chosenArm],
    memsSemelhantes: [{ id: "xyz", tags: ["vinculo"] }],
  });

  const posterior = qualityAnalyticsStore.getBanditPosterior("Linguagem", chosenArm);
  assert.equal(posterior.count, 1);
  assert.equal(banditEvents.length, 1);
  assert.equal(banditEvents[0].arm, chosenArm);
  assert.equal(banditEvents[0].pilar, "Linguagem");
});
