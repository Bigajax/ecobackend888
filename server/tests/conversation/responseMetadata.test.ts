import test from "node:test";
import assert from "node:assert/strict";

import { buildFinalizedStreamText } from "../../services/conversation/responseMetadata";
import { extractJson } from "../../utils/text";

test("buildFinalizedStreamText adiciona bloco JSON com metadados completos", () => {
  const texto = buildFinalizedStreamText({
    message: "Oi! Aqui vai um resumo.",
    intensidade: 0.75,
    resumo: "Resumo sintético",
    emocao: "alegria",
    categoria: "apoio",
    tags: ["apoio", "escuta"],
  });

  assert.ok(texto.includes("```json"), "deve incluir bloco JSON");

  const payload = extractJson<Record<string, any>>(texto);
  assert.ok(payload, "bloco JSON deve ser parseável");
  assert.strictEqual(payload?.intensidade, 0.75);
  assert.strictEqual(payload?.resumo, "Resumo sintético");
  assert.strictEqual(payload?.emocao, "alegria");
  assert.strictEqual(payload?.categoria, "apoio");
  assert.deepStrictEqual(payload?.tags, ["apoio", "escuta"]);
});

test("buildFinalizedStreamText evita duplicar bloco quando já presente", () => {
  const bloco = {
    intensidade: 0.4,
    resumo: "Resumo existente",
    emocao: "neutra",
    categoria: "info",
    tags: ["tag"],
  };
  const blocoJson = JSON.stringify(bloco, null, 2);
  const mensagem = "Mensagem base.\n\n```json\n" + blocoJson + "\n```";

  const resultado = buildFinalizedStreamText({
    message: mensagem,
    intensidade: bloco.intensidade,
    resumo: bloco.resumo,
    emocao: bloco.emocao,
    categoria: bloco.categoria,
    tags: bloco.tags,
  });

  const ocorrencias = resultado.match(/```json/gi)?.length ?? 0;
  assert.strictEqual(ocorrencias, 1, "deve manter somente um bloco JSON");
});

test("buildFinalizedStreamText não adiciona bloco sem metadados completos", () => {
  const texto = buildFinalizedStreamText({
    message: "Olá!", 
    intensidade: undefined,
    resumo: undefined,
    emocao: undefined,
    categoria: null,
    tags: [],
  });

  assert.strictEqual(texto, "Olá!", "sem metadados suficientes, mensagem permanece igual");
});
