import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Pequeno util de espera para backoff
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Gera embedding vetorial do texto usando OpenAI.
 * - Se `texto` já for um vetor (number[]), retorna como está (evita recomputar).
 */
export async function gerarEmbeddingOpenAI(
  texto: unknown,
  origem?: string
): Promise<number[]> {
  try {
    // 1) Se já veio embedding, só valida e retorna
    if (Array.isArray(texto) && texto.every((x) => typeof x === "number")) {
      if (texto.length < 128) {
        console.warn(
          `⚠️ Embedding recebido muito curto${origem ? ` [${origem}]` : ""} (${texto.length} dimensões).`
        );
      }
      return texto as number[];
    }

    // 2) Conversão segura para string
    let textoConvertido = "";
    if (typeof texto === "string") {
      textoConvertido = texto.trim();
    } else if (texto != null && typeof (texto as any).toString === "function") {
      textoConvertido = (texto as any).toString().trim();
    }

    // 3) Fallback para textos vazios/curtos
    if (!textoConvertido || textoConvertido.length < 3) {
      console.warn(
        `⚠️ Texto para embedding inválido${
          origem ? ` [${origem}]` : ""
        }. Usando placeholder.`
      );
      textoConvertido = "PLACEHOLDER EMBEDDING";
    }

    // 4) Normalização leve + corte pra evitar inputs gigantes
    const textoParaEmbedding = textoConvertido
      .replace(/\s+/g, " ")
      .slice(0, 8000);

    // 5) Chamada à OpenAI com retries (429/5xx)
    const maxTries = 3;
    let lastErr: any = null;

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        const response = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: textoParaEmbedding,
        });

        const embedding = response.data?.[0]?.embedding;

        if (!Array.isArray(embedding) || embedding.length < 128) {
          throw new Error("Embedding não gerado ou incompleto.");
        }

        console.log(
          `📡 Embedding gerado com sucesso${
            origem ? ` [${origem}]` : ""
          } (dim=${embedding.length}).`
        );
        return embedding;
      } catch (err: any) {
        lastErr = err;
        const status = err?.status || err?.response?.status;
        const retriable = status === 429 || (status >= 500 && status < 600);
        console.warn(
          `⚠️ Falha ao gerar embedding (tentativa ${attempt}/${maxTries})${
            origem ? ` [${origem}]` : ""
          } — status: ${status ?? "n/a"} — ${err?.message || err}`
        );
        if (attempt < maxTries && retriable) {
          const wait = 400 * attempt; // backoff linear simples
          await sleep(wait);
          continue;
        }
        break;
      }
    }

    // Se chegou aqui, esgotou retries
    throw lastErr ?? new Error("Falha desconhecida ao gerar embedding.");
  } catch (error: any) {
    console.error(
      `🚨 Erro ao gerar embedding${origem ? ` [${origem}]` : ""}:`,
      error?.message || error
    );
    throw error;
  }
}

// Compat: nome antigo
export const embedTextoCompleto = gerarEmbeddingOpenAI;
