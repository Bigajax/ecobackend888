import axios from 'axios';
import 'dotenv/config'; // Importe e configure dotenv

export const askOpenRouter = async (messages: { role: string; content: string }[]) => {
  const apiKey = process.env.OPENROUTER_API_KEY; // Acesse a variável de ambiente

  if (!apiKey) {
    console.error('Erro: A chave de API do OpenRouter não foi encontrada no arquivo .env');
    throw new Error('Chave de API do OpenRouter não configurada.');
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-3.5-turbo',
        messages: messages,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://eco666.vercel.app'
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (error: any) {
    console.error('Erro na OpenRouter:', error);
    throw error;
  }
};