import assert from "node:assert/strict";
import { test } from "node:test";

import montarContextoEco from "../../services/promptContext/ContextBuilder";
import { ModuleStore } from "../../services/promptContext/ModuleStore";

const inlineModules: Record<string, string> = {
  "NV1_CORE.txt": "Conteúdo NV1 core",
  "IDENTIDADE_MINI.txt": "Conteúdo identidade mini",
  "ANTISALDO_MIN.txt": "Conteúdo antissaldo mínimo",
  "ESCALA_ABERTURA_1a3.txt": "Conteúdo escala de abertura",
};

ModuleStore.configure([]);
for (const [name, content] of Object.entries(inlineModules)) {
  ModuleStore.registerInline(name, content);
}

const params = {
  userName: "Maria Clara Silva",
  texto: "Oi, tudo bem?",
  mems: [],
};

test("ContextBuilder inclui lembrete com o nome do usuário", async () => {
  const resultado = await montarContextoEco(params);
  const prompt = resultado.montarMensagemAtual(params.texto);
  assert.match(
    prompt,
    /Usuário se chama Maria; use o nome apenas quando fizer sentido\./
  );
});
