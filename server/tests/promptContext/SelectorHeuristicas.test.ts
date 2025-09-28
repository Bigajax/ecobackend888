import assert from "node:assert/strict";
import test from "node:test";

import { Selector } from "../../services/promptContext/Selector";
import { mapHeuristicasToFlags } from "../../services/promptContext/heuristicaFlags";

test("inclui módulo de ancoragem quando heurística correspondente é detectada", () => {
  const heuristicas = [
    { arquivo: "eco_heuristica_ancoragem.txt", similarity: 0.91, tags: ["ancoragem"] },
  ];

  const heuristicaFlags = mapHeuristicasToFlags(heuristicas);
  const flags = Selector.derivarFlags("Texto neutro sem pedido prático.", heuristicaFlags);
  const resultado = Selector.selecionarModulosBase({
    nivel: 2,
    intensidade: 5,
    flags,
  });

  assert.ok(
    resultado.posGating.includes("eco_heuristica_ancoragem.txt"),
    "deveria ativar o módulo de ancoragem"
  );
});

test("inclui módulo de certeza emocional quando flag derivada por tags é verdadeira", () => {
  const heuristicas = [
    { id: "abc", tags: ["certeza_emocional", "conviccao_rapida"] },
  ];

  const heuristicaFlags = mapHeuristicasToFlags(heuristicas);
  const flags = Selector.derivarFlags("Mensagem reflexiva sem pedidos.", heuristicaFlags);
  const resultado = Selector.selecionarModulosBase({
    nivel: 3,
    intensidade: 6,
    flags,
  });

  assert.ok(
    resultado.posGating.includes("eco_heuristica_certeza_emocional.txt"),
    "deveria ativar o módulo de certeza emocional"
  );
});

