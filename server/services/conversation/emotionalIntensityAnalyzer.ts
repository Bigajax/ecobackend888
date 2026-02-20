/**
 * Emotional Intensity Analyzer
 *
 * Hybrid approach:
 * 1. Fast path: Regex patterns (instant, no latency)
 * 2. Smart path: GPT-5.0 via EmotionalAnalyzer (accurate, with caching)
 * 3. Fallback: User feedback (manual override)
 *
 * This solves the fragility of pure regex by using your existing
 * EmotionalAnalyzer (GPT-5.0) when regex confidence is low.
 */

import { log } from "../promptContext/logger";
import { gerarBlocoTecnicoComCache } from "../../core/EmotionalAnalyzer";
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
 * Smart path: Use GPT-5.0 EmotionalAnalyzer to understand emotional intensity
 * Reutiliza seu EmotionalAnalyzer existente que já faz análise completa
 * Much more accurate than regex, with caching to avoid latency
 */
export async function gpt5IntensityAnalysis(
  mensagemUsuario: string,
  respostaIa: string = "" // Can be empty for just analyzing the message
): Promise<number | null> {
  // Check cache first
  const cacheKey = `intensity:${mensagemUsuario.substring(0, 100)}`;
  const cached = INTENSITY_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    if (process.env.ECO_DEBUG === "true") {
      log.debug("[gpt5IntensityAnalysis] cache_hit", {
        text: mensagemUsuario.substring(0, 50),
        intensity: cached.intensity,
      });
    }
    return cached.intensity;
  }

  try {
    // Call your existing EmotionalAnalyzer with GPT-5.0
    const blocoTecnico = await gerarBlocoTecnicoComCache(
      mensagemUsuario,
      respostaIa
    );

    const intensity = blocoTecnico?.intensidade ?? null;

    if (Number.isFinite(intensity) && intensity >= 0 && intensity <= 10) {
      // Cache the result
      INTENSITY_CACHE.set(cacheKey, { intensity, timestamp: Date.now() });

      if (process.env.ECO_DEBUG === "true") {
        log.debug("[gpt5IntensityAnalysis] evaluated", {
          text: mensagemUsuario.substring(0, 50),
          emocao: blocoTecnico?.emocao_principal,
          intensity,
        });
      }

      return intensity;
    }

    return null;
  } catch (error) {
    log.warn("[gpt5IntensityAnalysis] failed", {
      error: error instanceof Error ? error.message : String(error),
      text: mensagemUsuario.substring(0, 50),
    });
    return null;
  }
}

/**
 * Hybrid intensity detection (Performance-aware)
 *
 * Strategy:
 * 1. Fast path: Regex patterns (instant, <1ms)
 * 2. Smart path: GPT-5.0 EmotionalAnalyzer (accurate, cached, ~500ms first time then <1ms)
 * 3. Fallback: Improved regex estimation
 *
 * Set ECO_ENABLE_GPT5_INTENSITY=true to enable GPT-5.0 analysis
 * Default: OFF (regex only) - maintains millisecond-level performance
 */
export async function detectEmotionalIntensity(
  text: string,
  options?: {
    userId?: string;
    forceMethod?: "fast" | "smart" | "auto";
    respostaIa?: string; // For more context to GPT-5.0
  }
): Promise<number> {
  const forceMethod = options?.forceMethod ?? "auto";
  const useGpt5 = process.env.ECO_ENABLE_GPT5_INTENSITY === "true";

  // Step 1: Fast path (instant detection - always fast)
  const fastResult = fastPathIntensityDetection(text);
  if (fastResult !== null && forceMethod !== "smart") {
    return fastResult;
  }

  // Step 2: Smart path (GPT-5.0 via EmotionalAnalyzer, optional for performance)
  if ((useGpt5 || forceMethod === "smart") && forceMethod !== "fast") {
    try {
      const gpt5Result = await gpt5IntensityAnalysis(
        text,
        options?.respostaIa ?? ""
      );
      if (gpt5Result !== null) {
        return gpt5Result;
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
