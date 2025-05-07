import axios from 'axios';

export const askOpenRouter = async (messages: { role: string; content: string }[]) => {
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
