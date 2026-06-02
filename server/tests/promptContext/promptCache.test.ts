/**
 * promptCache.test.ts — Onda 2: modo de cache de prompt (ECO_PROMPT_CACHE=1).
 * Verifica que a identidade estável vira PREFIXO (cacheável) e o dinâmico (memória) vai depois da
 * sentinela, e que o ClaudeAdapter divide em 2 blocos com cache_control só no prefixo.
 * Roda em processo isolado (node:test) → setar a env aqui não afeta os outros arquivos de teste.
 */
process.env.ECO_PROMPT_CACHE = "1";

import assert from "node:assert/strict";
import { test } from "node:test";

import montarContextoEco from "../../services/promptContext/ContextBuilder";
import { computeEcoDecision } from "../../services/conversation/ecoDecisionHub";
import { buildSystemMessages } from "../../core/ClaudeAdapter";
import { CACHE_PREFIX_SENTINEL } from "../../utils/promptCache";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ID_NEEDLE = "Exploradora de Conhecimento Ontológico"; // identidade (prefixo)
// Needle único do BLOCO de memória injetada (o protocolo de memória na identidade também cita
// "MEMÓRIAS PERTINENTES", então usamos o texto da própria memória, que só existe no sufixo dinâmico).
const MEM_NEEDLE = "Perdi meu emprego e me senti perdido.";

async function buildCachePrompt(): Promise<string> {
  const decision = computeEcoDecision("estou atrasado na carreira e nao aguento essa comparacao");
  decision.intensity = 8;
  decision.isVulnerable = true;
  decision.openness = 3;
  const ctx = await montarContextoEco({
    userId: USER_ID,
    guestId: null,
    userName: "Rafael",
    texto: "estou atrasado na carreira e nao aguento essa comparacao",
    mems: [],
    memoriasSemelhantes: [
      {
        resumo_eco: "Perdi meu emprego e me senti perdido.",
        similarity: 0.83,
        tags: ["trabalho"],
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        dominio_vida: "trabalho",
      },
    ],
    decision,
  } as any);
  return ctx.montarMensagemAtual("estou atrasado na carreira e nao aguento essa comparacao");
}

test("[cache] identidade é prefixo estável; memória vai após a sentinela", async () => {
  const prompt = await buildCachePrompt();
  const sIdx = prompt.indexOf(CACHE_PREFIX_SENTINEL);
  assert.ok(sIdx !== -1, "prompt deve conter a sentinela de cache");
  const idIdx = prompt.indexOf(ID_NEEDLE);
  const memIdx = prompt.indexOf(MEM_NEEDLE);
  assert.ok(idIdx !== -1 && idIdx < sIdx, "identidade deve estar ANTES da sentinela (prefixo)");
  assert.ok(memIdx !== -1 && memIdx > sIdx, "memória deve estar DEPOIS da sentinela (dinâmico)");
});

test("[cache] buildSystemMessages divide em 2 blocos com cache_control só no prefixo, sem vazar sentinela", async () => {
  const prompt = await buildCachePrompt();
  const msgs = buildSystemMessages(prompt);
  assert.equal(msgs.length, 1);
  const content = (msgs[0] as any).content;
  assert.ok(Array.isArray(content), "content deve ser array de blocos");
  assert.equal(content.length, 2, "deve haver prefixo + sufixo");
  assert.deepEqual(content[0].cache_control, { type: "ephemeral" }, "prefixo cacheável");
  assert.equal(content[1].cache_control, undefined, "sufixo não cacheado");
  for (const block of content) {
    assert.ok(!String(block.text).includes(CACHE_PREFIX_SENTINEL), "sentinela não deve vazar ao provedor");
  }
});

test("[cache] com flag OFF a sentinela é removida e vira string simples", () => {
  const prev = process.env.ECO_PROMPT_CACHE;
  process.env.ECO_PROMPT_CACHE = "0";
  try {
    const msgs = buildSystemMessages(`PREFIXO\n\n${CACHE_PREFIX_SENTINEL}\n\nSUFIXO`);
    assert.equal(typeof (msgs[0] as any).content, "string");
    assert.ok(!String((msgs[0] as any).content).includes(CACHE_PREFIX_SENTINEL));
  } finally {
    process.env.ECO_PROMPT_CACHE = prev;
  }
});
