"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureModuleStore = exports.bootstrap = exports.ContextBuilder = exports.ModuleStore = exports.Budgeter = void 0;
exports.buildContextWithMeta = buildContextWithMeta;
exports.montarContextoEcoCompat = montarContextoEcoCompat;
var Budgeter_1 = require("./Budgeter");
Object.defineProperty(exports, "Budgeter", { enumerable: true, get: function () { return Budgeter_1.Budgeter; } });
var ModuleStore_1 = require("./ModuleStore");
Object.defineProperty(exports, "ModuleStore", { enumerable: true, get: function () { return ModuleStore_1.ModuleStore; } });
__exportStar(require("./Selector"), exports);
__exportStar(require("./Signals"), exports);
const ContextBuilder_1 = __importStar(require("./ContextBuilder"));
Object.defineProperty(exports, "ContextBuilder", { enumerable: true, get: function () { return ContextBuilder_1.ContextBuilder; } });
const logger_1 = require("./logger");
// ✅ expõe bootstrap/configureModuleStore do arquivo novo
var modules_1 = require("../../bootstrap/modules");
Object.defineProperty(exports, "bootstrap", { enumerable: true, get: function () { return modules_1.bootstrap; } });
Object.defineProperty(exports, "configureModuleStore", { enumerable: true, get: function () { return modules_1.configureModuleStore; } });
/**
 * Constrói o contexto e retorna também metadados básicos (placeholder).
 */
async function buildContextWithMeta(input) {
    if ((0, logger_1.isDebug)()) {
        logger_1.log.debug("[montarContextoEco] iniciando build", {
            hasPerfil: !!input?.perfil,
            mems: input?.mems?.length ?? 0,
            heuristicas: input?.heuristicas?.length ?? 0,
            aberturaHibrida: !!input?.aberturaHibrida,
        });
    }
    const contexto = await ContextBuilder_1.ContextBuilder.build(input);
    const textoAtual = typeof input?.texto === "string" ? input.texto : "";
    const prompt = contexto.montarMensagemAtual(textoAtual);
    if ((0, logger_1.isDebug)()) {
        logger_1.log.debug("[montarContextoEco] concluído", {
            promptLen: typeof prompt === "string" ? prompt.length : -1,
        });
    }
    return { prompt };
}
/** Compat: função direta que retorna apenas o prompt (string) */
async function montarContextoEcoCompat(input) {
    const { prompt } = await buildContextWithMeta(input);
    return prompt;
}
exports.default = ContextBuilder_1.default;
//# sourceMappingURL=index.js.map