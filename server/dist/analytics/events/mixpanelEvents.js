"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackSessaoEntrouChat = exports.trackRelatorioEmocionalAcessado = exports.trackBlocoTecnico = exports.trackReferenciaEmocional = exports.trackMemoriaRegistrada = exports.trackPerguntaProfunda = exports.trackEcoDemorou = exports.trackEcoCache = exports.trackMensagemRecebida = exports.trackMensagemEnviada = exports.identifyUsuario = void 0;
// server/events/mixpanelEvents.ts
const mixpanel_1 = __importDefault(require("../../lib/mixpanel"));
const withDistinctId = (props) => {
    const { distinctId, userId, ...rest } = props;
    const trackId = distinctId || userId;
    return {
        ...(trackId ? { distinct_id: trackId } : {}),
        ...(userId ? { userId } : {}),
        ...rest,
    };
};
const identifyUsuario = ({ distinctId, userId, versaoApp, device, ambiente, }) => {
    if (!distinctId)
        return;
    const props = {};
    if (userId)
        props.user_id = userId;
    if (versaoApp !== undefined)
        props.versao_app = versaoApp;
    if (device !== undefined)
        props.device = device;
    if (ambiente !== undefined)
        props.ambiente = ambiente;
    if (Object.keys(props).length === 0)
        return;
    mixpanel_1.default.register_once(props);
    mixpanel_1.default.people.set_once(distinctId, props);
};
exports.identifyUsuario = identifyUsuario;
const trackMensagemEnviada = ({ distinctId, userId, tempoRespostaMs, tokensUsados, modelo, blocoStatus, }) => {
    mixpanel_1.default.track('Mensagem enviada', withDistinctId({
        distinctId,
        userId,
        tempoRespostaMs,
        tokensUsados,
        modelo,
        blocoStatus,
    }));
};
exports.trackMensagemEnviada = trackMensagemEnviada;
const toIsoTimestamp = (value) => {
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isNaN(ms) ? undefined : value.toISOString();
    }
    if (typeof value === 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
    }
    if (typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
    }
    return undefined;
};
const trackMensagemRecebida = ({ distinctId, userId, origem, tipo, tamanhoCaracteres, tamanhoBytes, duracaoMs, timestamp, sessaoId, origemSessao, }) => {
    const isoTimestamp = toIsoTimestamp(timestamp);
    mixpanel_1.default.track('Mensagem recebida', withDistinctId({
        distinctId,
        userId,
        origem,
        tipo,
        ...(typeof tamanhoCaracteres === 'number'
            ? { tamanhoCaracteres }
            : {}),
        ...(typeof tamanhoBytes === 'number' ? { tamanhoBytes } : {}),
        ...(typeof duracaoMs === 'number' ? { duracaoMs } : {}),
        ...(isoTimestamp ? { timestamp: isoTimestamp } : {}),
        ...(sessaoId !== undefined ? { sessaoId } : {}),
        ...(origemSessao !== undefined ? { origemSessao } : {}),
    }));
};
exports.trackMensagemRecebida = trackMensagemRecebida;
const trackEcoCache = ({ distinctId, userId, status, key, source, }) => {
    mixpanel_1.default.track("Eco response cache", withDistinctId({
        distinctId,
        userId,
        status,
        ...(key ? { key } : {}),
        source,
    }));
};
exports.trackEcoCache = trackEcoCache;
const trackEcoDemorou = ({ distinctId, userId, duracaoMs, ultimaMsg, }) => {
    mixpanel_1.default.track('Eco demorou', withDistinctId({ distinctId, userId, duracaoMs, ultimaMsg }));
};
exports.trackEcoDemorou = trackEcoDemorou;
const trackPerguntaProfunda = ({ distinctId, userId, emocao, intensidade, categoria, dominioVida, }) => {
    mixpanel_1.default.track('Pergunta profunda feita', withDistinctId({
        distinctId,
        userId,
        emocao,
        intensidade,
        categoria,
        dominioVida,
    }));
};
exports.trackPerguntaProfunda = trackPerguntaProfunda;
const trackMemoriaRegistrada = ({ distinctId, userId, intensidade, emocao, categoria, dominioVida, }) => {
    mixpanel_1.default.track('Memória registrada', withDistinctId({
        distinctId,
        userId,
        intensidade,
        emocao,
        categoria,
        dominioVida,
    }));
};
exports.trackMemoriaRegistrada = trackMemoriaRegistrada;
const trackReferenciaEmocional = ({ distinctId, userId, intensidade, emocao, tags, categoria, }) => {
    mixpanel_1.default.track('Referência emocional', withDistinctId({ distinctId, userId, intensidade, emocao, tags, categoria }));
};
exports.trackReferenciaEmocional = trackReferenciaEmocional;
const trackBlocoTecnico = ({ distinctId, userId, status, mode, skipBloco, duracaoMs, intensidade, erro, }) => {
    mixpanel_1.default.track('Bloco técnico', withDistinctId({
        distinctId,
        userId,
        status,
        mode,
        skipBloco,
        ...(duracaoMs !== undefined ? { duracaoMs } : {}),
        ...(intensidade !== undefined ? { intensidade } : {}),
        ...(erro ? { erro } : {}),
    }));
};
exports.trackBlocoTecnico = trackBlocoTecnico;
const trackRelatorioEmocionalAcessado = ({ distinctId, userId, origem, view, }) => {
    mixpanel_1.default.track('Relatório emocional acessado', withDistinctId({
        distinctId,
        userId,
        origem,
        ...(view ? { view } : {}),
    }));
};
exports.trackRelatorioEmocionalAcessado = trackRelatorioEmocionalAcessado;
const trackSessaoEntrouChat = ({ distinctId, userId, mode, origem, sessaoId, versaoApp, device, ambiente, }) => {
    const payload = withDistinctId({
        distinctId,
        userId,
        mode,
        ...(sessaoId ? { sessaoId } : {}),
        ...(origem ? { origem } : {}),
        ...(versaoApp !== undefined ? { versaoApp } : {}),
        ...(device !== undefined ? { device } : {}),
        ...(ambiente !== undefined ? { ambiente } : {}),
    });
    mixpanel_1.default.track("Sessão entrou no chat", payload);
};
exports.trackSessaoEntrouChat = trackSessaoEntrouChat;
//# sourceMappingURL=mixpanelEvents.js.map