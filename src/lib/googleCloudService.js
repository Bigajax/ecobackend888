// googleCloudService.js
const { LanguageServiceClient } = require('@google-cloud/language').v1;

// Instantiates a client
const languageClient = new LanguageServiceClient({
  credentials: {
    apiKey: process.env.GOOGLE_CLOUD_API_KEY, // Usando a chave de API do .env.local
  },
  // Se você optar por usar um arquivo de chave de serviço:
  // keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
});

async function analyzeSentiment(text) {
  const document = {
    content: text,
    type: 'PLAIN_TEXT',
  };

  try {
    const [result] = await languageClient.analyzeSentiment({ document: document });
    const sentiment = result.documentSentiment;
    console.log(`Sentiment: score = ${sentiment.score}, magnitude = ${sentiment.magnitude}`);
    return sentiment;
  } catch (error) {
    console.error('ERROR:', error);
    throw error;
  }
}

async function analyzeEmotions(text) {
  const document = {
    content: text,
    type: 'PLAIN_TEXT',
  };

  try {
    const [result] = await languageClient.analyzeSentiment({ document: document }); // Use analyzeSentiment para obter informações básicas de emoção (score e magnitude)
    // Para uma análise de emoção mais detalhada (atualmente em beta), você pode precisar usar outro método.
    // Consulte a documentação da Google Cloud Natural Language API para os métodos de análise de emoção.
    const sentiment = result.documentSentiment;
    return sentiment;
  } catch (error) {
    console.error('ERROR analyzing emotions:', error);
    throw error;
  }
}

module.exports = { analyzeSentiment, analyzeEmotions };