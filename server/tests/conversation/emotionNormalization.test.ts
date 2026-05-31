import test from "node:test";
import assert from "node:assert/strict";

import { resolveEmotion } from "../../services/emotionNormalization";
import { buildStreamingMetaPayload } from "../../services/conversation/responseMetadata";

test("resolveEmotion rejeita 'neutro'/'neutra' → Indefinida", () => {
  assert.strictEqual(resolveEmotion("neutro"), "Indefinida");
  assert.strictEqual(resolveEmotion("Neutro"), "Indefinida");
  assert.strictEqual(resolveEmotion("neutra"), "Indefinida");
  assert.strictEqual(resolveEmotion("NEUTRA"), "Indefinida");
});

test("resolveEmotion normaliza sinônimos para a taxonomia canônica", () => {
  assert.strictEqual(resolveEmotion("ansioso"), "Ansiedade");
  assert.strictEqual(resolveEmotion("angustiado"), "Ansiedade");
  assert.strictEqual(resolveEmotion("feliz"), "Alegria");
  assert.strictEqual(resolveEmotion("medo de falhar"), "Medo");
});

test("resolveEmotion cai para tags quando a emoção primária é vazia/indefinida", () => {
  assert.strictEqual(resolveEmotion("", ["raiva"]), "Raiva");
  assert.strictEqual(resolveEmotion("indefinida", ["solidao"]), "Solidão");
  assert.strictEqual(resolveEmotion(null), "Indefinida");
});

test("buildStreamingMetaPayload nunca persiste 'neutro' como emoção", () => {
  const payload = buildStreamingMetaPayload(
    {
      intensidade: 8,
      analise_resumo: "Resumo significativo",
      emocao_principal: "Neutro",
      categoria: "trabalho",
      tags: ["pressao", "prazo"],
    },
    "fallback"
  );

  assert.ok(payload, "payload deve ser gerado para intensidade >= 7");
  assert.strictEqual(payload?.emocao, "Indefinida");
});

test("buildStreamingMetaPayload normaliza emoção válida do modelo", () => {
  const payload = buildStreamingMetaPayload(
    {
      intensidade: 9,
      analise_resumo: "Resumo",
      emocao_principal: "ansioso",
      categoria: "saude",
      tags: ["sono"],
    },
    "fallback"
  );

  assert.strictEqual(payload?.emocao, "Ansiedade");
});

test("buildStreamingMetaPayload mantém o gate: sem emoção do modelo → null", () => {
  const payload = buildStreamingMetaPayload(
    {
      intensidade: 8,
      analise_resumo: "Resumo",
      emocao_principal: "   ",
      categoria: "saude",
      tags: ["sono"],
    },
    "fallback"
  );

  assert.strictEqual(payload, null);
});
