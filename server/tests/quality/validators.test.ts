import test from "node:test";
import assert from "node:assert/strict";

import {
  checkEstrutura,
  checkMemoria,
  checkBlocoTecnico,
  computeQ,
} from "../../services/quality/validators";

test("checkEstrutura aprova formato mínimo", () => {
  const texto = [
    "## 1. Espelho de segunda ordem",
    "Você está movendo energia para proteger algo importante.",
    "## 2. Insight ou padrão",
    "Uma hipótese é que mem_id:abc-123 aponta para um ciclo de cuidado.",
    "## 3. Convite prático",
    "- Experimente observar como o corpo reage quando esse medo aparece.",
    "## 4. Pergunta única",
    "O que muda se você notar o cuidado escondido aí?",
  ].join("\n");
  assert.equal(checkEstrutura(texto), true);
  assert.equal(checkEstrutura("Resposta solta"), false);
});

test("checkMemoria reconhece id e tag", () => {
  const texto = "Trago a memória mem_id:abc-123 e também a âncora #conexao.";
  const anchors = ["id:abc-123", "tag:conexao"];
  assert.equal(checkMemoria(texto, anchors), true);
  assert.equal(checkMemoria("Sem referência", anchors), false);
});

test("checkBlocoTecnico valida JSON e intensidade", () => {
  const raw = `Resposta\n{"emocao_principal":"alegria","analise_resumo":"Resumo","intensidade":8}`;
  assert.equal(checkBlocoTecnico(raw, 8), true);
  assert.equal(checkBlocoTecnico("Resposta sem bloco", 8), false);
  assert.equal(checkBlocoTecnico("Resposta sem bloco", 5), true);
});

test("computeQ calcula média simples", () => {
  const q = computeQ({ estruturado_ok: true, memoria_ok: false, bloco_ok: true });
  assert.equal(q, 0.6667);
});
