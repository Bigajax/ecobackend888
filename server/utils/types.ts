// Tipos comuns e modelos padrão
export type AnyRecord = Record<string, any>;

export type ChatMessage = { id?: string; role: string; content: string };

export type ParalelasResult = { heuristicas: any[]; userEmbedding: number[] };

export type TrendPack = {
  targetEmotion: string | null;
  a7: number | null;
  a30: number | null;
  a90: number | null;
  a120: number | null;
};

export type ProactivePayload = {
  text: string;
  emotion: string | null;
  deltas: { d7vs30: number | null; d30vs90: number | null; d90vs120: number | null };
  memoryId?: string;
  memoryWhen?: string;
} | null;

export type GetEcoParams = {
  messages: ChatMessage[];
  userId?: string;
  userName?: string;
  accessToken: string;
  mems?: any[];
  forcarMetodoViva?: boolean;
  blocoTecnicoForcado?: any;
  clientHour?: number;
};

export type GetEcoResult = {
  message: string;
  intensidade?: number;
  resumo?: string;
  emocao?: string;
  tags?: string[];
  categoria?: string | null;
  proactive?: ProactivePayload;
};
// Nivel  de abertura aceito pela matriz
export type NivelNum = 1 | 2 | 3;

// Memória leve usada no contexto
export interface Memoria {
  created_at?: string;
  resumo_eco: string;
  tags?: string[];
  intensidade?: number;
  similaridade?: number;
  score?: number;
  emocao_principal?: string;
  nivel_abertura?: number | string;
}

// Heurística básica (por arquivo + gatilhos)
export interface Heuristica {
  arquivo: string;
  gatilhos: string[];
}
