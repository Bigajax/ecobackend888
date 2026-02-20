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
 * Includes dates, emotion tags, and visual hierarchy
 * Returns null if no memories to inject
 */
export function formatMemoriesSection(
  memories: RetrievedMemory[],
  tokenBudget: number = 1500 // Allow ~1500 tokens for memories
): string | null {
  if (!memories || memories.length === 0) {
    return null;
  }

  // Helper: Calculate days since memory was created
  function getDaysSince(createdAt: string | null): number | null {
    if (!createdAt) return null;
    try {
      const memoryDate = new Date(createdAt);
      const today = new Date();
      const diffMs = today.getTime() - memoryDate.getTime();
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      return days >= 0 ? days : null;
    } catch {
      return null;
    }
  }

  // Helper: Get time descriptor with emoji
  function getTimeDescriptor(daysSince: number | null): string {
    if (daysSince === null) return "";
    if (daysSince === 0) return " 🕐 **HOJE**";
    if (daysSince === 1) return " 🕐 **ONTEM**";
    if (daysSince <= 3) return ` 🔥 há ${daysSince} dias ⚡`;
    if (daysSince <= 7) return ` 📅 há ${daysSince} dias`;
    if (daysSince <= 30) return ` 📅 há ~${Math.ceil(daysSince / 7)} semanas`;
    return ` 📆 há ~${Math.ceil(daysSince / 30)} meses`;
  }

  // Helper: Check if memory is recent (< 7 days)
  function isRecentMemory(daysSince: number | null): boolean {
    return daysSince !== null && daysSince <= 7;
  }

  // Helper: Get emotion emoji
  function getEmotionEmoji(emotion: string | null): string {
    if (!emotion) return "💭";
    const lower = emotion.toLowerCase();
    const emojiMap: Record<string, string> = {
      tristeza: "😔",
      tristesse: "😔",
      sad: "😔",
      "tristeza / perda": "😔",
      ansiedade: "😰",
      anxiety: "😰",
      medo: "😨",
      fear: "😨",
      alegria: "😊",
      joy: "😊",
      raiva: "😠",
      anger: "😠",
      frustração: "😤",
      frustration: "😤",
      esperança: "🌟",
      hope: "🌟",
      confusão: "😕",
      confusion: "😕",
      amor: "💕",
      love: "💕",
      culpa: "😔",
      guilt: "😔",
      vergonha: "😳",
      shame: "😳",
      paz: "🕊️",
      peace: "🕊️",
      vazio: "🖤",
      emptiness: "🖤",
    };

    for (const [key, emoji] of Object.entries(emojiMap)) {
      if (lower.includes(key)) return emoji;
    }
    return "💭";
  }

  // Helper: Get relevance indicator based on score
  function getRelevanceIndicator(score: number): string {
    if (score >= 0.85) return "🔴"; // Very relevant
    if (score >= 0.70) return "🟠"; // Relevant
    if (score >= 0.50) return "🟡"; // Somewhat relevant
    return "⚪"; // Low relevance
  }

  // Start with header
  let section = "## 📚 MEMÓRIAS RELEVANTES\n\n";
  let currentTokenCount = 20; // Rough estimate for header

  // Separate memories into recent and older for better visibility
  const recentSnippets: string[] = [];
  const olderSnippets: string[] = [];
  let addedCount = 0;

  // Add memories in score-descending order with token budget
  for (const mem of memories) {
    const score = Math.round(mem.score * 1000) / 1000; // 3 decimal places
    const daysSince = getDaysSince(mem.created_at);
    const timeDesc = getTimeDescriptor(daysSince);
    const relevanceEmoji = getRelevanceIndicator(score);
    const isRecent = isRecentMemory(daysSince);

    // Build enhanced snippet with metadata
    // Use either emocao_principal or fallback to dominio_vida for emoji
    const emotionForEmoji = (mem as any).emocao_principal || mem.dominio_vida || "";
    const emotionEmoji = getEmotionEmoji(emotionForEmoji);
    const header = `${relevanceEmoji} ${emotionEmoji}${timeDesc}`;
    const text = mem.texto.trim();
    const snippet = `${header}\n  "${text}"`;

    // Rough token estimation (4 chars ≈ 1 token)
    const estimatedTokens = Math.ceil(snippet.length / 4) + 10; // +10 for structure

    if (currentTokenCount + estimatedTokens > tokenBudget && addedCount > 0) {
      debugLog("token_budget_reached", {
        tokenCount: currentTokenCount,
        addedMemories: addedCount,
      });
      break;
    }

    // Separate recent from older
    if (isRecent) {
      recentSnippets.push(snippet);
    } else {
      olderSnippets.push(snippet);
    }
    currentTokenCount += estimatedTokens;
    addedCount++;
  }

  if (recentSnippets.length === 0 && olderSnippets.length === 0) {
    return null;
  }

  // Add recent memories first with emphasis
  if (recentSnippets.length > 0) {
    section += "### 🔥 MUITO RECENTE (últimos 7 dias)\n\n";
    section += recentSnippets.join("\n\n") + "\n\n";
  }

  // Add older memories
  if (olderSnippets.length > 0) {
    if (recentSnippets.length > 0) {
      section += "---\n\n";
    }
    section += "### 📚 TAMBÉM RELEVANTE\n\n";
    section += olderSnippets.join("\n\n") + "\n\n";
  }

  section += `_${addedCount} memória${addedCount !== 1 ? "s" : ""} relevante${addedCount !== 1 ? "s" : ""} recuperada${addedCount !== 1 ? "s" : ""}_\n`;

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
