import axios from 'axios';

// Lê a chave de API do arquivo .env
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
console.log("Chave de API usada na requisição:", OPENROUTER_API_KEY);

export const askOpenRouter = async (prompt: string) => {
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          // Usa a chave de API lida do .env no header de autorização
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (error: any) { // Adicionei o tipo 'any' para o erro
    console.error('Erro na OpenRouter:', error);
    return 'Erro ao consultar a IA.';
  }
};