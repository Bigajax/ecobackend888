// services/elevenlabsService.ts
import 'dotenv/config';

// Se preferir manter node-fetch, troque as 2 linhas acima por:
// import dotenv from "dotenv"; dotenv.config();
// import fetch, { Headers } from "node-fetch";

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
const DEFAULT_VOICE_ID = (process.env.ELEVEN_VOICE_ID || "21m00Tcm4TlvDq8ikWAM").trim(); // Rachel
const DEFAULT_MODEL_SHORT = process.env.ELEVEN_MODEL_SHORT || "eleven_multilingual_v2";
const DEFAULT_MODEL_LONG  = process.env.ELEVEN_MODEL_LONG  || "eleven_turbo_v2_5";

if (!ELEVEN_API_KEY) {
  throw new Error("❌ ELEVEN_API_KEY não está definida.");
}

type OutputFmt =
  | "mp3_44100_128"
  | "mp3_44100_192"
  | "mp3_44100_320"
  | "wav_44100"
  | "pcm_16000";

// Utilitário de fetch com timeout
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? 40000); // 40s
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function pickModel(textLen: number) {
  // curto = mais natural; longo = mais barato/veloz
  return textLen > 300 ? DEFAULT_MODEL_LONG : DEFAULT_MODEL_SHORT;
}

async function callElevenLabs({
  text,
  voiceId,
  modelId,
  output,
}: {
  text: string;
  voiceId: string;
  modelId: string;
  output: OutputFmt;
}): Promise<Response> {
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const headers: HeadersInit = {
    "xi-api-key": ELEVEN_API_KEY as string,
    "Content-Type": "application/json",
    "Accept": output.startsWith("mp3") ? "audio/mpeg" : "*/*",
  };

  const body = {
    text,
    model_id: modelId,
    voice_settings: {
      stability: 0.45,
      similarity_boost: 0.85,
      // style/use_speaker_boost podem ser adicionados se quiser
    },
    output_format: output,
  };

  return fetchWithTimeout(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    timeoutMs: 40000,
  });
}

/**
 * Gera áudio TTS usando ElevenLabs, com fallback automático de formato e 1 retry em 429/5xx.
 */
export async function generateAudio(text: string, voiceId?: string): Promise<Buffer> {
  if (typeof text !== "string") throw new Error("Texto inválido para conversão em áudio.");
  const sanitized = text.replace(/\s+/g, " ").trim();
  if (!sanitized) throw new Error("Texto vazio após saneamento.");

  // Limite de segurança para latência/custo (ajuste à vontade)
  const limited = sanitized.slice(0, 4000);

  const vid = (voiceId || DEFAULT_VOICE_ID).trim();
  const model = pickModel(limited.length);

  // Tenta primeiro mp3_44100_128, e só cai fora se não der
  let output: OutputFmt = "mp3_44100_128";

  const tryOnce = async (): Promise<Response> => {
    const resp = await callElevenLabs({ text: limited, voiceId: vid, modelId: model, output });
    if (!resp.ok) {
      // Log curto
      let errBody = "";
      try { errBody = (await resp.text()).slice(0, 600); } catch {}
      // Map de erros mais amigável
      if (resp.status === 401 || resp.status === 403) {
        throw new Error("Chave inválida ou sem permissão de 'Texto para fala' na ElevenLabs.");
      }
      if (resp.status === 404) throw new Error("VOICE_ID inválido/não encontrado.");
      if (resp.status === 422) throw new Error(`Requisição inválida (modelo/formato/texto). Body: ${errBody}`);
      if (resp.status === 429) throw new Error("Rate limit atingido na ElevenLabs (tente novamente).");
      if (resp.status >= 500) throw new Error(`ElevenLabs temporariamente indisponível (${resp.status}).`);
      throw new Error(`Falha ElevenLabs (${resp.status}): ${errBody || resp.statusText}`);
    }
    return resp;
  };

  // 1ª tentativa
  try {
    const r1 = await tryOnce();
    const buf1 = Buffer.from(await r1.arrayBuffer());
    if (buf1.length === 0) throw new Error("Recebi áudio vazio da ElevenLabs.");
    return buf1;
  } catch (e: any) {
    // Se for erro de 422 (p.ex., formato), tenta fallback de formato
    if ((e?.message || "").includes("422")) {
      output = "mp3_44100_128"; // já está, mas mantemos a semântica do fallback
    }
    // 1 retry simples em 429/5xx
    if (
      /(temporariamente indisponível|Rate limit)/i.test(e?.message || "")
    ) {
      await new Promise((r) => setTimeout(r, 800)); // backoff curto
      const r2 = await tryOnce();
      const buf2 = Buffer.from(await r2.arrayBuffer());
      if (buf2.length === 0) throw new Error("Recebi áudio vazio da ElevenLabs (retry).");
      return buf2;
    }
    // Senão, propaga
    throw e;
  }
}
