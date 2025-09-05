import dotenv from "dotenv";
import fetch, { Headers } from "node-fetch";

dotenv.config(); // local lê .env; no Render as env vars já existem

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
const DEFAULT_VOICE_ID = process.env.ELEVEN_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel (fallback)

if (!ELEVEN_API_KEY) {
  throw new Error("❌ ELEVEN_API_KEY não está definida.");
}

/**
 * Gera áudio TTS usando ElevenLabs.
 * @param text    Texto a ser sintetizado
 * @param voiceId (opcional) override de voz por chamada; se omitido usa DEFAULT_VOICE_ID
 */
export async function generateAudio(text: string, voiceId?: string): Promise<Buffer> {
  // --- validação & saneamento do texto
  if (typeof text !== "string") throw new Error("Texto inválido para conversão em áudio.");
  const sanitized = text.replace(/\s+/g, " ").trim(); // remove quebras/duplicidades
  if (!sanitized) throw new Error("Texto vazio após saneamento.");
  const limited = sanitized.slice(0, 2000); // evita payloads gigantes (custo/latência)

  // PT-BR natural em curtas; turbo para longas (economiza)
  const model = limited.length > 300 ? "eleven_turbo_v2_5" : "eleven_multilingual_v2";
  const vid = (voiceId || DEFAULT_VOICE_ID).trim();

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${vid}`;

  // tipagem correta para HeadersInit
  const headers = new Headers({
    "xi-api-key": ELEVEN_API_KEY as string, // já garantimos acima que existe
    "Content-Type": "application/json",
    "Accept": "audio/mpeg",
  });

  const body = {
    text: limited,
    model_id: model,
    voice_settings: { stability: 0.45, similarity_boost: 0.85 },
    // mp3 leve o suficiente p/ web + menor tráfego
    output_format: "mp3_44100_64",
  };

  // timeout defensivo (evita request travada)
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25_000);

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => clearTimeout(t));

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.error("[ElevenLabs ERROR]", {
      status: resp.status,
      statusText: resp.statusText,
      voiceId: vid,
      model,
      responseBody: errText?.slice(0, 600),
    });

    if (resp.status === 401 || resp.status === 403) {
      throw new Error("Chave inválida ou sem permissão de 'Texto para fala' na ElevenLabs.");
    }
    if (resp.status === 404) throw new Error("VOICE_ID inválido/não encontrado.");
    if (resp.status === 422) throw new Error("Requisição inválida (texto vazio/curto ou parâmetros inconsistentes).");
    if (resp.status === 429) throw new Error("Rate limit atingido na ElevenLabs.");
    throw new Error(`Falha ElevenLabs (${resp.status}): ${errText || resp.statusText}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
