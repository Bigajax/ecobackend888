// server/src/services/elevenlabsService.ts
import dotenv from "dotenv";
import fetch, { Headers } from "node-fetch";

dotenv.config();

/* ───────────────────────── helpers de env (lazy) ───────────────────────── */

function getApiKey(): string {
  const key =
    process.env.ELEVEN_API_KEY ||
    process.env.ELEVENLABS_API_KEY ||
    process.env.ELEVEN_TOKEN ||
    "";
  if (!key) {
    throw new Error(
      "ELEVEN_API_KEY não configurada. Defina ELEVEN_API_KEY (ou ELEVENLABS_API_KEY/ELEVEN_TOKEN) nas variáveis de ambiente."
    );
  }
  return key.trim();
}

function getDefaultVoiceId(): string {
  // sua voz padrão (PT-BR) — ajuste o ID se quiser
  const vid = (process.env.ELEVEN_VOICE_ID || "e5WNhrdI30aXpS2RSGm1").trim();
  if (!vid) {
    throw new Error("VOICE_ID vazio/inválido (ELEVEN_VOICE_ID).");
  }
  return vid;
}

/** Permite decidir em runtime se TTS está habilitado sem lançar erro. */
export function isElevenEnabled(): boolean {
  return Boolean(
    process.env.ELEVEN_API_KEY ||
      process.env.ELEVENLABS_API_KEY ||
      process.env.ELEVEN_TOKEN
  );
}

/** aguardinha para backoff */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ──────────────────────────── TTS principal ──────────────────────────── */
/**
 * Gera áudio TTS usando ElevenLabs (preset CALMO).
 * - prosódia suave (stability ↑), pouca teatralidade (style ↓)
 * - mantém fidelidade de timbre (similarity_boost ↑)
 * - speaker_boost ligado para dar presença em celular
 */
export async function generateAudio(
  text: string,
  voiceId?: string
): Promise<Buffer> {
  // --- saneamento básico
  if (typeof text !== "string") throw new Error("Texto inválido para conversão em áudio.");
  const sanitized = text.replace(/\s+/g, " ").trim();
  if (!sanitized) throw new Error("Texto vazio após saneamento.");
  const limited = sanitized.slice(0, 2400); // limite seguro

  // validação lazy (só aqui)
  const ELEVEN_API_KEY = getApiKey();
  const vid = (voiceId || getDefaultVoiceId()).trim();

  // Para PT-BR, o v2 costuma soar mais natural.
  // (Se enviar trechos MUITO longos e quiser baratear, troque para eleven_turbo_v2_5)
  const model = process.env.ELEVEN_MODEL_ID || "eleven_multilingual_v2";

  const headers = new Headers({
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
  const call = async (suffix: string) => {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
      vid
    )}${suffix}`;

    let attempt = 0;
    const maxAttempts = 3;
    const backoff = [0, 600, 1500]; // ms

    while (attempt < maxAttempts) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 30_000);

      try {
        const resp = await fetch(url, {
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
          if (resp.status === 404) throw new Error("VOICE_ID inválido/não encontrado.");
          if (resp.status === 422)
            throw new Error(
              "Requisição inválida (texto vazio/curto ou parâmetros inconsistentes)."
            );

          const e: any = new Error(`ElevenLabs ${resp.status}: ${resp.statusText}`);
          e.status = resp.status;
          e.responseBody = details.bodyPreview;
          throw e;
        }

        const buf = Buffer.from(await resp.arrayBuffer());
        if (!buf.length) throw new Error("Resposta de áudio vazia.");
        return buf;
      } catch (err: any) {
        const transient =
          err?.name === "AbortError" ||
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
  } catch (e: any) {
    if (e?.status === 405) {
      console.warn("⚠️ 405 no /stream, tentando endpoint legacy sem /stream…");
      return await call("");
    }
    throw e;
  }
}

/* ──────────────────────────── TTS streaming ──────────────────────────── */
/**
 * Igual a generateAudio (mesmo preset CALMO/modelo), mas devolve o STREAM de áudio da ElevenLabs
 * em vez de bufferizar tudo. Permite tocar o som assim que os primeiros bytes chegam (sem esperar a
 * síntese inteira nem estourar timeout em textos longos). O timeout vale só até a resposta começar
 * (TTFB); depois o stream flui livre.
 */
export async function streamAudio(
  text: string,
  voiceId?: string
): Promise<{ stream: NodeJS.ReadableStream; voiceId: string }> {
  if (typeof text !== "string") throw new Error("Texto inválido para conversão em áudio.");
  const sanitized = text.replace(/\s+/g, " ").trim();
  if (!sanitized) throw new Error("Texto vazio após saneamento.");
  const limited = sanitized.slice(0, 2400);

  const ELEVEN_API_KEY = getApiKey();
  const vid = (voiceId || getDefaultVoiceId()).trim();
  const model = process.env.ELEVEN_MODEL_ID || "eleven_multilingual_v2";

  const headers = new Headers({
    "xi-api-key": ELEVEN_API_KEY,
    "Content-Type": "application/json",
    Accept: "audio/mpeg",
  });

  const body = {
    text: limited,
    model_id: model,
    voice_settings: {
      stability: 0.65,
      similarity_boost: 0.9,
      style: 0.12,
      use_speaker_boost: true,
    },
    output_format: "mp3_44100_128",
  };

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vid)}/stream`;

  let attempt = 0;
  const maxAttempts = 3;
  const backoff = [0, 600, 1500]; // ms

  while (attempt < maxAttempts) {
    // timeout só até os headers da resposta chegarem; o corpo (stream) flui sem abortar.
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15_000);

    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(t);
      const transient =
        err?.name === "AbortError" || err?.code === "ECONNRESET" || err?.code === "ETIMEDOUT";
      if (transient && attempt < maxAttempts - 1) {
        await sleep(backoff[attempt + 1] || 1200);
        attempt++;
        continue;
      }
      throw err;
    }
    clearTimeout(t);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("[ElevenLabs STREAM ERROR]", {
        status: resp.status,
        statusText: resp.statusText,
        url,
        model,
        bodyPreview: errText.slice(0, 600),
      });

      if ((resp.status === 429 || (resp.status >= 500 && resp.status <= 599)) && attempt < maxAttempts - 1) {
        await sleep(backoff[attempt + 1] || 1200);
        attempt++;
        continue;
      }
      if (resp.status === 401 || resp.status === 403)
        throw new Error("Chave inválida ou sem permissão de TTS na ElevenLabs.");
      if (resp.status === 404) throw new Error("VOICE_ID inválido/não encontrado.");
      if (resp.status === 422)
        throw new Error("Requisição inválida (texto vazio/curto ou parâmetros inconsistentes).");

      const e: any = new Error(`ElevenLabs ${resp.status}: ${resp.statusText}`);
      e.status = resp.status;
      e.responseBody = errText.slice(0, 600);
      throw e;
    }

    if (!resp.body) throw new Error("Stream de áudio vazio.");
    return { stream: resp.body as unknown as NodeJS.ReadableStream, voiceId: vid };
  }

  throw new Error("Falha ao obter áudio (stream) após múltiplas tentativas.");
}
