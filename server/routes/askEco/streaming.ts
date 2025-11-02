import { now, type LatencyTimer } from "../../utils";
import { log, isDebug } from "../../services/promptContext/logger";
import { computeQ, checkBlocoTecnico, checkEstrutura, checkMemoria } from "../../quality/validators";

type SseChunk = {
  id?: number;
  data: string;
};

export class StreamSession {
  private res: any;
  private req: any;
  private timer: LatencyTimer;
  private chunks: string[] = [];
  private chunkCounter = 0;
  private chunkBuffer: Map<number, string> = new Map();
  private done = false;
  private finalized = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  public readonly streamId: string;
  public readonly startedAt: number;

  constructor(req: any, res: any, streamId: string) {
    this.req = req;
    this.res = res;
    this.streamId = streamId;
    this.timer = new LatencyTimer();
    this.startedAt = this.timer.startedAt;
  }

  private getLogContext(extra: Record<string, any> = {}) {
    return {
      streamId: this.streamId,
      ...extra,
    };
  }

  private logSseLifecycle(event: string, extra: Record<string, any> = {}) {
    log.info(this.getLogContext({ event, ...extra }));
  }

  public handleChunk(chunk: SseChunk) {
    if (this.done) return;

    const chunkId = chunk.id;
    const chunkData = chunk.data;

    if (chunkId === undefined || chunkId === null) {
      if (chunkData === "[DONE]") {
        this.done = true;
        this.processChunk(chunkData, -1);
      }
      return;
    }

    if (chunkId < this.chunkCounter) {
      return;
    }

    if (chunkId > this.chunkCounter) {
      this.chunkBuffer.set(chunkId, chunkData);
      return;
    }

    this.processChunk(chunkData, chunkId);

    let nextChunkId = this.chunkCounter;
    while (this.chunkBuffer.has(nextChunkId)) {
      const bufferedData = this.chunkBuffer.get(nextChunkId)!;
      this.chunkBuffer.delete(nextChunkId);
      this.processChunk(bufferedData, nextChunkId);
      nextChunkId = this.chunkCounter;
    }
  }

  private processChunk(data: string, id: number) {
    if (data === "[DONE]") {
      this.send("data: [DONE]\n\n");
      this.finalizeStream();
      return;
    }

    this.chunks.push(data);
    this.send(`id: ${id}\ndata: ${data}\n\n`);
    this.chunkCounter = id + 1;

  }

  private send(payload: string) {
    if (this.res.writable) {
      this.res.write(payload);
    }
  }

  private finalizeStream() {
    if (this.finalized) return;
    this.finalized = true;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.res.writable) {
      this.res.end();
    }
  }
}
