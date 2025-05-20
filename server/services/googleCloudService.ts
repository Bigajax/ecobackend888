// services/googleCloudService.ts

// Temporariamente desabilitado para depuração
// import { LanguageServiceClient, protos } from '@google-cloud/language';

// type SentimentAnalysisResult = any; // Tipo temporário para evitar erros em outros lugares
// type AnalyzeEmotionsResult = any; // Tipo temporário

// const languageClient = new LanguageServiceClient({
//   // credentials: {
//   //   apiKey: process.env.GOOGLE_CLOUD_API_KEY,
//   // },
// });

// export async function analyzeSentiment(text: string): Promise<SentimentAnalysisResult | null> {
//   console.warn('Google Cloud Language API desabilitada. Chamada a analyzeSentiment ignorada.');
//   return null; // Retorne null ou um valor padrão
// }

// export async function analyzeEmotions(text: string): Promise<AnalyzeEmotionsResult | null> {
//   console.warn('Google Cloud Language API desabilitada. Chamada a analyzeEmotions ignorada.');
//   return null; // Retorne null ou um valor padrão
// }

// Opcional: Manter as exportações se forem usadas em outros arquivos.
// export { analyzeSentiment, analyzeEmotions };