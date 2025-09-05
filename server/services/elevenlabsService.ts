import dotenv from "dotenv";
import fetch, { Headers } from "node-fetch";

dotenv.config(); // local lê .env; no Render as env vars já existem

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
const VOICE_ID = process.env.ELEVEN_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel fallback

if (!ELEVEN_API_KEY) {
  throw new Error("❌ ELEVEN_API_KEY não está definida.");
}

export async function generateAudio(text: string): Promise<Buffer> {
  if (!text || typeof text !== "string") {
    throw new Error("Texto inválido para conversão em áudio.");
  }

  // PT-BR mais natural em respostas curtas; turbo para longas (custo/latência)
  const model = text.length > 300 ? "eleven_turbo_v2_5" : "eleven_multilingual_v2";

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

  // ✅ Tipagem correta para HeadersInit
  const headers = new Headers({
    "xi-api-key": ELEVEN_API_KEY as string,
    "Content-Type": "application/json",
    "Accept": "audio/mpeg",
  });

  const body = {
    text,
    model_id: model,
    voice_settings: { stability: 0.45, similarity_boost: 0.85 },
    output_format: "mp3_44100_64", // leve p/ web e reduz tráfego/custo
  };

  const resp = await fetch(url, {
    method: "POST",
    headers,
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

    if (resp.status === 401 || resp.status === 403) {
      throw new Error(
        "Chave inválida ou sem permissão. Verifique se a API key tem 'Texto para fala' habilitado."
      );
    }
    if (resp.status === 404) throw new Error("VOICE_ID inválido ou inexistente.");
    if (resp.status === 422) throw new Error("Requisição inválida (texto vazio/curto ou parâmetros).");
    if (resp.status === 429) throw new Error("Rate limit atingido na ElevenLabs.");
    throw new Error(`Falha ElevenLabs (${resp.status}): ${errText || resp.statusText}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
