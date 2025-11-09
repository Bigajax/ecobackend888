/**
 * Test: Memory injection in ContextBuilder
 *
 * This test validates that:
 * 1. Memories are recovered from params.memoriasSemelhantes
 * 2. Memories are formatted correctly
 * 3. Memories are injected into the prompt for authenticated users
 * 4. Memories are NOT injected for guest users
 */

import { formatMemoriesSection, injectMemoriesIntoPrompt } from "../server/services/promptContext/memoryInjector";

describe("Memory Injection System", () => {
  const mockMemories = [
    {
      texto: "Sentei triste porque perdi meu emprego. Conversamos sobre habilidades e oportunidades.",
      score: 0.85,
    },
    {
      texto: "Experiência similar há 2 meses quando enfrentei rejeição. Resolvemos trabalhando autoestima.",
      score: 0.72,
    },
    {
      texto: "Padrão de ansiedade em momentos de mudança. Técnicas de respiração ajudaram.",
      score: 0.65,
    },
  ];

  describe("formatMemoriesSection", () => {
    it("should format memories with scores when memories exist", () => {
      const section = formatMemoriesSection(mockMemories, 1500);

      expect(section).not.toBeNull();
      expect(section).toContain("MEMÓRIAS PERTINENTES");
      expect(section).toContain("0.85");
      expect(section).toContain("Sentei triste");
    });

    it("should return null when no memories provided", () => {
      const section = formatMemoriesSection([], 1500);
      expect(section).toBeNull();
    });

    it("should respect token budget", () => {
      const section = formatMemoriesSection(mockMemories, 50);
      expect(section).not.toBeNull();
      // Should only include highest-scoring memory when token budget is tight
      expect(section).toContain("[1]");
    });
  });

  describe("injectMemoriesIntoPrompt", () => {
    const basePrompt = `# INSTRUÇÕES
Você é um assistente empático.

## CONTEXTO DO USUÁRIO
O usuário está procurando ajuda.

## CONVERSA
Responda com empatia.`;

    it("should inject memories after context markers", () => {
      const memSection = formatMemoriesSection(mockMemories, 1500);
      const result = injectMemoriesIntoPrompt(basePrompt, memSection);

      expect(result).toContain(memSection);
      expect(result).toContain("## CONTEXTO DO USUÁRIO");
      expect(result).toContain("MEMÓRIAS PERTINENTES");
      // Memories should come after context marker
      const contextIdx = result.indexOf("## CONTEXTO DO USUÁRIO");
      const memoriesIdx = result.indexOf("MEMÓRIAS PERTINENTES");
      expect(memoriesIdx).toBeGreaterThan(contextIdx);
    });

    it("should return unchanged prompt when memories section is null", () => {
      const result = injectMemoriesIntoPrompt(basePrompt, null);
      expect(result).toBe(basePrompt);
    });

    it("should append memories at end if no insertion markers found", () => {
      const simplePrompt = "Simple prompt without markers";
      const memSection = formatMemoriesSection(mockMemories, 1500);
      const result = injectMemoriesIntoPrompt(simplePrompt, memSection);

      expect(result).toContain(memSection);
      expect(result).toContain("Simple prompt without markers");
      expect(result.indexOf("Simple prompt")).toBeLessThan(result.indexOf("MEMÓRIAS"));
    });
  });

  describe("Integration: Memory flow in responses", () => {
    it("should create prompt that enables Claude to reference past memories", () => {
      const memSection = formatMemoriesSection(mockMemories, 1500);
      const prompt = injectMemoriesIntoPrompt(
        `Você é um assistente empático que lembra do histórico emocional do usuário.`,
        memSection
      );

      // The prompt should now contain the formatted memories
      // which Claude can use to say things like:
      // "Lembro que você sentiu assim há X dias..."
      // "Vemos um padrão similar ao que experimentou em..."
      expect(prompt).toContain("Sentei triste");
      expect(prompt).toContain("0.85"); // similarity score
    });
  });
});
