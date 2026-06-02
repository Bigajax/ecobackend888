/**
 * promptContract.golden.test.ts — Rede de segurança (Fase 0 da reestruturação de módulos).
 *
 * Trava o COMPORTAMENTO ATUAL da montagem do system prompt antes de qualquer refatoração.
 * Roda via `npm run test:node` (node:test + ts-node), sem env do Supabase — chama o mesmo
 * `montarContextoEco` que produção e o `dumpPrompt` usam, com decisão forçada por nível.
 *
 * Se um destes asserts quebrar durante a migração, ou é regressão (corrigir) ou é mudança
 * intencional (atualizar o golden conscientemente, com revisão).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import montarContextoEco from "../../services/promptContext/ContextBuilder";
import { computeEcoDecision } from "../../services/conversation/ecoDecisionHub";
import { needlePresent, presentSources } from "../../services/promptContext/promptMarkers";

const USER_ID = "11111111-1111-4111-8111-111111111111";

interface Scenario {
  nivel?: 1 | 2 | 3;
  intensidade?: number;
  vuln?: boolean;
  guest?: boolean;
}

async function buildPrompt(texto: string, sc: Scenario = {}): Promise<string> {
  const decision = computeEcoDecision(texto);
  if (typeof sc.intensidade === "number") decision.intensity = sc.intensidade;
  if (sc.vuln) decision.isVulnerable = true;
  if (sc.nivel === 1 || sc.nivel === 2 || sc.nivel === 3) decision.openness = sc.nivel;

  const res = await montarContextoEco({
    userId: sc.guest ? undefined : USER_ID,
    guestId: sc.guest ? "guest_11111111-1111-4111-8111-111111111111" : null,
    userName: "Rafael",
    texto,
    mems: [],
    memoriasSemelhantes: [
      {
        resumo_eco: "Perdi meu emprego e me senti perdido sobre o que fazer.",
        similarity: 0.83,
        tags: ["trabalho", "perda"],
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        dominio_vida: "trabalho",
      },
    ],
    decision,
  } as any);

  return res.montarMensagemAtual(texto);
}

// Blocos-fonte que DEVEM estar presentes em todos os níveis (âncoras invariáveis).
const INVARIANT_PRESENT = [
  "Exploradora de Conhecimento Ontológico", // promptIdentity → ID_ECO_CORE
  "PROIBIÇÕES LINGUÍSTICAS", // promptIdentity → ECO_VOICE
  "MEMÓRIA E CONTINUIDADE", // promptIdentity → MEMORY_PROTOCOL
  "SEGURANÇA E LIMITES", // promptIdentity → SAFETY_PROTOCOL
  "Missão Fundamental", // developer_prompt.txt
  "MEMÓRIAS PERTINENTES", // contextSectionsBuilder
];

// Blocos-fonte hoje MORTOS (nunca entram). Se algum passar a aparecer, é mudança a revisar.
const INVARIANT_ABSENT = [
  "Espelho de Terceira Ordem", // formato_resposta.txt
  "Zona proximal de desenvolvimento", // instrucoes_sistema.txt
  "Persona Operacional", // sistema_identidade.txt (dropado pelo stitcher)
  "Continuidade Discreta", // usomemorias.txt
  "Movimento Quádruplo", // nv2_reflexao_core.txt
  "Movimento Quíntuplo", // nv3_profundo_core.txt
];

const IDENTITY_TRANSITION_NEEDLE = "pergunta mais silenciosa"; // instructionPolicy → IDENTITY_TRANSITION

const SCENARIOS: Array<{ nome: string; texto: string; sc: Scenario }> = [
  { nome: "NV1 saudação", texto: "oi, tudo bem?", sc: { nivel: 1 } },
  { nome: "NV1 guest", texto: "oi", sc: { nivel: 1, guest: true } },
  {
    nome: "NV2 exploração (carreira)",
    texto: "ando pensando se devia trocar de carreira, sinto que estou meio atrasado",
    sc: { nivel: 2, intensidade: 5 },
  },
  {
    nome: "NV3 intensidade≥7 + vuln (atraso)",
    texto: "nao aguento mais essa sensacao de estar atrasado, todo mundo ja conseguiu menos eu",
    sc: { nivel: 3, intensidade: 8, vuln: true },
  },
  {
    nome: "NV3 crise (ideação)",
    texto: "nao aguento mais, penso em sumir e acabar com tudo",
    sc: { nivel: 3, intensidade: 9, vuln: true },
  },
];

for (const { nome, texto, sc } of SCENARIOS) {
  test(`[golden] âncoras invariáveis presentes — ${nome}`, async () => {
    const prompt = await buildPrompt(texto, sc);
    for (const needle of INVARIANT_PRESENT) {
      assert.ok(needlePresent(prompt, needle), `esperava bloco presente: "${needle}" (${nome})`);
    }
  });

  test(`[golden] módulos mortos ausentes — ${nome}`, async () => {
    const prompt = await buildPrompt(texto, sc);
    for (const needle of INVARIANT_ABSENT) {
      assert.ok(!needlePresent(prompt, needle), `esperava bloco AUSENTE: "${needle}" (${nome})`);
    }
  });
}

test("[golden] lente IDENTIDADE_TRANSICAO: gate por tema em NV2/NV3, fora de NV1, fora de NV2 sem-tema", async () => {
  const nv1 = await buildPrompt("oi, tudo bem?", { nivel: 1 });
  const nv2tema = await buildPrompt("pensando em trocar de carreira", { nivel: 2, intensidade: 5 });
  const nv3tema = await buildPrompt("nao aguento, estou atrasado na vida", {
    nivel: 3,
    intensidade: 8,
    vuln: true,
  });
  // NV2 sem tema de carreira/dinheiro/atraso: a lente NÃO deve disparar (gate por tema).
  const nv2semTema = await buildPrompt("me sinto sozinho ultimamente e nao sei bem por que", {
    nivel: 2,
    intensidade: 5,
  });

  assert.ok(!needlePresent(nv1, IDENTITY_TRANSITION_NEEDLE), "NV1 não deve ter a lente");
  assert.ok(needlePresent(nv2tema, IDENTITY_TRANSITION_NEEDLE), "NV2 com tema deve ter a lente");
  assert.ok(needlePresent(nv3tema, IDENTITY_TRANSITION_NEEDLE), "NV3 com tema deve ter a lente");
  assert.ok(
    !needlePresent(nv2semTema, IDENTITY_TRANSITION_NEEDLE),
    "NV2 sem tema NÃO deve ter a lente"
  );
});

test("[guard] conjunto EXATO de blocos-fonte presentes (NV3 tema) — trava morto↔vivo", async () => {
  const prompt = await buildPrompt(
    "estou atrasado na carreira, ganho dinheiro mas nao aguento essa comparacao",
    { nivel: 3, intensidade: 8, vuln: true }
  );
  const sources = presentSources(prompt)
    .map((m) => m.source)
    .sort();
  const esperado = [
    "promptIdentity.ts → ID_ECO_CORE",
    "promptIdentity.ts → ECO_VOICE",
    "promptIdentity.ts → MEMORY_PROTOCOL",
    "promptIdentity.ts → SAFETY_PROTOCOL",
    "developer_prompt.txt",
    "metodo_viva_enxuto.txt",
    "bloco MEMÓRIAS PERTINENTES (contextSectionsBuilder)",
    "lenses → IDENTIDADE_TRANSICAO",
  ].sort();
  assert.deepEqual(
    sources,
    esperado,
    "Mudou o conjunto de blocos-fonte vivos no prompt — se intencional, atualize este golden conscientemente."
  );
});

test("[golden] depthBody da lente IDENTIDADE_TRANSICAO só aparece em intensidade ≥7", async () => {
  const depthNeedle = "ainda valer a pena";
  const nv2 = await buildPrompt("pensando em trocar de carreira", { nivel: 2, intensidade: 5 });
  const nv3 = await buildPrompt("estou atrasado na carreira e nao aguento", {
    nivel: 3,
    intensidade: 8,
    vuln: true,
  });
  assert.ok(!needlePresent(nv2, depthNeedle), "NV2 (intensidade<7) não deve ter depthBody");
  assert.ok(needlePresent(nv3, depthNeedle), "NV3 (intensidade≥7) deve ter depthBody");
});
