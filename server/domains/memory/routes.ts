import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth";
import { createMemoryController } from "./controller";

/**
 * Memórias do usuário logado. O id vem do token (requireAuth), nunca da query:
 * antes, qualquer um lia as memórias de outra pessoa passando ?usuario_id=.
 * As memórias são criadas pelo pipeline do chat, não por HTTP.
 */
const router = Router();
const memoryController = createMemoryController();

router.get("/", requireAuth, memoryController.listMemories);

export default router;
