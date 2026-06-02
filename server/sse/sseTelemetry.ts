import { log } from "../services/promptContext/logger";

type PassiveSignal = { signal: string; meta: Record<string, unknown> };

type CaptureInteractionIdResult = {
  interactionId: string;
  alreadyReady: boolean;
  previousInteractionId: string | null;
};

export class SseTelemetry {
  private readonly supabaseClient: any;

  private readonly origin?: string;

  private readonly clientMessageId?: string;

  private pendingSignals: PassiveSignal[] = [];

  private interactionIdReady = false;

  private resolvedInteractionId: string | null = null;

  private firstTokenLatencyMs: number | null = null;

  constructor(
    supabaseClient: any,
    options: {
      origin?: string;
      clientMessageId?: string;
    } = {}
  ) {
    this.supabaseClient = supabaseClient;
    this.origin = options.origin;
    this.clientMessageId = options.clientMessageId;
  }

  setFallbackInteractionId(value: string | null | undefined): void {
    if (typeof value === "string" && value.trim()) {
      this.resolvedInteractionId = value.trim();
      return;
    }
    this.resolvedInteractionId = null;
  }

  setFirstTokenLatency(latencyMs: number | null): void {
    this.firstTokenLatencyMs = Number.isFinite(latencyMs ?? null) ? latencyMs ?? null : null;
  }

  getResolvedInteractionId(): string | null {
    return this.resolvedInteractionId;
  }

  isInteractionIdReady(): boolean {
    return this.interactionIdReady;
  }

  captureInteractionId(value: unknown): CaptureInteractionIdResult | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const previousInteractionId = this.resolvedInteractionId;
    const wasReady = this.interactionIdReady;

    if (wasReady) {
      if (previousInteractionId && previousInteractionId !== trimmed) {
        log.warn("[ask-eco] interaction_id_mismatch", {
          current: previousInteractionId,
          incoming: trimmed,
          origin: this.origin ?? null,
          clientMessageId: this.clientMessageId ?? null,
        });
      }
      this.resolvedInteractionId = trimmed;
      return {
        interactionId: trimmed,
        alreadyReady: true,
        previousInteractionId,
      };
    }

    this.resolvedInteractionId = trimmed;
    this.interactionIdReady = true;
    this.flushPendingSignals();

    return {
      interactionId: trimmed,
      alreadyReady: false,
      previousInteractionId,
    };
  }

  enqueuePassiveSignal(
    signal: string,
    value?: number | null,
    meta?: Record<string, unknown>
  ): void {
    if (!this.supabaseClient) return;

    let serializedMeta: Record<string, unknown> = {};
    if (meta && typeof meta === "object") {
      serializedMeta = this.compactMeta(meta);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      serializedMeta = { ...serializedMeta, value };
    }

    try {
      serializedMeta = JSON.parse(JSON.stringify(serializedMeta));
    } catch (error) {
      log.debug("[ask-eco] telemetry_meta_failed", {
        signal,
        message: error instanceof Error ? error.message : String(error),
      });
      serializedMeta = {};
    }

    if (this.interactionIdReady) {
      const interactionId = this.resolvedInteractionId;
      if (!interactionId) return;
      this.sendSignalRow(interactionId, signal, serializedMeta);
      return;
    }

    this.pendingSignals.push({ signal, meta: serializedMeta });
  }

  flushPendingSignals(): void {
    if (!this.interactionIdReady || !this.pendingSignals.length) return;
    const interactionId = this.resolvedInteractionId;
    if (!interactionId) return;
    const queued = this.pendingSignals.splice(0, this.pendingSignals.length);
    for (const item of queued) {
      this.sendSignalRow(interactionId, item.signal, item.meta);
    }
  }

  recordFirstTokenTelemetry(chunkBytes: number, latencyMs?: number | null): void {
    const latency =
      typeof latencyMs === "number" && Number.isFinite(latencyMs)
        ? latencyMs
        : typeof this.firstTokenLatencyMs === "number"
        ? this.firstTokenLatencyMs
        : null;
    this.enqueuePassiveSignal(
      "first_token",
      1,
      this.compactMeta({
        latency_ms: latency ?? undefined,
        chunk_bytes: Number.isFinite(chunkBytes) ? chunkBytes : undefined,
      })
    );
  }

  compactMeta(meta: Record<string, unknown>): Record<string, unknown> {
    return Object.entries(meta).reduce<Record<string, unknown>>((acc, [key, value]) => {
      if (value !== undefined) acc[key] = value;
      return acc;
    }, {});
  }

  private async sendSignalRowWithRetry(
    interactionId: string,
    signal: string,
    meta: Record<string, unknown>,
    attempt: number = 1,
    maxAttempts: number = 3
  ): Promise<void> {
    if (!this.supabaseClient) return;
    const payload = { interaction_id: interactionId, signal, meta };

    try {
      const { error } = await this.supabaseClient
        .from("eco_passive_signals")
        .insert([payload]);

      if (error) {
        // FK 23503: Foreign key violation (interaction doesn't exist yet)
        const isFkViolation = error.code === "23503" || error.message?.includes("23503");

        if (isFkViolation && attempt < maxAttempts) {
          // Exponential backoff: 100ms * 2^(attempt-1)
          const delayMs = 100 * Math.pow(2, attempt - 1);
          log.warn("[ask-eco] telemetry_fk_retry", {
            signal,
            attempt,
            delayMs,
            code: error.code,
          });

          await new Promise(resolve => setTimeout(resolve, delayMs));
          return this.sendSignalRowWithRetry(interactionId, signal, meta, attempt + 1, maxAttempts);
        }

        log.error("[ask-eco] telemetry_failed", {
          signal,
          message: error.message,
          code: error.code ?? null,
          attempt,
          table: "eco_passive_signals",
          payload,
          isFkViolation,
        });
        return;
      }

      log.info("[ask-eco] telemetry_inserted", {
        signal,
        table: "eco_passive_signals",
        interaction_id: interactionId,
        attempt,
      });
    } catch (error: unknown) {
      log.error("[ask-eco] telemetry_failed", {
        signal,
        message: error instanceof Error ? error.message : String(error),
        attempt,
        table: "eco_passive_signals",
        payload,
      });
    }
  }

  private sendSignalRow(interactionId: string, signal: string, meta: Record<string, unknown>): void {
    // Fire-and-forget with retry logic for FK violations
    void this.sendSignalRowWithRetry(interactionId, signal, meta);
  }
}

export type { CaptureInteractionIdResult };
