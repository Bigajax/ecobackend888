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
