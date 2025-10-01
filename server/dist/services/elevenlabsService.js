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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isElevenEnabled = isElevenEnabled;
exports.generateAudio = generateAudio;
// server/src/services/elevenlabsService.ts
const dotenv_1 = __importDefault(require("dotenv"));
const node_fetch_1 = __importStar(require("node-fetch"));
dotenv_1.default.config();
/* ───────────────────────── helpers de env (lazy) ───────────────────────── */
function getApiKey() {
    const key = process.env.ELEVEN_API_KEY ||
        process.env.ELEVENLABS_API_KEY ||
        process.env.ELEVEN_TOKEN ||
        "";
    if (!key) {
        throw new Error("ELEVEN_API_KEY não configurada. Defina ELEVEN_API_KEY (ou ELEVENLABS_API_KEY/ELEVEN_TOKEN) nas variáveis de ambiente.");
    }
    return key.trim();
}
function getDefaultVoiceId() {
    // sua voz padrão (PT-BR) — ajuste o ID se quiser
    const vid = (process.env.ELEVEN_VOICE_ID || "e5WNhrdI30aXpS2RSGm1").trim();
    if (!vid) {
        throw new Error("VOICE_ID vazio/inválido (ELEVEN_VOICE_ID).");
    }
    return vid;
}
/** Permite decidir em runtime se TTS está habilitado sem lançar erro. */
function isElevenEnabled() {
    return Boolean(process.env.ELEVEN_API_KEY ||
        process.env.ELEVENLABS_API_KEY ||
        process.env.ELEVEN_TOKEN);
}
/** aguardinha para backoff */
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
/* ──────────────────────────── TTS principal ──────────────────────────── */
/**
 * Gera áudio TTS usando ElevenLabs (preset CALMO).
 * - prosódia suave (stability ↑), pouca teatralidade (style ↓)
 * - mantém fidelidade de timbre (similarity_boost ↑)
 * - speaker_boost ligado para dar presença em celular
 */
async function generateAudio(text, voiceId) {
    // --- saneamento básico
    if (typeof text !== "string")
        throw new Error("Texto inválido para conversão em áudio.");
    const sanitized = text.replace(/\s+/g, " ").trim();
    if (!sanitized)
        throw new Error("Texto vazio após saneamento.");
    const limited = sanitized.slice(0, 2400); // limite seguro
    // validação lazy (só aqui)
    const ELEVEN_API_KEY = getApiKey();
    const vid = (voiceId || getDefaultVoiceId()).trim();
    // Para PT-BR, o v2 costuma soar mais natural.
    // (Se enviar trechos MUITO longos e quiser baratear, troque para eleven_turbo_v2_5)
    const model = process.env.ELEVEN_MODEL_ID || "eleven_multilingual_v2";
    const headers = new node_fetch_1.Headers({
        "xi-api-key": ELEVEN_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
    });
    // 🎚️ PRESET CALMO
    // - stability 0.65: mais estável (menos picos/emotividade)
    // - similarity 0.90: mantém o timbre fiel
    // - style 0.12: expressividade mínima, evita “atuado”
    // - speaker_boost: presença/clareza (bom p/ mobile)
    const body = {
        text: limited,
        model_id: model,
        voice_settings: {
            stability: 0.65,
            similarity_boost: 0.9,
            style: 0.12,
            use_speaker_boost: true,
        },
        // 128 kbps para ficar encorpado sem pesar demais
        output_format: "mp3_44100_128",
    };
    /**
     * Chama um endpoint (com ou sem /stream) com até 3 tentativas para 429/5xx.
     */
    const call = async (suffix) => {
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vid)}${suffix}`;
        let attempt = 0;
        const maxAttempts = 3;
        const backoff = [0, 600, 1500]; // ms
        while (attempt < maxAttempts) {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 30_000);
            try {
                const resp = await (0, node_fetch_1.default)(url, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(body),
                    signal: controller.signal,
                }).finally(() => clearTimeout(t));
                if (!resp.ok) {
                    const errText = await resp.text().catch(() => "");
                    const details = {
                        status: resp.status,
                        statusText: resp.statusText,
                        url,
                        model,
                        bodyPreview: errText.slice(0, 600),
                    };
                    console.error("[ElevenLabs ERROR]", details);
                    // Retentativas para limitação/transientes
                    if (resp.status === 429 || (resp.status >= 500 && resp.status <= 599)) {
                        if (attempt < maxAttempts - 1) {
                            await sleep(backoff[attempt + 1] || 1200);
                            attempt++;
                            continue;
                        }
                    }
                    if (resp.status === 401 || resp.status === 403) {
                        throw new Error("Chave inválida ou sem permissão de TTS na ElevenLabs.");
                    }
                    if (resp.status === 404)
                        throw new Error("VOICE_ID inválido/não encontrado.");
                    if (resp.status === 422)
                        throw new Error("Requisição inválida (texto vazio/curto ou parâmetros inconsistentes).");
                    const e = new Error(`ElevenLabs ${resp.status}: ${resp.statusText}`);
                    e.status = resp.status;
                    e.responseBody = details.bodyPreview;
                    throw e;
                }
                const buf = Buffer.from(await resp.arrayBuffer());
                if (!buf.length)
                    throw new Error("Resposta de áudio vazia.");
                return buf;
            }
            catch (err) {
                const transient = err?.name === "AbortError" ||
                    err?.code === "ECONNRESET" ||
                    err?.code === "ETIMEDOUT" ||
                    err?.status === 429 ||
                    (err?.status >= 500 && err?.status <= 599);
                if (transient && attempt < maxAttempts - 1) {
                    await sleep(backoff[attempt + 1] || 1200);
                    attempt++;
                    continue;
                }
                throw err;
            }
        }
        throw new Error("Falha ao obter áudio após múltiplas tentativas.");
    };
    // Primeiro tenta /stream; se 405, usa o endpoint legacy
    try {
        return await call("/stream");
    }
    catch (e) {
        if (e?.status === 405) {
            console.warn("⚠️ 405 no /stream, tentando endpoint legacy sem /stream…");
            return await call("");
        }
        throw e;
    }
}
//# sourceMappingURL=elevenlabsService.js.map