import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Principal (nome padrão novo)
export async function gerarEmbeddingOpenAI(texto: string, origem?: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: texto.slice(0, 8000)
    });

    const embedding = response.data?.[0]?.embedding;

    if (!embedding) {
      console.error(`❌ Nenhum embedding retornado pela API da OpenAI.${origem ? ` [${origem}]` : ""}`);
      throw new Error("Embedding não gerado.");
    }

    console.log(`📡 Embedding gerado com sucesso${origem ? ` [${origem}]` : ""}.`);
    return embedding;
  } catch (error: any) {
    console.error(`🚨 Erro ao gerar embedding${origem ? ` [${origem}]` : ""}:`, error.message || error);
    throw error;
  }
}

// Alias para compatibilidade com outros arquivos que ainda usam o nome antigo
export const embedTextoCompleto = gerarEmbeddingOpenAI;
