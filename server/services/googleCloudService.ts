import { LanguageServiceClient } from '@google-cloud/language';
import { protos } from '@google-cloud/language';
type SentimentAnalysisResult = protos.google.cloud.language.v1.AnalyzeSentimentResponse.IDocumentSentiment;

// Instantiates a client
const languageClient = new LanguageServiceClient({
  credentials: {
    apiKey: process.env.GOOGLE_CLOUD_API_KEY, // Usando a chave de API do .env do servidor
  },
  // Se você optar por usar um arquivo de chave de serviço:
  // keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
});

async function analyzeSentiment(text: string): Promise<SentimentAnalysisResult> {
  const document = {
    content: text,
    type: 'PLAIN_TEXT' as const, // 'as const' para inferir um tipo literal
  };

  try {
    const [result] = await languageClient.analyzeSentiment({ document: document });
    const sentiment: SentimentAnalysisResult = result.documentSentiment!; // '!' indica que sabemos que não será null/undefined
    console.log(`Sentiment: score = ${sentiment.score}, magnitude = ${sentiment.magnitude}`);
    return sentiment;
  } catch (error: any) { // 'any' pode ser substituído por um tipo de erro mais específico se souber qual é
    console.error('ERROR:', error);
    throw error;
  }
}

async function analyzeEmotions(text: string): Promise<SentimentAnalysisResult> {
  const document = {
    content: text,
    type: 'PLAIN_TEXT' as const,
  };

  try {
    const [result] = await languageClient.analyzeSentiment({ document: document }); // Use analyzeSentiment para obter informações básicas de emoção (score e magnitude)
    // Para uma análise de emoção mais detalhada (atualmente em beta), você pode precisar usar outro método.
    // Consulte a documentação da Google Cloud Natural Language API para os métodos de análise de emoção.
    const sentiment: SentimentAnalysisResult = result.documentSentiment!;
    return sentiment;
  } catch (error: any) {
    console.error('ERROR analyzing emotions:', error);
    throw error;
  }
}

module.exports = { analyzeSentiment, analyzeEmotions };