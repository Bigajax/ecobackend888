"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.speechToText = exports.textToSpeech = void 0;
// server/services/elevenlabsService.ts
const elevenlabs_1 = require("elevenlabs");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
    console.error('Erro: A chave de API do Eleven Labs não foi encontrada nas variáveis de ambiente.');
}
const elevenlabs = new elevenlabs_1.ElevenLabsClient({
    apiKey: apiKey,
});
const ECO_VOICE_ID = '21m00Tzpb8CflqYdJpP1';
const textToSpeech = async (text) => {
    if (!apiKey) {
        throw new Error('Eleven Labs API Key não configurada.');
    }
    console.log('Convertendo texto para fala com Eleven Labs...');
    try {
        const audio = await elevenlabs.generate({
            voice: ECO_VOICE_ID,
            text: text,
            model_id: "eleven_multilingual_v2",
        });
        return audio;
    }
    catch (error) {
        console.error('Erro ao converter texto para fala com Eleven Labs:', error);
        throw error;
    }
};
exports.textToSpeech = textToSpeech;
const speechToText = async (audioBuffer, mimeType) => {
    if (!apiKey) {
        throw new Error('Eleven Labs API Key não configurada.');
    }
    console.log('Convertendo fala para texto com Eleven Labs...');
    try {
        const transcription = await elevenlabs.speechToText.convert({
            file: new Blob([audioBuffer], { type: mimeType }),
            model_id: "eleven_multilingual_v2", // ADDED: Required for Speech-to-Text conversion
        });
        return transcription.text;
    }
    catch (error) {
        console.error('Erro ao converter fala para texto com Eleven Labs:', error);
        throw error;
    }
};
exports.speechToText = speechToText;
//# sourceMappingURL=elevenlabsService.js.map