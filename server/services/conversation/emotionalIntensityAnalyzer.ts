/**
 * Emotional Intensity Analyzer
 *
 * Hybrid approach:
 * 1. Fast path: Regex patterns (instant, no latency)
 * 2. Smart path: Claude-powered analysis (accurate, with caching)
 * 3. Fallback: User feedback (manual override)
 *
 * This solves the fragility of pure regex by using Claude's language understanding
 * while maintaining performance with caching.
 */

import { log } from "../promptContext/logger";
import { claudeChatCompletion } from "../../core/ClaudeAdapter";
import type { EcoDecisionResult } from "./ecoDecisionHub";

const INTENSITY_CACHE = new Map<string, { intensity: number; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fast path: Quick regex-based detection (high confidence cases)
 * Returns null if not confident enough to cache
 */
export function fastPathIntensityDetection(text: string): number | null {
  const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // High-confidence crisis patterns (should ALWAYS save)
  const crisisPatterns = [
    /p[aâ]nico|crise|desesper|insuport/,
    /vontade de sumir|quero morrer|suic[íi]/,
    /auto[- ]agressão|me machucar|cortar os pulsos/,
  ];

  if (crisisPatterns.some((r) => r.test(t))) {
    return 10; // Emergency - always save
  }

  // High-confidence emotional patterns
  const strongEmotional = [
    /muito\s+(triste|ansioso|assustado|furioso|vazio)/,
    /estou.*devastado|arrasado|destruído/,
    /n[aã]o\s+aguento\s+mais/,
  ];

  if (strongEmotional.some((r) => r.test(t))) {
    return 8; // Strong emotion - likely to save
  }

  return null; // Not confident - delegate to Claude
}

/**
 * Smart path: Use Claude to understand emotional intensity
 * Much more accurate than regex, but with caching to avoid latency
 */
export async function claudeIntensityAnalysis(
  text: string,
  userId?: string
): Promise<number | null> {
  // Check cache first
  const cacheKey = `intensity:${text.substring(0, 100)}`;
  const cached = INTENSITY_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.intensity;
  }

  try {
    const prompt = `Você é um analisador de intensidade emocional. Avalie a intensidade emocional da mensagem em uma escala 0-10.

Mensagem do usuário:
"${text}"

Responda APENAS com um número de 0 a 10, sem explicação.

Critérios:
- 0-2: Neutro, factual, sem carga emocional
- 3-4: Leve preocupação ou curiosidade
- 5-6: Emoção moderada, reflexão
- 7-8: Emoção forte, vulnerabilidade clara
- 9-10: Crise, desespero, urgência

RESPONDA APENAS O NÚMERO.`;

    const response = await claudeChatCompletion({
      messages: [{ role: "user", content: prompt }],
      model: "anthropic/claude-3-haiku-20250307", // Fast model for quick analysis
      temperature: 0,
      maxTokens: 1,
    });

    const responseText = response.content.trim();
    const intensity = parseInt(responseText, 10);

    if (Number.isFinite(intensity) && intensity >= 0 && intensity <= 10) {
      // Cache the result
      INTENSITY_CACHE.set(cacheKey, { intensity, timestamp: Date.now() });

      if (process.env.ECO_DEBUG === "true") {
        log.debug("[claudeIntensityAnalysis] evaluated", {
          text: text.substring(0, 100),
          intensity,
        });
      }

      return intensity;
    }

    return null;
  } catch (error) {
    log.warn("[claudeIntensityAnalysis] failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Hybrid intensity detection (Performance-aware)
 *
 * Strategy:
 * 1. Fast path: Regex patterns (instant)
 * 2. Smart path: Claude (optional, with caching)
 * 3. Fallback: Improved regex estimation
 *
 * Set ECO_ENABLE_CLAUDE_INTENSITY=true to enable Claude analysis
 * Default: OFF (regex only) - maintains millisecond-level performance
 */
export async function detectEmotionalIntensity(
  text: string,
  options?: {
    userId?: string;
    forceMethod?: "fast" | "smart" | "auto";
  }
): Promise<number> {
  const forceMethod = options?.forceMethod ?? "auto";
  const shouldUseClaude = process.env.ECO_ENABLE_CLAUDE_INTENSITY === "true";

  // Step 1: Fast path (instant detection - always fast)
  const fastResult = fastPathIntensityDetection(text);
  if (fastResult !== null && forceMethod !== "smart") {
    return fastResult;
  }

  // Step 2: Smart path (Claude-based, optional for performance)
  if ((shouldUseClaude || forceMethod === "smart") && forceMethod !== "fast") {
    try {
      const claudeResult = await claudeIntensityAnalysis(text, options?.userId);
      if (claudeResult !== null) {
        return claudeResult;
      }
    } catch {
      // Fall through to regex
    }
  }

  // Step 3: Fallback to improved regex estimation
  const { estimarIntensidade0a10 } = await import("../promptContext/flags");
  return estimarIntensidade0a10(text);
}

/**
 * User feedback override
 * Allows users to manually correct intensity assessment
 * Stored in cache for future similar messages
 */
export function recordIntensityFeedback(text: string, userAssignedIntensity: number): void {
  const cacheKey = `intensity:${text.substring(0, 100)}`;
  INTENSITY_CACHE.set(cacheKey, {
    intensity: userAssignedIntensity,
    timestamp: Date.now(),
  });

  if (process.env.ECO_DEBUG === "true") {
    log.debug("[recordIntensityFeedback] user override", {
      text: text.substring(0, 100),
      intensity: userAssignedIntensity,
    });
  }
}

/**
 * Clear cache (useful for testing or privacy)
 */
export function clearIntensityCache(): void {
  INTENSITY_CACHE.clear();
  log.info("[clearIntensityCache] cache cleared");
}

/**
 * Get cache statistics
 */
export function getIntensityCacheStats(): { size: number; entries: number } {
  return {
    size: INTENSITY_CACHE.size,
    entries: INTENSITY_CACHE.size,
  };
}
