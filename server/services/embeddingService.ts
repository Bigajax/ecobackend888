import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Função para gerar embedding completo a partir de um texto.
// Texto base = mensagem original + resumo_eco + analise_resumo
export async function embedTextoCompleto(texto: string, origem?: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: texto.slice(0, 8000) // segurança contra limite de tokens
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
