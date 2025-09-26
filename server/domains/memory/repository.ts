import type { ListMemoriesOptions, MemoryInsert, MemoryRow, MemoryTable } from "../../adapters/supabaseMemoryRepository";
import { insertMemory, listMemories } from "../../adapters/supabaseMemoryRepository";

export class MemoryRepository {
  async save(table: MemoryTable, payload: MemoryInsert) {
    return insertMemory(table, payload);
  }

  async list(userId: string, options: ListMemoriesOptions) {
    return listMemories(userId, options);
  }
}

export type { MemoryInsert, MemoryRow };
