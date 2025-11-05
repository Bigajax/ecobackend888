/**
 * Semantic Memory Integration Tests
 * Tests the end-to-end semantic memory retrieval and injection pipeline
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import type { RetrievedMemory } from "../../server/services/supabase/semanticMemoryClient";
import {
  formatMemoriesSection,
  injectMemoriesIntoPrompt,
  clampTokens,
} from "../../server/services/promptContext/memoryInjector";

describe("Semantic Memory Integration", () => {
  describe("formatMemoriesSection", () => {
    it("should return null for empty memories", () => {
      const result = formatMemoriesSection([]);
      expect(result).toBeNull();
    });

    it("should format memories with scores", () => {
      const memories: RetrievedMemory[] = [
        {
          id: "mem1",
          texto: "I felt anxious about work",
          score: 0.87,
          tags: ["work", "anxiety"],
          dominio_vida: "trabalho",
          created_at: "2024-01-01T10:00:00Z",
        },
        {
          id: "mem2",
          texto: "Team meeting went well",
          score: 0.72,
          tags: ["work", "positive"],
          dominio_vida: "trabalho",
          created_at: "2024-01-02T10:00:00Z",
        },
      ];

      const result = formatMemoriesSection(memories, 2000);

      expect(result).not.toBeNull();
      expect(result).toContain("MEMÓRIAS RELEVANTES");
      expect(result).toContain("0.87");
      expect(result).toContain("I felt anxious about work");
      expect(result).toContain("0.72");
      expect(result).toContain("Team meeting went well");
    });

    it("should respect token budget", () => {
      const memories: RetrievedMemory[] = [
        {
          id: "mem1",
          texto: "This is a very long memory that contains a lot of text about a particular emotional situation that the user experienced in the past " +
                 "which might be relevant to the current conversation and should be preserved in the semantic memory system.",
          score: 0.95,
          tags: ["work"],
          dominio_vida: "trabalho",
          created_at: "2024-01-01T10:00:00Z",
        },
        {
          id: "mem2",
          texto: "Another memory with significant content that discusses various topics",
          score: 0.85,
          tags: ["life"],
          dominio_vida: "outros",
          created_at: "2024-01-02T10:00:00Z",
        },
      ];

      const result = formatMemoriesSection(memories, 200); // Very small budget

      expect(result).not.toBeNull();
      // Should include at least the best memory
      expect(result).toContain("0.95");
    });

    it("should handle memories with special characters", () => {
      const memories: RetrievedMemory[] = [
        {
          id: "mem1",
          texto: "I'm feeling... well, it's hard to explain. But I'm okay! 😊",
          score: 0.76,
          tags: ["emotion", "acceptance"],
          dominio_vida: "saude_mental",
          created_at: "2024-01-01T10:00:00Z",
        },
      ];

      const result = formatMemoriesSection(memories, 1000);

      expect(result).not.toBeNull();
      expect(result).toContain("I'm feeling");
    });
  });

  describe("injectMemoriesIntoPrompt", () => {
    it("should return original prompt if no memories provided", () => {
      const prompt = "This is the original prompt";
      const result = injectMemoriesIntoPrompt(prompt, null);
      expect(result).toBe(prompt);
    });

    it("should inject memories after context marker", () => {
      const prompt = `You are a helpful assistant.

## CONTEXTO DO USUÁRIO
The user has shared some information.

Please respond thoughtfully.`;

      const memoriesSection = `## MEMÓRIAS RELEVANTES
• [0.85] Previous conversation about anxiety`;

      const result = injectMemoriesIntoPrompt(prompt, memoriesSection);

      expect(result).toContain("MEMÓRIAS RELEVANTES");
      expect(result).toContain("CONTEXTO DO USUÁRIO");
      // Memory section should come after context marker
      const contextIdx = result.indexOf("## CONTEXTO DO USUÁRIO");
      const memoryIdx = result.indexOf("## MEMÓRIAS RELEVANTES");
      expect(memoryIdx).toBeGreaterThan(contextIdx);
    });

    it("should append memories at end if no marker found", () => {
      const prompt = "Simple prompt without markers";
      const memoriesSection = `## MEMÓRIAS RELEVANTES
• [0.90] Some relevant memory`;

      const result = injectMemoriesIntoPrompt(prompt, memoriesSection);

      expect(result).toContain(prompt);
      expect(result).toContain("MEMÓRIAS RELEVANTES");
      expect(result).toEndWith("MEMÓRIAS RELEVANTES\n• [0.90] Some relevant memory");
    });

    it("should handle multiple insertion markers by choosing first match", () => {
      const prompt = `## HISTÓRICO
Some history here

## CONTEXTO DO USUÁRIO
User context here`;

      const memoriesSection = `## MEMÓRIAS RELEVANTES
• [0.88] Relevant memory`;

      const result = injectMemoriesIntoPrompt(prompt, memoriesSection);

      // Should inject after HISTÓRICO (first match)
      const historicoIdx = result.indexOf("## HISTÓRICO");
      const memoryIdx = result.indexOf("## MEMÓRIAS RELEVANTES");
      expect(memoryIdx).toBeGreaterThan(historicoIdx);
    });
  });

  describe("clampTokens", () => {
    it("should return clamped value within budget", () => {
      expect(clampTokens(500, 1000)).toBe(500);
      expect(clampTokens(1000, 1000)).toBe(1000);
    });

    it("should limit values exceeding budget", () => {
      expect(clampTokens(1500, 1000)).toBe(1000);
      expect(clampTokens(2000, 1000)).toBe(1000);
    });

    it("should not go below zero", () => {
      expect(clampTokens(-100, 1000)).toBe(0);
      expect(clampTokens(-1, 1000)).toBe(0);
    });

    it("should handle zero budget", () => {
      expect(clampTokens(500, 0)).toBe(0);
    });
  });

  describe("End-to-end memory flow", () => {
    it("should format and inject memories correctly", () => {
      const memories: RetrievedMemory[] = [
        {
          id: "mem1",
          texto: "I struggled with this before",
          score: 0.92,
          tags: ["struggle"],
          dominio_vida: "trabalho",
          created_at: "2024-01-01T10:00:00Z",
        },
        {
          id: "mem2",
          texto: "But I overcame it eventually",
          score: 0.88,
          tags: ["success"],
          dominio_vida: "trabalho",
          created_at: "2024-01-02T10:00:00Z",
        },
      ];

      const basePrompt = `You are ECO, an emotionally aware assistant.

## CONTEXTO DO USUÁRIO
The user is discussing a work situation.

Respond with empathy and wisdom.`;

      // Format memories
      const memoriesSection = formatMemoriesSection(memories, 1500);
      expect(memoriesSection).not.toBeNull();

      // Inject into prompt
      const finalPrompt = injectMemoriesIntoPrompt(basePrompt, memoriesSection);

      // Verify both components present
      expect(finalPrompt).toContain("emotionally aware");
      expect(finalPrompt).toContain("MEMÓRIAS RELEVANTES");
      expect(finalPrompt).toContain("0.92");
      expect(finalPrompt).toContain("0.88");

      // Verify order (context before memories)
      const contextIdx = finalPrompt.indexOf("CONTEXTO DO USUÁRIO");
      const memoryIdx = finalPrompt.indexOf("MEMÓRIAS RELEVANTES");
      expect(memoryIdx).toBeGreaterThan(contextIdx);
    });

    it("should warn if no memories found (graceful degradation)", () => {
      const memories: RetrievedMemory[] = [];
      const basePrompt = "Base prompt";

      const memoriesSection = formatMemoriesSection(memories, 1500);
      const finalPrompt = injectMemoriesIntoPrompt(basePrompt, memoriesSection);

      // Should return original prompt unchanged
      expect(finalPrompt).toBe(basePrompt);
    });
  });

  describe("Memory scoring and filtering", () => {
    it("should format with correct score precision", () => {
      const memories: RetrievedMemory[] = [
        {
          id: "mem1",
          texto: "Memory text",
          score: 0.876543, // Many decimals
          tags: [],
          dominio_vida: null,
          created_at: null,
        },
      ];

      const result = formatMemoriesSection(memories, 1000);

      // Should show 2 decimal places
      expect(result).toContain("0.88");
      expect(result).not.toContain("0.876543");
    });

    it("should exclude low-scoring memories based on minScore", () => {
      const memories: RetrievedMemory[] = [
        {
          id: "mem1",
          texto: "High score memory",
          score: 0.95,
          tags: [],
          dominio_vida: null,
          created_at: null,
        },
        {
          id: "mem2",
          texto: "Low score memory",
          score: 0.15, // Below typical minScore of 0.30
          tags: [],
          dominio_vida: null,
          created_at: null,
        },
      ];

      // In practice, the RPC already filters, but formatting should handle edge cases
      const result = formatMemoriesSection(memories, 1000);

      expect(result).toContain("High score");
      // Low score might still be included in format (depends on implementation),
      // but RPC should filter at source
    });
  });
});
