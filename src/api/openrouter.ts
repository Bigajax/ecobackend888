import axios from 'axios';

// Remova a linha que lê a chave do arquivo .env
// const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

export const askOpenRouter = async (messages: { role: string; content: string }[]) => {
  // Defina a chave da API diretamente para teste
  const apiKey = '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'; // Substitua SUA_CHAVE_DE_API pela sua chave real


  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-3.5-turbo',
        messages: messages,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`, // Use a variável apiKey
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://eco666.vercel.app' // Substitua pelo seu domínio completo
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (error: any) {
    console.error('Erro na OpenRouter:', error);
    if (error.response) {
      console.error('Dados da resposta de erro:', error.response.data);
      console.error('Status da resposta de erro:', error.response.status);
    }
    throw error;
  }
};
