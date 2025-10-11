export interface MemoryInsertPayload {
  texto?: string;
  intensidade: number;
  tags: string[];
  usuario_id: string;
  [key: string]: unknown;
}

export type MemoryRow = {
  id: string;
  texto: string | null;
  intensidade: number;
  tags: string[];
  usuario_id: string;
  created_at: string;
} & Record<string, unknown>;

export interface MemoryRepository {
  save(table: string, payload: MemoryInsertPayload): Promise<MemoryRow>;
  list(params: { usuario_id: string; tags?: string[]; limit?: number }): Promise<MemoryRow[]>;
}
