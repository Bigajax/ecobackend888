/**
 * Memory Injector - Injects retrieved semantic memories into the prompt context
 */

import { log } from "./logger";
import type { RetrievedMemory } from "../supabase/semanticMemoryClient";

const DEBUG_MEMORY_INJECTION = process.env.ECO_DEBUG === "1";

function debugLog(msg: string, data?: Record<string, unknown>): void {
  if (DEBUG_MEMORY_INJECTION) {
    log.info(`[memoryInjector] ${msg}`, data ?? {});
  }
}

/**
 * Format memories into a prompt section with token budget awareness
 * Returns null if no memories to inject
 */
export function formatMemoriesSection(
  memories: RetrievedMemory[],
  tokenBudget: number = 1500 // Allow ~1500 tokens for memories
): string | null {
  if (!memories || memories.length === 0) {
    return null;
  }

  // Start with header
  let section = "## MEMÓRIAS RELEVANTES\n";
  let currentTokenCount = 15; // Rough estimate for header

  const snippets: string[] = [];
  let addedCount = 0;

  // Add memories in score-descending order with token budget
  for (const mem of memories) {
    const score = Math.round(mem.score * 1000) / 1000; // 3 decimal places
    const scoreStr = score.toFixed(2);
    const snippet = `• [${scoreStr}] ${mem.texto}`;

    // Rough token estimation (4 chars ≈ 1 token)
    const estimatedTokens = Math.ceil(snippet.length / 4) + 5; // +5 for punctuation/overhead

    if (currentTokenCount + estimatedTokens > tokenBudget && addedCount > 0) {
      debugLog("token_budget_reached", {
        tokenCount: currentTokenCount,
        addedMemories: addedCount,
      });
      break;
    }

    snippets.push(snippet);
    currentTokenCount += estimatedTokens;
    addedCount++;
  }

  if (snippets.length === 0) {
    return null;
  }

  section += snippets.join("\n") + "\n";

  debugLog("formatted_memories", {
    totalFetched: memories.length,
    included: addedCount,
    estimatedTokens: currentTokenCount,
  });

  return section;
}

/**
 * Inject memory section into base prompt intelligently
 * Finds appropriate insertion point in the prompt
 */
export function injectMemoriesIntoPrompt(
  basePrompt: string,
  memoriesSection: string | null
): string {
  if (!memoriesSection) {
    return basePrompt;
  }

  // Find a good insertion point - after instructions/policies but before main content
  const insertionMarkers = [
    "## CONTEXTO DO USUÁRIO",
    "## HISTÓRICO",
    "## USUÁRIO",
    "## CURRENT SITUATION",
    "---",
  ];

  for (const marker of insertionMarkers) {
    const idx = basePrompt.indexOf(marker);
    if (idx !== -1) {
      // Insert after this marker
      const insertPos = basePrompt.indexOf("\n", idx) + 1;
      if (insertPos > 0) {
        return (
          basePrompt.slice(0, insertPos) +
          memoriesSection +
          "\n" +
          basePrompt.slice(insertPos)
        );
      }
    }
  }

  // Fallback: inject at the end before main prompt
  return basePrompt + "\n" + memoriesSection;
}

export function clampTokens(tokens: number, budget: number): number {
  return Math.max(0, Math.min(tokens, budget));
}
