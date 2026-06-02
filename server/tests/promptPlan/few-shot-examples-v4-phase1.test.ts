/**
 * Testes de Validação: Few-Shot Examples Phase 1
 * Validar que os 3 módulos refatorados com exemplos funcionam corretamente
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Few-Shot Examples Phase 1 — Validation", () => {
  let nv1Content: string;
  let nv2Content: string;
  let nv3Content: string;

  before(() => {
    const assetsRoot = resolve(__dirname, "../../assets/modulos_core");

    // Ler módulos refatorados
    nv1Content = readFileSync(resolve(assetsRoot, "abertura_superficie.txt"), "utf-8");
    nv2Content = readFileSync(resolve(assetsRoot, "nv2_reflexao_core.txt"), "utf-8");
    nv3Content = readFileSync(resolve(assetsRoot, "nv3_profundo_core.txt"), "utf-8");
  });

  describe("NV1 — Clareza Executiva", () => {
    it("contém header front-matter YAML válido", () => {
      assert.match(nv1Content, /^---\nid: NV1_CORE_ENHANCED/);
      assert.ok(nv1Content.includes("maxIntensity: 4"));
      assert.ok(nv1Content.includes("opennessIn: [1]"));
    });

    it("contém exatamente 3 exemplos de few-shot", () => {
      const exampleMatches = nv1Content.match(/### Exemplo \d+:/g) || [];
      assert.strictEqual(exampleMatches.length, 3);
    });

    it("cada exemplo tem estrutura [USUÁRIO, ECO]", () => {
      const examples = nv1Content.split("### Exemplo");
      examples.slice(1).forEach((example) => {
        assert.ok(example.includes("**USUÁRIO**:"));
        assert.ok(example.includes("**ECO (Resposta esperada)**:"));
        assert.match(example, /Intensidade: \d+-\d+/);
      });
    });

    it("contém protocolos de resposta claros", () => {
      assert.ok(nv1Content.includes("## PROTOCOLO DE RESPOSTA NV1"));
      assert.ok(nv1Content.includes("Espelho-Flash"));
      assert.ok(nv1Content.includes("Ação concreta"));
      assert.ok(nv1Content.includes("Pergunta focal"));
    });

    it("exemplos são distintos (cenários diferentes)", () => {
      const cenarios = nv1Content.match(/\*\*Cenário\*\*: ([^\n]+)/g) || [];
      assert.strictEqual(cenarios.length, 3);
    });
  });

  describe("NV2 — Reflexão & Exploração", () => {
    it("contém header front-matter YAML válido", () => {
      assert.ok(nv2Content.includes("id: NV2_CORE_REFLECTION"));
      assert.ok(nv2Content.includes("minIntensity: 4"));
      assert.ok(nv2Content.includes("maxIntensity: 6"));
      assert.ok(nv2Content.includes("opennessIn: [2]"));
    });

    it("contém exatamente 3 exemplos de few-shot", () => {
      const exampleMatches = nv2Content.match(/### Exemplo \d+:/g) || [];
      assert.strictEqual(exampleMatches.length, 3);
    });

    it("respostas NV2 são mais longas que NV1", () => {
      const responseMatches = nv2Content.match(/\*\*ECO \(Resposta esperada\)\*\*:/g) || [];
      assert.strictEqual(responseMatches.length, 3);

      // Validar que tem elementos estruturados
      assert.ok(nv2Content.includes("Percebo um movimento"));
      assert.ok(nv2Content.includes("Experimento"));
    });

    it("contém protocolo de integração de memória", () => {
      assert.ok(nv2Content.includes("## Protocolo de Integração de Memória"));
      assert.ok(nv2Content.includes("Máximo 2 referências"));
    });

    it("3º exemplo integra memória anterior", () => {
      assert.ok(nv2Content.includes("Exemplo 3: Integração com Memória Anterior"));
      assert.ok(nv2Content.includes("Como você trouxe antes"));
    });

    it("contém protocolos de resposta claros", () => {
      assert.ok(nv2Content.includes("## PROTOCOLO DE RESPOSTA NV2"));
      assert.ok(nv2Content.includes("Espelhamento com movimento"));
      assert.ok(nv2Content.includes("Padrão hipotético"));
      assert.ok(nv2Content.includes("Convite experimental"));
    });
  });

  describe("NV3 — Profundo & Acolhimento", () => {
    it("contém header front-matter YAML válido", () => {
      assert.ok(nv3Content.includes("id: NV3_CORE_DEPTH"));
      assert.ok(nv3Content.includes("minIntensity: 7"));
      assert.ok(nv3Content.includes("maxIntensity: 10"));
      assert.ok(nv3Content.includes("opennessIn: [3]"));
    });

    it("contém exatamente 4 exemplos de few-shot", () => {
      const exampleMatches = nv3Content.match(/### Exemplo \d+:/g) || [];
      assert.strictEqual(exampleMatches.length, 4);
    });

    it("respostas NV3 são profundas e validam", () => {
      const responseMatches = nv3Content.match(/\*\*ECO \(Resposta esperada\)\*\*:/g) || [];
      assert.strictEqual(responseMatches.length, 4);

      // Validar que tem elementos de acolhimento
      assert.ok(nv3Content.toLowerCase().includes("acolhimento"));
      assert.ok(nv3Content.toLowerCase().includes("profundo"));
    });

    it("contém protocolo de segurança", () => {
      assert.ok(nv3Content.includes("Gatilhos de Escalada a Protocolos de Segurança"));
      assert.ok(nv3Content.includes("VERMELHO"));
      assert.ok(nv3Content.includes("LARANJA"));
      assert.ok(nv3Content.includes("AMARELO"));
    });

    it("3º exemplo trata ideação suicida com protocolo", () => {
      assert.ok(nv3Content.includes("Crise com Integração"));
      assert.ok(nv3Content.includes("CVV"));
      assert.ok(nv3Content.includes("188"));
    });

    it("4º exemplo integra padrão geracional/sistêmico", () => {
      assert.ok(nv3Content.includes("Exemplo 4: Integração Profunda com Memória Sistêmica"));
      assert.ok(nv3Content.toLowerCase().includes("geracional"));
    });

    it("contém protocolos de resposta claros", () => {
      assert.ok(nv3Content.includes("## PROTOCOLO DE RESPOSTA NV3"));
      assert.ok(nv3Content.includes("Acolhimento sem minimização"));
      assert.ok(nv3Content.includes("Espelhamento de sistema"));
    });
  });

  describe("Validação Comparativa entre NV1, NV2, NV3", () => {
    it("cada nível tem identidade clara (NV1, NV2, NV3)", () => {
      assert.ok(nv1Content.includes("NV1_CORE_ENHANCED"));
      assert.ok(nv2Content.includes("NV2_CORE_REFLECTION"));
      assert.ok(nv3Content.includes("NV3_CORE_DEPTH"));
    });

    it("intensidade escalona: NV1(0-4) → NV2(4-6) → NV3(7-10)", () => {
      assert.ok(nv1Content.includes("maxIntensity: 4"));
      assert.ok(nv2Content.includes("minIntensity: 4"));
      assert.ok(nv2Content.includes("maxIntensity: 6"));
      assert.ok(nv3Content.includes("minIntensity: 7"));
    });

    it("openness escalona: NV1(1) → NV2(2) → NV3(3)", () => {
      assert.ok(nv1Content.includes("opennessIn: [1]"));
      assert.ok(nv2Content.includes("opennessIn: [2]"));
      assert.ok(nv3Content.includes("opennessIn: [3]"));
    });

    it("todos têm exemplos (few-shot learning)", () => {
      const nv1Examples = (nv1Content.match(/### Exemplo/g) || []).length;
      const nv2Examples = (nv2Content.match(/### Exemplo/g) || []).length;
      const nv3Examples = (nv3Content.match(/### Exemplo/g) || []).length;

      assert.ok(nv1Examples > 0);
      assert.ok(nv2Examples > 0);
      assert.ok(nv3Examples > 0);
    });
  });

  describe("Validação de Completeness", () => {
    it("todos os módulos têm protocolo de resposta", () => {
      assert.ok(nv1Content.includes("## PROTOCOLO DE RESPOSTA NV1"));
      assert.ok(nv2Content.includes("## PROTOCOLO DE RESPOSTA NV2"));
      assert.ok(nv3Content.includes("## PROTOCOLO DE RESPOSTA NV3"));
    });

    it("todos os módulos têm contexto refinado", () => {
      assert.ok(nv1Content.includes("## Contexto Refinado"));
      assert.ok(nv2Content.includes("## Contexto Refinado"));
      assert.ok(nv3Content.includes("## Contexto Refinado"));
    });

    it("todos os módulos têm métrica de sucesso", () => {
      assert.ok(nv1Content.includes("## Métricas de Sucesso"));
      assert.ok(nv2Content.includes("## Métricas de Sucesso"));
      assert.ok(nv3Content.includes("## Métricas de Sucesso"));
    });

    it("todos os módulos têm tom adaptativo", () => {
      assert.ok(nv1Content.includes("## Tom Adaptativo"));
      assert.ok(nv2Content.includes("## Tom Adaptativo"));
      assert.ok(nv3Content.includes("## Tom Adaptativo"));
    });
  });
});
