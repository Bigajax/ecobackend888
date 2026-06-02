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
      name: "prompt_ready" | "first_token" | "reconnect" | "guard_fallback_trigger";
      attempt?: number;
      timings?: EcoLatencyMarks;
      meta?: Record<string, unknown>;
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
        memory: {
          id: string;
          usuario_id: string;
          resumo_eco: string;
          emocao_principal: string;
          intensidade: number;
          contexto?: string;
          dominio_vida?: string | null;
          padrao_comportamental?: string | null;
          categoria?: string | null;
          nivel_abertura?: number | null;
          analise_resumo?: string;
          tags: string[];
          created_at?: string;
        };
        primeiraMemoriaSignificativa: boolean;
      };
    }
  | { type: "first_token"; delta: string }
  | { type: "chunk"; delta: string; index: number; content?: string }
  | { type: "error"; error: Error };

export interface EcoStreamChunkPayload {
  index?: number;
  text?: string;
  done?: boolean;
  meta?: Record<string, unknown>;
}

export interface EcoStreamHandler {
  onEvent: (event: EcoStreamEvent) => void | Promise<void>;
  onChunk?: (payload: EcoStreamChunkPayload) => void | Promise<void>;
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
  analise_resumo?: string;
  nivel_abertura?: number;
}
