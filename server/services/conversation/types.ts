import type { ORUsage } from "../../core/ClaudeAdapter";
import type { GetEcoResult } from "../../utils";

export interface EcoLatencyMarks {
  contextBuildStart?: number;
  contextBuildEnd?: number;
  llmStart?: number;
  llmEnd?: number;
}

export type EcoStreamEvent =
  | {
      type: "control";
      name: "prompt_ready" | "first_token" | "reconnect";
      attempt?: number;
      timings?: EcoLatencyMarks;
    }
  | {
      type: "control";
      name: "done";
      meta?: { finishReason?: string | null; usage?: ORUsage; modelo?: string | null; length?: number };
      timings?: EcoLatencyMarks;
    }
  | {
      type: "control";
      name: "meta_pending";
    }
  | {
      type: "control";
      name: "meta";
      meta: EcoStreamMetaPayload;
    }
  | {
      type: "control";
      name: "memory_saved";
      meta: {
        memoriaId: string;
        primeiraMemoriaSignificativa: boolean;
        intensidade: number;
      };
    }
  | { type: "chunk"; content: string; index: number }
  | { type: "error"; error: Error };

export interface EcoStreamHandler {
  onEvent: (event: EcoStreamEvent) => void | Promise<void>;
}

export interface EcoStreamingResult {
  raw: string;
  modelo?: string | null;
  usage?: ORUsage;
  finalize: () => Promise<GetEcoResult>;
  timings: EcoLatencyMarks;
}

export interface EcoStreamMetaPayload {
  intensidade: number;
  resumo: string;
  emocao: string;
  categoria: string;
  tags: string[];
}
