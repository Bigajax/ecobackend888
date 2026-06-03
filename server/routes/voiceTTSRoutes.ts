import express from "express";
import { randomUUID } from "crypto";
import { pipeline } from "stream";
import { generateAudio, streamAudio } from "../services/elevenlabsService";

const router = express.Router();

const VOICE_FIXED = (process.env.ELEVEN_VOICE_ID || "e5WNhrdI30aXpS2RSGm1").trim();

function ttsKeyConfigured(): boolean {
  return Boolean(
    process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_TOKEN
  );
}

// Cache em memória para o fluxo de streaming: POST /tts/prepare guarda o texto e devolve um id;
// GET /tts/stream/:id streama o áudio. Permite tocar via <audio> nativo (progressive playback)
// começando assim que os primeiros bytes chegam. TTL curto evita vazamento.
const TTS_JOB_TTL_MS = 2 * 60 * 1000;
type TtsJob = { text: string; exp: number };
const ttsJobs = new Map<string, TtsJob>();

function pruneTtsJobs() {
  const now = Date.now();
  for (const [id, job] of ttsJobs) {
    if (job.exp <= now) ttsJobs.delete(id);
  }
}

/** Prepara o texto e devolve um id para streaming via GET. */
router.post("/tts/prepare", (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Campo 'text' é obrigatório." });
  }
  if (!ttsKeyConfigured()) {
    console.error("[TTS ERROR] ELEVEN_API_KEY não configurada no ambiente");
    return res.status(503).json({
      error: "Serviço TTS não configurado. Contate o administrador.",
      details: "Missing ELEVEN_API_KEY environment variable",
    });
  }
  pruneTtsJobs();
  const id = randomUUID();
  ttsJobs.set(id, { text: text.trim(), exp: Date.now() + TTS_JOB_TTL_MS });
  return res.status(200).json({ id });
});

/** Streama o MP3 por id (audio/mpeg chunked) — pipe direto da ElevenLabs, sem bufferizar. */
router.get("/tts/stream/:id", async (req, res) => {
  pruneTtsJobs();
  const id = String(req.params.id || "");
  const job = ttsJobs.get(id);
  if (!job) {
    return res.status(404).json({ error: "Áudio expirado ou inexistente. Gere novamente." });
  }
  if (!ttsKeyConfigured()) {
    return res.status(503).json({ error: "Serviço TTS não configurado." });
  }

  try {
    const { stream, voiceId } = await streamAudio(job.text, VOICE_FIXED);

    res.status(200);
    res.set({
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "x-voice-id": voiceId, // 👈 ajuda a depurar no Network
    });

    // Se o cliente desconectar (áudio terminou de bufferizar, player fechado, seek), para de puxar
    // da ElevenLabs — evita escrever num socket morto. `pipeline` cuida da limpeza dos dois lados e
    // NUNCA deixa um erro de stream não-tratado derrubar o processo (era a causa do "funcionou 1 vez
    // e depois Failed to fetch": o pipe crashava o servidor no fim do 1º áudio).
    const abortUpstream = () => {
      try {
        (stream as any).destroy?.();
      } catch {}
    };
    req.on("close", abortUpstream);

    pipeline(stream as any, res, (err: any) => {
      if (err) {
        // erros esperados quando o cliente fecha no meio: não são fatais.
        const code = err?.code || err?.message || err;
        console.warn("[TTS STREAM pipe finalizado]", code);
      }
    });
  } catch (e: any) {
    console.error("[TTS STREAM ERROR]", { message: e?.message || e, status: e?.status });
    if (e?.message?.includes("Chave inválida")) {
      return res.status(503).json({ error: "Serviço TTS indisponível (chave inválida)." });
    }
    if (e?.message?.includes("timeout") || e?.message?.includes("ElevenLabs")) {
      return res.status(504).json({ error: "ElevenLabs timeout. Tente novamente." });
    }
    return res.status(500).json({ error: e?.message || "Erro ao gerar áudio" });
  }
});

/** Gera TTS e retorna MP3 binário */
router.post("/tts", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Campo 'text' é obrigatório." });
    }

    // Validar se API key está configurada
    if (!process.env.ELEVEN_API_KEY && !process.env.ELEVENLABS_API_KEY && !process.env.ELEVEN_TOKEN) {
      console.error("[TTS ERROR] ELEVEN_API_KEY não configurada no ambiente");
      return res.status(503).json({
        error: "Serviço TTS não configurado. Contate o administrador.",
        details: "Missing ELEVEN_API_KEY environment variable"
      });
    }

    // Definir timeout de 20 segundos para não exceder o timeout do cliente
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("ElevenLabs API timeout (20s)")), 20000)
    );

    const audio = await Promise.race([
      generateAudio(text, VOICE_FIXED),
      timeoutPromise
    ]);

    res.set({
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "Content-Length": audio.length.toString(),
      "x-voice-id": VOICE_FIXED, // 👈 ajuda a depurar no Network
    });

    return res.status(200).send(audio);
  } catch (e: any) {
    console.error("[TTS ERROR]", {
      message: e?.message || e,
      status: e?.status,
      responseBody: e?.responseBody
    });

    // Retornar status apropriado baseado no erro (ordem importa: chave/permissão antes de timeout,
    // pois a msg de "Chave inválida ... na ElevenLabs" contém a palavra "ElevenLabs").
    if (e?.message?.includes("ELEVEN_API_KEY")) {
      return res.status(503).json({ error: "Serviço TTS indisponível (chave não configurada)." });
    }
    if (e?.message?.includes("Chave inválida")) {
      return res
        .status(503)
        .json({ error: "Serviço TTS indisponível (chave inválida, sem permissão de TTS ou sem créditos)." });
    }
    if (e?.message?.includes("VOICE_ID")) {
      return res.status(503).json({ error: "Serviço TTS indisponível (voz inválida)." });
    }
    if (e?.message?.includes("timeout") || e?.message?.includes("ElevenLabs")) {
      return res.status(504).json({ error: "ElevenLabs timeout. Tente novamente." });
    }

    return res.status(500).json({ error: e?.message || "Erro ao gerar áudio" });
  }
});

router.all("/tts", (_req, res) => {
  res.status(405).json({ error: "Método não permitido. Use POST em /api/voice/tts." });
});

export default router;
