import axios from 'axios';

export const askOpenRouter = async (messages: { role: string; content: string }[]) => {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY; // Acesse a variável de ambiente do Vite

  if (!apiKey) {
    console.error('Erro: A chave de API do OpenRouter não foi encontrada nas variáveis de ambiente.');
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

    if (response.data && response.data.choices && response.data.choices.length > 0 && response.data.choices[0].message && response.data.choices[0].message.content) {
      return response.data.choices[0].message.content;
    } else {
      console.error('Erro: Estrutura de resposta da OpenRouter inesperada:', response.data);
      throw new Error('Estrutura de resposta da OpenRouter inválida.');
    }

  } catch (error: any) {
    console.error('Erro na OpenRouter:', error);
    throw error;
  }
};