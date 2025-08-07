import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Gera embedding vetorial do texto usando OpenAI
 */
export async function gerarEmbeddingOpenAI(texto: any, origem?: string): Promise<number[]> {
  try {
    // 🧼 Conversão segura para string
    let textoConvertido: string;

    if (typeof texto === "string") {
      textoConvertido = texto.trim();
    } else if (texto != null && typeof texto.toString === "function") {
      textoConvertido = texto.toString().trim();
    } else {
      textoConvertido = "";
    }

    // ⚠️ Fallback para textos vazios ou inválidos
    if (!textoConvertido || textoConvertido.length < 3) {
      console.warn(`⚠️ Texto para embedding inválido${origem ? ` [${origem}]` : ""}. Usando placeholder.`);
      textoConvertido = "PLACEHOLDER EMBEDDING";
    }

    // 🔒 Corte de tamanho para evitar erro de input
    const textoParaEmbedding = textoConvertido.slice(0, 8000);

    // 📡 Chamada à OpenAI para gerar embedding
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: textoParaEmbedding
    });

    const embedding = response.data?.[0]?.embedding;

    // 🔍 Verificação de retorno válido
    if (!Array.isArray(embedding) || embedding.length < 128) {
      console.error(`❌ Embedding retornado inválido${origem ? ` [${origem}]` : ""}.`);
      throw new Error("Embedding não gerado ou incompleto.");
    }

    console.log(`📡 Embedding gerado com sucesso${origem ? ` [${origem}]` : ""}.`);
    return embedding;
  } catch (error: any) {
    console.error(`🚨 Erro ao gerar embedding${origem ? ` [${origem}]` : ""}:`, error.message || error);
    throw error;
  }
}

// Compatibilidade com nome antigo
export const embedTextoCompleto = gerarEmbeddingOpenAI;
