export type CloseType = "client_closed" | "proxy_closed" | "server_abort" | "unknown";

type UsageTokens = { in: number | null; out: number | null };

type RecordChunkResult = {
  chunkIndex: number;
  chunkBytes: number;
  totalBytes: number;
  firstChunk: boolean;
  timestamp: number;
};

type RecordChunkInput = {
  text: string;
  providedIndex: number | null;
};

type DoneMeta = Record<string, unknown>;
type MetaPayload = Record<string, unknown>;
type MemoryEvent = Record<string, unknown>;
type LatencyMarks = Record<string, unknown>;

export class SseStreamState {
  done = false;
  sawChunk = false;
  finishReason: string | undefined = undefined;
  clientClosed = false;
  clientClosedStack: string | null = null;
  firstSent = false;
  readonly t0: number;
  promptReadyAt = 0;
  firstTokenAt = 0;
  chunksCount = 0;
  bytesCount = 0;
  lastChunkAt = 0;
  lastEventAt: number;
  model: string | null = null;
  firstTokenTelemetrySent = false;
  endLogged = false;
  contentPieces: string[] = [];
  metaPayload: MetaPayload = {};
  doneMeta: DoneMeta = {};
  memoryEvents: MemoryEvent[] = [];
  usageTokens: UsageTokens = { in: null, out: null };
  latencyMarks: LatencyMarks = {};
  streamResult: Record<string, unknown> | null = null;
  firstTokenWatchdog: NodeJS.Timeout | null = null;
  firstTokenWatchdogFired = false;
  connectionClosed = false;
  closeSource: string | null = null;
  closeClassification: CloseType | null = null;
  closeAt = 0;
  closeErrorMessage: string | null = null;
  serverAbortReason: string | null = null;
  doneAt = 0;
  guardFallbackSent = false;
  guardFallbackReason: string | null = null;

  constructor() {
    const now = Date.now();
    this.t0 = now;
    this.lastEventAt = now;
  }

  classifyClose(source?: string | null): CloseType {
    if (!source) {
      return this.serverAbortReason ? "server_abort" : "unknown";
    }
    if (source === "req.close" || source === "res.write") {
      return "client_closed";
    }
    if (source === "req.aborted" || source === "res.error") {
      return "proxy_closed";
    }
    if (source === "server.abort") {
      return "server_abort";
    }
    if (source === "res.close") {
      if (this.serverAbortReason || this.done) {
        return "server_abort";
      }
      return "proxy_closed";
    }
    if (this.serverAbortReason) {
      return "server_abort";
    }
    return "unknown";
  }

  markConnectionClosed(
    source: string,
    error?: unknown,
    captureStack?: (src: string) => string | null
  ): CloseType {
    if (!this.connectionClosed) {
      this.connectionClosed = true;
      this.closeSource = source;
      this.closeAt = Date.now();
    }

    if (!this.closeErrorMessage) {
      if (error instanceof Error && typeof error.message === "string") {
        const trimmed = error.message.trim();
        if (trimmed) {
          this.closeErrorMessage = trimmed;
        }
      } else if (typeof error === "string") {
        const trimmed = error.trim();
        if (trimmed) {
          this.closeErrorMessage = trimmed;
        }
      }
    }

    const classification = this.classifyClose(source);
    const effectiveClassification =
      this.closeClassification === "client_closed" && classification !== "client_closed"
        ? "client_closed"
        : classification;
    this.closeClassification = effectiveClassification;

    if (effectiveClassification === "client_closed") {
      this.clientClosed = true;
      if (!this.clientClosedStack && captureStack) {
        this.clientClosedStack = captureStack(source) ?? null;
      }
    }

    return effectiveClassification;
  }

  clearFirstTokenWatchdogTimer() {
    if (this.firstTokenWatchdog) {
      clearTimeout(this.firstTokenWatchdog);
      this.firstTokenWatchdog = null;
    }
  }

  setFirstTokenWatchdogTimer(timer: NodeJS.Timeout) {
    this.clearFirstTokenWatchdogTimer();
    this.firstTokenWatchdog = timer;
  }

  markFirstTokenWatchdogCleared() {
    this.firstTokenWatchdog = null;
  }

  markFirstTokenWatchdogFired() {
    this.firstTokenWatchdogFired = true;
  }

  ensureFinishReason(reason: string) {
    if (!this.finishReason) {
      this.finishReason = reason;
    }
  }

  setFinishReason(reason: string | null | undefined) {
    if (typeof reason === "string") {
      this.finishReason = reason;
      return;
    }
    this.finishReason = undefined;
  }

  updateLastEvent(timestamp: number) {
    this.lastEventAt = timestamp;
  }

  markPromptReady(timestamp: number) {
    this.promptReadyAt = timestamp;
    this.updateLastEvent(timestamp);
  }

  recordChunk(input: RecordChunkInput): RecordChunkResult {
    const { text, providedIndex } = input;
    const chunkIndex =
      typeof providedIndex === "number" && Number.isFinite(providedIndex)
        ? providedIndex
        : this.chunksCount;
    const chunkBytes = Buffer.byteLength(text, "utf8");
    const totalBytes = this.bytesCount + chunkBytes;
    const now = Date.now();

    this.sawChunk = true;
    this.lastChunkAt = now;
    this.updateLastEvent(now);

    const firstChunk = !this.firstSent;
    if (firstChunk) {
      this.firstSent = true;
      this.firstTokenAt = now;
    }

    this.chunksCount = Math.max(this.chunksCount, chunkIndex + 1);
    this.bytesCount = totalBytes;
    this.contentPieces.push(text);

    return { chunkIndex, chunkBytes, totalBytes, firstChunk, timestamp: now };
  }

  mergeMetaPayload(obj: Record<string, unknown>) {
    this.metaPayload = { ...this.metaPayload, ...obj };
  }

  addMemoryEvent(event: MemoryEvent) {
    this.memoryEvents.push(event);
  }

  setDoneMeta(meta: DoneMeta) {
    this.doneMeta = meta;
  }

  mergeDoneMeta(meta: DoneMeta) {
    this.doneMeta = { ...this.doneMeta, ...meta };
  }

  updateUsageTokens(meta: any) {
    if (!meta || typeof meta !== "object") return;
    const source = meta as Record<string, any>;
    const usage = source.usage || source.token_usage || source.tokens || {};
    const maybeIn =
      usage?.prompt_tokens ??
      usage?.input_tokens ??
      usage?.tokens_in ??
      usage?.in ??
      source.prompt_tokens ??
      source.input_tokens ??
      null;
    const maybeOut =
      usage?.completion_tokens ??
      usage?.output_tokens ??
      usage?.tokens_out ??
      usage?.out ??
      source.completion_tokens ??
      source.output_tokens ??
      null;

    if (typeof maybeIn === "number" && Number.isFinite(maybeIn)) {
      this.usageTokens = { ...this.usageTokens, in: Number(maybeIn) };
    }
    if (typeof maybeOut === "number" && Number.isFinite(maybeOut)) {
      this.usageTokens = { ...this.usageTokens, out: Number(maybeOut) };
    }
  }

  mergeLatencyMarks(marks: Record<string, unknown> | null | undefined) {
    if (!marks || typeof marks !== "object") return;
    this.latencyMarks = { ...this.latencyMarks, ...marks };
  }

  setStreamResult(result: Record<string, unknown>) {
    this.streamResult = result;
  }

  setServerAbortReason(reason: string) {
    this.serverAbortReason = reason;
  }

  markGuardFallback(reason: string) {
    this.guardFallbackReason = reason;
    this.guardFallbackSent = true;
  }

  markDone(timestamp: number) {
    this.done = true;
    if (!this.lastChunkAt) {
      this.lastChunkAt = timestamp;
    }
    this.doneAt = this.lastChunkAt || timestamp;
    this.updateLastEvent(this.doneAt);
  }

  markEndLogged() {
    this.endLogged = true;
  }

  markFirstTokenTelemetrySent() {
    this.firstTokenTelemetrySent = true;
  }

  markClientClosedFromFinishReason(finishReason: string | null | undefined) {
    if (finishReason === "client_closed") {
      this.clientClosed = true;
    }
  }

  setModel(value: string) {
    this.model = value;
  }
}
