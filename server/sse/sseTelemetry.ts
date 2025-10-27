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

  private sendSignalRow(interactionId: string, signal: string, meta: Record<string, unknown>): void {
    if (!this.supabaseClient) return;
    const payload = { interaction_id: interactionId, signal, meta };
    void Promise.resolve(
      this.supabaseClient
        .from("eco_passive_signals")
        .insert([payload])
    )
      .then(({ error }: { error: { message: string; code?: string } | null }) => {
        if (error) {
          log.error("[ask-eco] telemetry_failed", {
            signal,
            message: error.message,
            code: error.code ?? null,
            table: "eco_passive_signals",
            payload,
          });
          return;
        }
        log.info("[ask-eco] telemetry_inserted", {
          signal,
          table: "eco_passive_signals",
          interaction_id: interactionId,
        });
      })
      .catch((error: unknown) => {
        log.error("[ask-eco] telemetry_failed", {
          signal,
          message: error instanceof Error ? error.message : String(error),
          table: "eco_passive_signals",
          payload,
        });
      });
  }
}

export type { CaptureInteractionIdResult };
