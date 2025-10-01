"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryRepository = void 0;
const supabaseMemoryRepository_1 = require("../../adapters/supabaseMemoryRepository");
class MemoryRepository {
    async save(table, payload) {
        return (0, supabaseMemoryRepository_1.insertMemory)(table, payload);
    }
    async list(userId, options) {
        return (0, supabaseMemoryRepository_1.listMemories)(userId, options);
    }
}
exports.MemoryRepository = MemoryRepository;
//# sourceMappingURL=repository.js.map