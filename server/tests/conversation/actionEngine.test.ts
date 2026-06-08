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

test("estresse do dia → liberar_estresse (não meditacao)", () => {
  const acao = decideAcaoRecomendada({ texto: "que dia estressante, não aguento mais", intensidade: 5, openness: 2 });
  assert.equal(acao?.id, "liberar_estresse");
  assert.equal(acao?.kind, "meditacao");
});

test("ansiedade aguda continua → meditacao", () => {
  const acao = decideAcaoRecomendada({ texto: "meu coração está disparado, panico", intensidade: 7, openness: 2 });
  assert.equal(acao?.id, "meditacao");
});

test("pedido explícito de meditar → meditacao", () => {
  const acao = decideAcaoRecomendada({ texto: "quero meditar mas não sei como começar", intensidade: 3, openness: 2 });
  assert.equal(acao?.id, "meditacao");
});

test("pergunta 'tem alguma meditação?' → meditacao", () => {
  const acao = decideAcaoRecomendada({ texto: "tem alguma meditação aqui pra eu fazer?", intensidade: 2, openness: 2 });
  assert.equal(acao?.id, "meditacao");
});

test("foco/concentração → meditacao", () => {
  const acao = decideAcaoRecomendada({ texto: "não consigo focar, vivo disperso", intensidade: 3, openness: 2 });
  assert.equal(acao?.id, "meditacao");
});

test("preocupação difusa → meditacao", () => {
  const acao = decideAcaoRecomendada({ texto: "estou preocupado e inquieto com tudo", intensidade: 5, openness: 2 });
  assert.equal(acao?.id, "meditacao");
});

test("procrastinação/constância → aneis", () => {
  const acao = decideAcaoRecomendada({ texto: "começo as coisas e sempre desisto, não tenho constância", intensidade: 4, openness: 2 });
  assert.equal(acao?.id, "aneis");
});

test("dinheiro/escassez → riqueza_mental", () => {
  const acao = decideAcaoRecomendada({ texto: "estou sem dinheiro e com contas pra pagar", intensidade: 5, openness: 2 });
  assert.equal(acao?.id, "riqueza_mental");
});

test("desânimo/energia baixa → energy_blessings", () => {
  const acao = decideAcaoRecomendada({ texto: "acordo esgotado, sem ânimo e sem vontade de nada", intensidade: 4, openness: 2 });
  assert.equal(acao?.id, "energy_blessings");
});

test("crise bloqueia os novos gatilhos também", () => {
  const acao = decideAcaoRecomendada({ texto: "sem dinheiro e sem vontade de viver", intensidade: 9, openness: 3, flags: { ideacao: true } });
  assert.equal(acao, null);
});

// ── "Sugerir conteúdo" (botão da home): PERGUNTA O TEMA PRIMEIRO ───────────────
// Decisão de produto: o gatilho PURO do botão NÃO emite card no turno 1 — a Eco pergunta a
// área e o card vem no turno seguinte, já com o tema. Só quando o pedido vem acompanhado de
// sinal topical no texto (ou tema recorrente forte) é que o card aparece junto.

test("sugerir conteúdo puro (sem tema) → null (pergunta a área primeiro)", () => {
  __resetCooldownStore();
  const acao = decideAcaoRecomendada({ texto: "Sugerir conteúdo", intensidade: 1, openness: 1 });
  assert.equal(acao, null);
});

test("sugerir conteúdo puro + perfil → null (perfil não força card no turno 1)", () => {
  __resetCooldownStore();
  const acao = decideAcaoRecomendada({
    texto: "Sugerir conteúdo",
    intensidade: 2,
    openness: 2,
    topTemas: [{ tema: "sono", freq: 9 }],
  });
  assert.equal(acao, null);
});

test("pedido de sugestão COM tema no texto → card do tema", () => {
  __resetCooldownStore();
  const acao = decideAcaoRecomendada({
    texto: "me recomenda algo pra dormir",
    intensidade: 3,
    openness: 2,
  });
  assert.equal(acao?.id, "sono");
});

test("sugerir conteúdo em crise → null (segurança vence)", () => {
  const acao = decideAcaoRecomendada({
    texto: "Sugerir conteúdo",
    intensidade: 8,
    openness: 3,
    flags: { ideacao: true },
    topTemas: [{ tema: "dinheiro", freq: 8 }],
  });
  assert.equal(acao, null);
});

test("sugerir conteúdo com tema recorrente forte → personaliza acima do relatório", () => {
  __resetCooldownStore();
  const acao = decideAcaoRecomendada({
    texto: "Sugerir conteúdo",
    intensidade: 2,
    openness: 2,
    temaRecorrente: { tema: "dinheiro", freq: 20 }, // gera candidato relatorio (prio 60)
    topTemas: [{ tema: "dinheiro", freq: 20, intensidade: 5 }],
  });
  assert.equal(acao?.id, "riqueza_mental"); // personalizado (75) > relatorio (60)
});

test("pedido de sugestão COM tema sempre devolve algo (ignora cooldown)", () => {
  __resetCooldownStore();
  const base = {
    texto: "me recomenda algo pra dormir",
    intensidade: 2,
    openness: 2 as const,
    usuarioId: "user-sug",
    topTemas: [{ tema: "sono", freq: 9 }],
  };
  const a = decideAcaoRecomendada({ ...base, agoraMs: 5_000_000 });
  assert.equal(a?.id, "sono");
  const b = decideAcaoRecomendada({ ...base, agoraMs: 5_000_000 + 60_000 });
  assert.equal(b?.id, "sono"); // explícito → ainda devolve, mesmo recém-sugerido
});
