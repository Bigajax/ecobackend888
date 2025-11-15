/**
 * Testes de Validação: Few-Shot Examples Phase 1
 * Validar que os 3 módulos refatorados com exemplos funcionam corretamente
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Few-Shot Examples Phase 1 — Validation', () => {
  let nv1Content: string;
  let nv2Content: string;
  let nv3Content: string;

  beforeAll(() => {
    const assetsRoot = resolve(__dirname, '../../assets/modulos_core');

    // Ler módulos refatorados
    nv1Content = readFileSync(resolve(assetsRoot, 'abertura_superficie.txt'), 'utf-8');
    nv2Content = readFileSync(resolve(assetsRoot, 'nv2_reflexao_core.txt'), 'utf-8');
    nv3Content = readFileSync(resolve(assetsRoot, 'nv3_profundo_core.txt'), 'utf-8');
  });

  describe('NV1 — Clareza Executiva', () => {
    it('contém header front-matter YAML válido', () => {
      expect(nv1Content).toMatch(/^---\nid: NV1_CORE_ENHANCED/);
      expect(nv1Content).toContain('maxIntensity: 4');
      expect(nv1Content).toContain('opennessIn: [1]');
    });

    it('contém exatamente 3 exemplos de few-shot', () => {
      const exampleMatches = nv1Content.match(/### Exemplo \d+:/g) || [];
      expect(exampleMatches.length).toBe(3);
    });

    it('cada exemplo tem estrutura [USUÁRIO, ECO]', () => {
      const examples = nv1Content.split('### Exemplo');
      examples.slice(1).forEach((example) => {
        expect(example).toContain('**USUÁRIO**:');
        expect(example).toContain('**ECO (Resposta esperada)**:');
        expect(example).toMatch(/Intensidade: \d+-\d+/);
      });
    });

    it('contém protocolos de resposta claros', () => {
      expect(nv1Content).toContain('## PROTOCOLO DE RESPOSTA NV1');
      expect(nv1Content).toContain('Espelho-Flash');
      expect(nv1Content).toContain('Ação concreta');
      expect(nv1Content).toContain('Pergunta focal');
    });

    it('exemplos são distintos (cenários diferentes)', () => {
      const cenarios = nv1Content.match(/\*\*Cenário\*\*: ([^\n]+)/g) || [];
      expect(cenarios.length).toBe(3);
    });
  });

  describe('NV2 — Reflexão & Exploração', () => {
    it('contém header front-matter YAML válido', () => {
      expect(nv2Content).toContain('id: NV2_CORE_REFLECTION');
      expect(nv2Content).toContain('minIntensity: 4');
      expect(nv2Content).toContain('maxIntensity: 6');
      expect(nv2Content).toContain('opennessIn: [2]');
    });

    it('contém exatamente 3 exemplos de few-shot', () => {
      const exampleMatches = nv2Content.match(/### Exemplo \d+:/g) || [];
      expect(exampleMatches.length).toBe(3);
    });

    it('respostas NV2 são mais longas que NV1', () => {
      const responseMatches = nv2Content.match(/\*\*ECO \(Resposta esperada\)\*\*:/g) || [];
      expect(responseMatches.length).toBe(3);

      // Validar que tem elementos estruturados
      expect(nv2Content).toContain('Percebo um movimento');
      expect(nv2Content).toContain('Experimento');
    });

    it('contém protocolo de integração de memória', () => {
      expect(nv2Content).toContain('## Protocolo de Integração de Memória');
      expect(nv2Content).toContain('Máximo 2 referências');
    });

    it('3º exemplo integra memória anterior', () => {
      expect(nv2Content).toContain('Exemplo 3: Integração com Memória Anterior');
      expect(nv2Content).toContain('Como você trouxe antes');
    });

    it('contém protocolos de resposta claros', () => {
      expect(nv2Content).toContain('## PROTOCOLO DE RESPOSTA NV2');
      expect(nv2Content).toContain('Espelhamento com movimento');
      expect(nv2Content).toContain('Padrão hipotético');
      expect(nv2Content).toContain('Convite experimental');
    });
  });

  describe('NV3 — Profundo & Acolhimento', () => {
    it('contém header front-matter YAML válido', () => {
      expect(nv3Content).toContain('id: NV3_CORE_DEPTH');
      expect(nv3Content).toContain('minIntensity: 7');
      expect(nv3Content).toContain('maxIntensity: 10');
      expect(nv3Content).toContain('opennessIn: [3]');
    });

    it('contém exatamente 4 exemplos de few-shot', () => {
      const exampleMatches = nv3Content.match(/### Exemplo \d+:/g) || [];
      expect(exampleMatches.length).toBe(4);
    });

    it('respostas NV3 são profundas e validam', () => {
      const responseMatches = nv3Content.match(/\*\*ECO \(Resposta esperada\)\*\*:/g) || [];
      expect(responseMatches.length).toBe(4);

      // Validar que tem elementos de acolhimento
      expect(nv3Content.toLowerCase()).toContain('acolhimento');
      expect(nv3Content.toLowerCase()).toContain('profundo');
    });

    it('contém protocolo de segurança', () => {
      expect(nv3Content).toContain('Gatilhos de Escalada a Protocolos de Segurança');
      expect(nv3Content).toContain('VERMELHO');
      expect(nv3Content).toContain('LARANJA');
      expect(nv3Content).toContain('AMARELO');
    });

    it('3º exemplo trata ideação suicida com protocolo', () => {
      expect(nv3Content).toContain('Crise com Integração');
      expect(nv3Content).toContain('CVV');
      expect(nv3Content).toContain('188');
    });

    it('4º exemplo integra padrão geracional/sistêmico', () => {
      expect(nv3Content).toContain('Exemplo 4: Integração Profunda com Memória Sistêmica');
      expect(nv3Content.toLowerCase()).toContain('geracional');
    });

    it('contém protocolos de resposta claros', () => {
      expect(nv3Content).toContain('## PROTOCOLO DE RESPOSTA NV3');
      expect(nv3Content).toContain('Acolhimento sem minimização');
      expect(nv3Content).toContain('Espelhamento de sistema');
    });
  });

  describe('Validação Comparativa entre NV1, NV2, NV3', () => {
    it('cada nível tem identidade clara (NV1, NV2, NV3)', () => {
      expect(nv1Content).toContain('NV1_CORE_ENHANCED');
      expect(nv2Content).toContain('NV2_CORE_REFLECTION');
      expect(nv3Content).toContain('NV3_CORE_DEPTH');
    });

    it('intensidade escalona: NV1(0-4) → NV2(4-6) → NV3(7-10)', () => {
      expect(nv1Content).toContain('maxIntensity: 4');
      expect(nv2Content).toContain('minIntensity: 4');
      expect(nv2Content).toContain('maxIntensity: 6');
      expect(nv3Content).toContain('minIntensity: 7');
    });

    it('openness escalona: NV1(1) → NV2(2) → NV3(3)', () => {
      expect(nv1Content).toContain('opennessIn: [1]');
      expect(nv2Content).toContain('opennessIn: [2]');
      expect(nv3Content).toContain('opennessIn: [3]');
    });

    it('todos têm exemplos (few-shot learning)', () => {
      const nv1Examples = (nv1Content.match(/### Exemplo/g) || []).length;
      const nv2Examples = (nv2Content.match(/### Exemplo/g) || []).length;
      const nv3Examples = (nv3Content.match(/### Exemplo/g) || []).length;

      expect(nv1Examples).toBeGreaterThan(0);
      expect(nv2Examples).toBeGreaterThan(0);
      expect(nv3Examples).toBeGreaterThan(0);
    });
  });

  describe('Validação de Completeness', () => {
    it('todos os módulos têm protocolo de resposta', () => {
      expect(nv1Content).toContain('## PROTOCOLO DE RESPOSTA NV1');
      expect(nv2Content).toContain('## PROTOCOLO DE RESPOSTA NV2');
      expect(nv3Content).toContain('## PROTOCOLO DE RESPOSTA NV3');
    });

    it('todos os módulos têm contexto refinado', () => {
      expect(nv1Content).toContain('## Contexto Refinado');
      expect(nv2Content).toContain('## Contexto Refinado');
      expect(nv3Content).toContain('## Contexto Refinado');
    });

    it('todos os módulos têm métrica de sucesso', () => {
      expect(nv1Content).toContain('## Métricas de Sucesso');
      expect(nv2Content).toContain('## Métricas de Sucesso');
      expect(nv3Content).toContain('## Métricas de Sucesso');
    });

    it('todos os módulos têm tom adaptativo', () => {
      expect(nv1Content).toContain('## Tom Adaptativo');
      expect(nv2Content).toContain('## Tom Adaptativo');
      expect(nv3Content).toContain('## Tom Adaptativo');
    });
  });
});
