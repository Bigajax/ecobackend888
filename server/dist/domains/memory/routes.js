"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const controller_1 = require("./controller");
const router = (0, express_1.Router)();
const controller = (0, controller_1.createMemoryController)();
router.post("/registrar", controller.registerMemory);
router.get("/", controller.listMemories);
router.post("/similares", controller.findSimilar);
router.post("/similares_v2", controller.findSimilar);
router.post("/similar_v2", controller.findSimilar);
exports.default = router;
//# sourceMappingURL=routes.js.map