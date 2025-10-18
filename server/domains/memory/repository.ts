export interface MemoryRow {
  id: string;
  usuario_id: string;
  mensagem_id: string | null;
  resumo_eco: string | null;
  tags: string[];
  intensidade: number | null;
  emocao_principal: string | null;
  contexto: string | null;
  dominio_vida: string | null;
  padrao_comportamental: string | null;
  nivel_abertura: number | null;
  analise_resumo: string | null;
  categoria: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface MemoryInsertPayload {
  texto?: string;
  intensidade: number;
  tags: string[];
  usuario_id: string;
  mensagem_id?: string | null;
  resumo_eco?: string | null;
  emocao_principal?: string | null;
  contexto?: string | null;
  dominio_vida?: string | null;
  padrao_comportamental?: string | null;
  salvar_memoria?: boolean;
  nivel_abertura?: number;
  analise_resumo?: string | null;
  categoria?: string | null;
  embedding?: number[] | null;
  embedding_emocional?: number[] | null;
  [key: string]: unknown;
}

export interface MemoryRepository {
  save(table: string, payload: MemoryInsertPayload): Promise<MemoryRow>;
  list(params: {
    usuario_id: string;
    tags?: string[];
    limit?: number;
  }): Promise<MemoryRow[]>;
}
