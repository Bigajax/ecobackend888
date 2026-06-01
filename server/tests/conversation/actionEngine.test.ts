import test from "node:test";
import assert from "node:assert/strict";

import {
  decideAcaoRecomendada,
  __resetCooldownStore,
} from "../../services/conversation/actionEngine";

test("ansiedade/ativação → meditacao", () => {
  const acao = decideAcaoRecomendada({ texto: "estou muito ansioso", intensidade: 6, openness: 2 });
  assert.equal(acao?.tipo, "meditacao");
});

test("sono/insônia → sono", () => {
  const acao = decideAcaoRecomendada({ texto: "não consigo dormir há dias", intensidade: 5, openness: 1 });
  assert.equal(acao?.tipo, "sono");
});

test("autocobrança → estoicismo", () => {
  const acao = decideAcaoRecomendada({ texto: "eu me cobro demais o tempo todo", intensidade: 5, openness: 2 });
  assert.equal(acao?.tipo, "estoicismo");
});

test("autocrítica via flag → estoicismo", () => {
  const acao = decideAcaoRecomendada({
    texto: "falhei de novo",
    intensidade: 6,
    openness: 2,
    flags: { autocritica: true },
  });
  assert.equal(acao?.tipo, "estoicismo");
});

test("confusão → diario", () => {
  const acao = decideAcaoRecomendada({ texto: "não sei o que fazer da minha vida", intensidade: 4, openness: 2 });
  assert.equal(acao?.tipo, "diario");
});

test("tema recorrente → relatorio", () => {
  const acao = decideAcaoRecomendada({
    texto: "tudo certo por aqui hoje",
    intensidade: 3,
    openness: 1,
    temaRecorrente: { tema: "autocobrança", freq: 15 },
  });
  assert.equal(acao?.tipo, "relatorio");
});

test("crise → null (segurança, mesmo com ativação)", () => {
  const acao = decideAcaoRecomendada({
    texto: "estou muito ansioso e não aguento mais",
    intensidade: 9,
    openness: 3,
    flags: { crise: true, emocao_alta_linguagem: true },
  });
  assert.equal(acao, null);
});

test("sem gatilho claro → null (conservador)", () => {
  const acao = decideAcaoRecomendada({ texto: "que horas são?", intensidade: 1, openness: 1 });
  assert.equal(acao, null);
});

test("catastrofização via flag → estoicismo", () => {
  const acao = decideAcaoRecomendada({
    texto: "vai dar tudo errado, sempre dá",
    intensidade: 6,
    openness: 2,
    flags: { catastrofizacao: true },
  });
  assert.equal(acao?.tipo, "estoicismo");
});

test("desabafo via flag → diario", () => {
  const acao = decideAcaoRecomendada({
    texto: "só precisava colocar isso pra fora hoje",
    intensidade: 4,
    openness: 2,
    flags: { desabafo: true },
  });
  assert.equal(acao?.tipo, "diario");
});

test("segurança granular: ideação → null (mesmo com sono no texto)", () => {
  const acao = decideAcaoRecomendada({
    texto: "não consigo dormir e queria sumir",
    intensidade: 9,
    openness: 3,
    flags: { ideacao: true },
  });
  assert.equal(acao, null);
});

test("prioridade: sono > meditação quando ambos disparam", () => {
  const acao = decideAcaoRecomendada({
    texto: "estou ansioso e não consigo dormir",
    intensidade: 6,
    openness: 2,
  });
  assert.equal(acao?.tipo, "sono");
});

test("anti-repetição: mesma ação não repete dentro do cooldown", () => {
  __resetCooldownStore();
  const now = 1_000_000;
  const input = {
    texto: "não consigo dormir",
    intensidade: 5,
    openness: 1 as const,
    usuarioId: "user-1",
    agoraMs: now,
  };
  const primeira = decideAcaoRecomendada(input);
  assert.equal(primeira?.tipo, "sono");
  // Mesmo gatilho, poucos minutos depois → suprimido (sem outro candidato).
  const segunda = decideAcaoRecomendada({ ...input, agoraMs: now + 60_000 });
  assert.equal(segunda, null);
});

test("anti-repetição: cai para o próximo candidato disponível", () => {
  __resetCooldownStore();
  const now = 2_000_000;
  // Sono recém-mostrado; novo turno traz sono+meditação → deve escolher meditação.
  decideAcaoRecomendada({
    texto: "não consigo dormir",
    intensidade: 5,
    openness: 1,
    usuarioId: "user-2",
    agoraMs: now,
  });
  const acao = decideAcaoRecomendada({
    texto: "não consigo dormir de tão ansioso",
    intensidade: 6,
    openness: 2,
    usuarioId: "user-2",
    agoraMs: now + 60_000,
  });
  assert.equal(acao?.tipo, "meditacao");
});

test("sem usuarioId não há cooldown (comportamento puro)", () => {
  __resetCooldownStore();
  const input = { texto: "não consigo dormir", intensidade: 5, openness: 1 as const };
  assert.equal(decideAcaoRecomendada(input)?.tipo, "sono");
  assert.equal(decideAcaoRecomendada(input)?.tipo, "sono");
});
