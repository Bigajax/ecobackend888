// server/src/services/elevenlabsService.ts
import dotenv from "dotenv";
import fetch, { Headers } from "node-fetch";

dotenv.config();

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
const DEFAULT_VOICE_ID = (process.env.ELEVEN_VOICE_ID || "Hgfor6xcJTM3hCSKmChL").trim(); // PT-BR favorita

if (!ELEVEN_API_KEY) {
  throw new Error("❌ ELEVEN_API_KEY não está definida.");
}

/**
 * Pequeno util para aguardar (backoff)
 */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Gera áudio TTS usando ElevenLabs.
 * @param text    Texto a ser sintetizado
 * @param voiceId (opcional) override de voz por chamada; se omitido usa DEFAULT_VOICE_ID
 */
export async function generateAudio(text: string, voiceId?: string): Promise<Buffer> {
  // --- validação & saneamento do texto
  if (typeof text !== "string") throw new Error("Texto inválido para conversão em áudio.");
  const sanitized = text.replace(/\s+/g, " ").trim();
  if (!sanitized) throw new Error("Texto vazio após saneamento.");
  const limited = sanitized.slice(0, 2400); // limite seguro

  // Para PT-BR a prosódia costuma ficar melhor no multilingual_v2
  const model = "eleven_multilingual_v2";

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
    voice_settings: {
      stability: 0.4,
      similarity_boost: 0.9,
      style: 0.3,              // um pouco de expressividade
      use_speaker_boost: true, // 🔊 reforça presença sem distorcer
    },
    // Sobe o bitrate para dar mais "corpo" à voz
    output_format: "mp3_44100_128",
  };

  /**
   * Chama um endpoint (com ou sem /stream) com até 3 tentativas para 429/5xx.
   */
  const call = async (suffix: string) => {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${vid}${suffix}`;

    let attempt = 0;
    const maxAttempts = 3;

    // backoff em ms (exponencial simples)
    const backoff = [0, 600, 1500];

    while (attempt < maxAttempts) {
      // timeout defensivo
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

          // Erros que valem retry
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
          if (resp.status === 404) {
            throw new Error("VOICE_ID inválido/não encontrado.");
          }
          if (resp.status === 422) {
            throw new Error("Requisição inválida (texto vazio/curto ou parâmetros inconsistentes).");
          }

          // Para 405 especificamente, deixamos o caller decidir o fallback
          const e: any = new Error(`ElevenLabs ${resp.status}: ${resp.statusText}`);
          e.status = resp.status;
          e.responseBody = details.bodyPreview;
          throw e;
        }

        const buf = Buffer.from(await resp.arrayBuffer());
        if (!buf.length) throw new Error("Resposta de áudio vazia.");
        return buf;
      } catch (err: any) {
        // Abort, rede, etc. Se ainda temos tentativas, tenta novamente
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

  // Primeiro tentamos o endpoint recomendado (/stream). Se der 405, cai no legacy (sem /stream).
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
