export interface MemoryInsertPayload {
  texto?: string;
  intensidade: number;
  tags: string[];
  usuario_id: string;
  [key: string]: unknown;
}


export interface MemoryRepository {
  save(table: string, payload: MemoryInsertPayload): Promise<MemoryRow>;
  list(params: { usuario_id: string; tags?: string[]; limit?: number }): Promise<MemoryRow[]>;
}
