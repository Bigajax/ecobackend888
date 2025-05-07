import axios from 'axios';

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
console.log("Chave de API lida do .env:", OPENROUTER_API_KEY);

export const askOpenRouter = async (messages: { role: string; content: string }[]) => {
  console.log("Mensagens recebidas por askOpenRouter:", messages);
  console.log("Valor de OPENROUTER_API_KEY antes da requisição:", OPENROUTER_API_KEY);

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-3.5-turbo',
        messages: messages,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'eco666.vercel.app' // Adicione esta linha com o seu domínio
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
    throw error; // É importante lançar o erro novamente para que ele possa ser tratado no componente ChatPage
  }
};