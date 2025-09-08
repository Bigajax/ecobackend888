import dotenv from "dotenv";
import fetch, { Headers } from "node-fetch";

dotenv.config();

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
const DEFAULT_VOICE_ID =
  (process.env.ELEVEN_VOICE_ID || "21m00Tcm4TlvDq8ikWAM").trim(); // Rachel

if (!ELEVEN_API_KEY) {
  throw new Error("❌ ELEVEN_API_KEY não está definida.");
}

export async function generateAudio(text: string, voiceId?: string): Promise<Buffer> {
  // --- validação & saneamento do texto
  if (typeof text !== "string") throw new Error("Texto inválido para conversão em áudio.");
  const sanitized = text.replace(/\s+/g, " ").trim();
  if (!sanitized) throw new Error("Texto vazio após saneamento.");
  const limited = sanitized.slice(0, 2000);

  // modelo conforme tamanho
  const model = limited.length > 300 ? "eleven_turbo_v2_5" : "eleven_multilingual_v2";

  const vid = (voiceId || DEFAULT_VOICE_ID || "").trim();
  if (!vid) throw new Error("VOICE_ID vazio/inválido.");

  const headers = new Headers({
    "xi-api-key": ELEVEN_API_KEY!,
    "Content-Type": "application/json",
    Accept: "audio/mpeg",
  });

  const body = {
    text: limited,
    model_id: model,
    voice_settings: { stability: 0.45, similarity_boost: 0.85 },
    output_format: "mp3_44100_64",
  };

  const call = async (suffix: string) => {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${vid}${suffix}`;
    // timeout defensivo
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
      const e: any = new Error(`ElevenLabs ${resp.status}: ${resp.statusText}`);
      e.status = resp.status;
      e.url = url;
      e.body = errText.slice(0, 600);
      // Log útil no server
      console.error("[ElevenLabs ERROR]", {
        status: resp.status,
        statusText: resp.statusText,
        url,
        model,
        bodyPreview: e.body,
      });
      throw e;
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length) throw new Error("Resposta de áudio vazia.");
    return buf;
  };

  // Tenta endpoint recomendado /stream; se 405, cai pro “legacy”
  try {
    return await call("/stream");
  } catch (e: any) {
    if (e?.status === 405) {
      console.warn("⚠️ 405 no /stream, tentando endpoint legacy sem /stream…");
      return await call("");
    }
    throw e;
  }
}
