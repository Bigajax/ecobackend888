import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-key";

const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function patchedLoad(request: string, parent: any, isMain: boolean) {
  if (request === "dotenv") {
    return { config: () => ({ parsed: {} }) };
  }
  if (request === "mixpanel") {
    return {
      init: () => ({
        track: () => {},
        register: () => {},
        register_once: () => {},
        people: { set: () => {}, set_once: () => {}, increment: () => {} },
      }),
    };
  }
  return originalLoad(request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const responseFinalizerModule = require("../../services/conversation/responseFinalizer") as typeof import("../../services/conversation/responseFinalizer");
const helpersModule = require("../../services/conversation/helpers") as typeof import("../../services/conversation/helpers");
const { ResponseFinalizer } = responseFinalizerModule;
const { computeEcoDecision } = require("../../services/conversation/ecoDecisionHub") as typeof import("../../services/conversation/ecoDecisionHub");
const { stripRedundantGreeting, stripIdentityCorrection } = helpersModule;
Module._load = originalLoad;

const noop = () => {};

test("finalize responde rápido mesmo com analisador lento", async (t) => {
  const originalTimeout = process.env.ECO_BLOCO_TIMEOUT_MS;
  process.env.ECO_BLOCO_TIMEOUT_MS = "50";

  t.after(() => {
    if (originalTimeout === undefined) {
      delete process.env.ECO_BLOCO_TIMEOUT_MS;
    } else {
      process.env.ECO_BLOCO_TIMEOUT_MS = originalTimeout;
    }
  });

  let saveCalls = 0;
  const trackMensagemCalls: any[] = [];
  const identifyCalls: any[] = [];
  const sessaoEntrouCalls: any[] = [];
  const trackBlocoCalls: any[] = [];

  const finalizer = new ResponseFinalizer({
    gerarBlocoTecnicoComCache: () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ intensidade: 0.8 }), 200);
      }),
    saveMemoryOrReference: async () => {
      saveCalls += 1;
    },
    trackMensagemEnviada: ((props: any) => {
      trackMensagemCalls.push(props);
    }) as any,
    trackEcoDemorou: noop as any,
    trackBlocoTecnico: ((payload: any) => {
      trackBlocoCalls.push(payload);
    }) as any,
    identifyUsuario: ((payload: any) => {
      identifyCalls.push(payload);
    }) as any,
    trackSessaoEntrouChat: ((payload: any) => {
      sessaoEntrouCalls.push(payload);
    }) as any,
    trackRespostaQ: noop as any,
    trackKnapsackDecision: noop as any,
  });

  const start = Date.now();
  const ecoDecision = computeEcoDecision("Oi");
  const result = await finalizer.finalize({
    raw: "Oi",
    ultimaMsg: "Oi",
    hasAssistantBefore: false,
    mode: "fast",
    startedAt: Date.now(),
    userId: "user-123",
    supabase: {},
    sessionMeta: {
      distinctId: "distinct-123",
      versaoApp: "1.0.0",
      device: "ios",
      ambiente: "produção",
      sessaoId: "sessao-abc",
      origem: "app-mobile",
    },
    ecoDecision,
  });
  const duration = Date.now() - start;

  assert.ok(
    duration < 150,
    `finalize deveria resolver rápido; levou ${duration}ms`
  );
  assert.strictEqual(result.intensidade, ecoDecision.intensity);

  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.ok(saveCalls >= 1, "saveMemoryOrReference deve ser disparado em background");
  assert.strictEqual(trackMensagemCalls.length, 1, "trackMensagemEnviada deve ser chamado");
  assert.strictEqual(
    trackMensagemCalls[0].distinctId,
    "distinct-123",
    "trackMensagemEnviada deve receber distinctId"
  );
  assert.strictEqual(
    trackMensagemCalls[0].blocoStatus,
    "skipped",
    "trackMensagemEnviada deve registrar bloco pulado quando intensidade baixa"
  );
  assert.strictEqual(trackBlocoCalls.length, 0, "trackBlocoTecnico não deve ser chamado quando bloco não é necessário");
  assert.strictEqual(
    sessaoEntrouCalls.length,
    1,
    "trackSessaoEntrouChat deve ser chamado na primeira interação"
  );
  assert.deepStrictEqual(sessaoEntrouCalls[0], {
    distinctId: "distinct-123",
    userId: "user-123",
    mode: "fast",
    sessaoId: "sessao-abc",
    origem: "app-mobile",
    versaoApp: "1.0.0",
    device: "ios",
    ambiente: "produção",
  });
  assert.strictEqual(identifyCalls.length, 1, "identifyUsuario deve ser chamado no primeiro contato");
  assert.deepStrictEqual(identifyCalls[0], {
    distinctId: "distinct-123",
    userId: "user-123",
    versaoApp: "1.0.0",
    device: "ios",
    ambiente: "produção",
  });
});

test("trackSessaoEntrouChat só dispara quando não houve assistente antes", async () => {
  const sessaoEntrouCalls: any[] = [];

  const finalizer = new ResponseFinalizer({
    gerarBlocoTecnicoComCache: async () => null,
    saveMemoryOrReference: async () => {},
    trackMensagemEnviada: noop as any,
    trackEcoDemorou: noop as any,
    trackBlocoTecnico: noop as any,
    identifyUsuario: noop as any,
    trackSessaoEntrouChat: ((payload: any) => {
      sessaoEntrouCalls.push(payload);
    }) as any,
    trackRespostaQ: noop as any,
    trackKnapsackDecision: noop as any,
  });

  await finalizer.finalize({
    raw: "Olá",
    ultimaMsg: "Olá",
    hasAssistantBefore: false,
    mode: "full",
    startedAt: Date.now(),
    sessionMeta: { distinctId: "d-1" },
    supabase: {},
    ecoDecision: computeEcoDecision("Olá"),
  });

  await finalizer.finalize({
    raw: "Oi de novo",
    ultimaMsg: "Oi de novo",
    hasAssistantBefore: true,
    mode: "fast",
    startedAt: Date.now(),
    sessionMeta: { distinctId: "d-1" },
    supabase: {},
    ecoDecision: computeEcoDecision("Oi de novo"),
  });

  assert.strictEqual(sessaoEntrouCalls.length, 1);
  assert.strictEqual(sessaoEntrouCalls[0].mode, "full");
});

test("identifyUsuario é chamado mesmo quando já houve assistente se houver sessionMeta", async () => {
  const identifyCalls: any[] = [];

  const finalizer = new ResponseFinalizer({
    gerarBlocoTecnicoComCache: async () => null,
    saveMemoryOrReference: async () => {},
    trackMensagemEnviada: noop as any,
    trackEcoDemorou: noop as any,
    trackBlocoTecnico: noop as any,
    identifyUsuario: ((payload: any) => {
      identifyCalls.push(payload);
    }) as any,
    trackSessaoEntrouChat: noop as any,
    trackRespostaQ: noop as any,
    trackKnapsackDecision: noop as any,
  });

  await finalizer.finalize({
    raw: "Olá novamente",
    ultimaMsg: "Olá novamente",
    hasAssistantBefore: true,
    mode: "fast",
    startedAt: Date.now(),
    sessionMeta: {
      distinctId: "distinct-xyz",
      versaoApp: "2.0.0",
      device: "android",
      ambiente: "staging",
    },
    supabase: {},
    ecoDecision: computeEcoDecision("Olá novamente"),
  });

  assert.strictEqual(identifyCalls.length, 1);
  assert.deepStrictEqual(identifyCalls[0], {
    distinctId: "distinct-xyz",
    userId: undefined,
    versaoApp: "2.0.0",
    device: "android",
    ambiente: "staging",
  });
});

test("preenche intensidade e resumo quando bloco chega dentro do timeout", async (t) => {
  const originalTimeout = process.env.ECO_BLOCO_TIMEOUT_MS;
  process.env.ECO_BLOCO_TIMEOUT_MS = "1000";

  t.after(() => {
    if (originalTimeout === undefined) {
      delete process.env.ECO_BLOCO_TIMEOUT_MS;
    } else {
      process.env.ECO_BLOCO_TIMEOUT_MS = originalTimeout;
    }
  });

  const finalizer = new ResponseFinalizer({
    gerarBlocoTecnicoComCache: async () => ({
      intensidade: 0.42,
      analise_resumo: "  resumo alinhado  ",
      emocao_principal: "alegria",
      tags: ["tag-a"],
    }),
    saveMemoryOrReference: async () => {},
    trackMensagemEnviada: noop as any,
    trackEcoDemorou: noop as any,
    trackBlocoTecnico: noop as any,
    identifyUsuario: noop as any,
    trackSessaoEntrouChat: noop as any,
    trackRespostaQ: noop as any,
    trackKnapsackDecision: noop as any,
  });

  const ecoDecisionPrompt = computeEcoDecision("Olá!");
  ecoDecisionPrompt.hasTechBlock = true;
  ecoDecisionPrompt.saveMemory = true;
  const result = await finalizer.finalize({
    raw: "Olá!",
    ultimaMsg: "Olá!",
    hasAssistantBefore: false,
    mode: "full",
    startedAt: Date.now(),
    supabase: {},
    ecoDecision: ecoDecisionPrompt,
  });

  assert.strictEqual(result.intensidade, ecoDecisionPrompt.intensity);
  assert.strictEqual(result.resumo, "resumo alinhado");
});

test("stripRedundantGreeting remove saudação quando assistente já respondeu", () => {
  const casos: Array<[string, string]> = [
    ["Oi, tudo bem?", "tudo bem?"],
    ["Boa noite! Como posso ajudar?", "Como posso ajudar?"],
  ];

  for (const [input, esperado] of casos) {
    const resultado = stripRedundantGreeting(input, true);
    assert.strictEqual(resultado, esperado);
  }

  const semAssistente = stripRedundantGreeting("Oi, tudo bem?", false);
  assert.strictEqual(semAssistente, "Oi, tudo bem?");
});

test("stripIdentityCorrection lida com nomes contendo metacaracteres de regex", () => {
  const casos: Array<[string, string, string]> = [
    ["Oi!\nEu sou a Eco, não a C++.", "C++", "Oi!"],
    ["Bem-vinda!\nEu sou a Eco, não a Ana(.", "Ana(", "Bem-vinda!"],
  ];

  for (const [input, nome, esperado] of casos) {
    const resultado = stripIdentityCorrection(input, nome);
    assert.strictEqual(resultado, esperado);
  }
});

test("finalize remove correção de identidade com nome que contém parênteses", async () => {
  const finalizer = new ResponseFinalizer({
    gerarBlocoTecnicoComCache: async () => null,
    saveMemoryOrReference: async () => {},
    trackMensagemEnviada: noop as any,
    trackEcoDemorou: noop as any,
    trackBlocoTecnico: noop as any,
    identifyUsuario: noop as any,
    trackSessaoEntrouChat: noop as any,
    trackRespostaQ: noop as any,
    trackKnapsackDecision: noop as any,
  });

  const entrada = "Oi!\nEu sou a Eco, não a Ana(.";
  const resultado = await finalizer.finalize({
    raw: entrada,
    ultimaMsg: entrada,
    userName: "Ana(",
    hasAssistantBefore: false,
    mode: "fast",
    startedAt: Date.now(),
    supabase: {},
    ecoDecision: computeEcoDecision(entrada),
  });

  assert.strictEqual(resultado.message, "Oi!");
});
