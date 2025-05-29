"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// server.ts
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const geminiRoutes_1 = __importDefault(require("./routes/geminiRoutes"));
const promptRoutes_1 = __importDefault(require("./routes/promptRoutes"));
const memoryRoutes_1 = __importDefault(require("./routes/memoryRoutes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((req, res, next) => {
    console.log(`Backend: [${req.method}] ${req.originalUrl}`);
    next();
});
// As rotas DEVEM ser registradas assim:
app.use('/api', geminiRoutes_1.default);
app.use('/api', promptRoutes_1.default);
app.use('/api', memoryRoutes_1.default);
app.listen(PORT, () => {
    console.log(`Servidor Express rodando na porta ${PORT}`);
});
exports.default = app;
//# sourceMappingURL=server.js.map