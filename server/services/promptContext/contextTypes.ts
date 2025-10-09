export type MemoriaCompacta = { intensidade?: number };

export type SimilarMemory = {
  resumo_eco?: string;
  analise_resumo?: string;
  texto?: string;
  conteudo?: string;
  similarity?: number;
  similaridade?: number;
  created_at?: string;
  tags?: string[] | null;
};

export type SimilarMemoryList = SimilarMemory[] | undefined;

export type BuildParams = {
  userId?: string | null;
  userName?: string | null;
  texto: string;
  mems?: MemoriaCompacta[];
  heuristicas?: any[];
  userEmbedding?: number[];
  forcarMetodoViva?: boolean;
  blocoTecnicoForcado?: any;
  skipSaudacao?: boolean;
  derivados?: any;
  aberturaHibrida?: any;
  perfil?: any;
  memsSemelhantes?: SimilarMemory[];
  memoriasSemelhantes?: SimilarMemory[];
  decision?: import("../conversation/ecoDecisionHub").EcoDecisionResult;
};
