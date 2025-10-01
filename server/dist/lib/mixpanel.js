"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIXPANEL_ENABLED = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const mixpanel_1 = __importDefault(require("mixpanel"));
dotenv_1.default.config(); // deixa o path padrão (raiz do projeto)
// Aceita várias vars para conveniência
const TOKEN = process.env.MIXPANEL_SERVER_TOKEN ||
    process.env.MIXPANEL_TOKEN ||
    process.env.NEXT_PUBLIC_MIXPANEL_TOKEN ||
    "";
/** Cliente no-op: não envia nada, mas respeita a tipagem */
class NoopMixpanel {
    track() {
        if (process.env.NODE_ENV !== "production") {
            // console.warn("[mixpanel] track ignorado (TOKEN ausente)");
        }
    }
    register() { }
    register_once() { }
    people = {
        set: () => { },
        set_once: () => { },
        increment: () => { },
    };
    alias() { }
    identify() { }
    import() { }
}
let mixpanelClient;
if (TOKEN) {
    // mixpanel.init retorna um tipo específico; fazemos um cast para nossa interface mínima
    mixpanelClient = mixpanel_1.default.init(TOKEN, { protocol: "https" });
}
else {
    if (process.env.NODE_ENV !== "production") {
        console.warn("[mixpanel] Desabilitado: nenhum token em MIXPANEL_SERVER_TOKEN/MIXPANEL_TOKEN.");
    }
    mixpanelClient = new NoopMixpanel();
}
exports.default = mixpanelClient;
exports.MIXPANEL_ENABLED = !!TOKEN;
//# sourceMappingURL=mixpanel.js.map