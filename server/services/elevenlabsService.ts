import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
const VOICE_ID = process.env.ELEVEN_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // fallback Rachel

if (!ELEVEN_API_KEY) throw new Error("❌ ELEVEN_API_KEY não está definida.");

export async function generateAudio(text: string): Promise<Buffer> {
  if (!text || typeof text !== "string") throw new Error("Texto inválido para conversão em áudio.");

  // p/ reduzir custo em respostas longas
  const model = text.length > 300 ? "eleven_turbo_v2_5" : "eleven_multilingual_v2";

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
  const body = {
    text,
    model_id: model,
    voice_settings: { stability: 0.45, similarity_boost: 0.85 },
    output_format: "mp3_44100_64",
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVEN_API_KEY,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.error("[ElevenLabs ERROR]", {
      status: resp.status,
      statusText: resp.statusText,
      voiceId: VOICE_ID,
      model,
      body: errText,
    });

    // mensagens amigáveis por status
    if (resp.status === 401 || resp.status === 403) {
      throw new Error("Chave sem permissão ou inválida (verifique se 'Text to Speech' está habilitado na API Key da ElevenLabs).");
    }
    if (resp.status === 404) {
      throw new Error("VOICE_ID inválido/não encontrado.");
    }
    if (resp.status === 422) {
      throw new Error("Requisição inválida (texto vazio/curto demais ou parâmetros incorretos).");
    }
    if (resp.status === 429) {
      throw new Error("Rate limit atingido na ElevenLabs.");
    }
    throw new Error(`Falha ElevenLabs (${resp.status}): ${errText || resp.statusText}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
