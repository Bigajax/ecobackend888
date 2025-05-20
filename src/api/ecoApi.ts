// C:\Users\Rafael\Desktop\eco5555\Eco666\src\api\ecoApi.ts

import axios from 'axios';

// A URL base deve ser definida como '/api' para que o proxy do Vite,
// configurado no vite.config.ts, intercepte as requisições e as
// redirecione corretamente para o seu backend em http://localhost:3001.
// Removendo a fallback para 'http://localhost:5000/api' para evitar
// a conexão direta com a porta errada.
const API_BASE_URL = '/api'; 

export const enviarMensagemParaEco = async (
  userMessages: { role: string; content: string }[],
  userName?: string
): Promise<string | undefined> => {
  try {
    // A requisição será enviada para '/api/ask-eco'.
    // O Vite irá intereceptar '/api' e encaminhar para http://localhost:3001/ask-eco
    const response = await axios.post(`${API_BASE_URL}/ask-eco`, { 
      messages: userMessages,
      userName: userName,
    });

    if (response.status >= 200 && response.status < 300) {
      return response.data?.response;
    } else {
      // Se a resposta do backend indicar um erro (status fora do 2xx)
      const errorMessage = response.data?.error || 'Erro desconhecido ao comunicar com o back-end.';
      throw new Error(errorMessage);
    }
  } catch (error: any) {
    console.error('Erro ao comunicar com o back-end para a ECO:', error);
    let errorMessage = 'Ocorreu um erro ao obter a resposta da ECO.';
    if (error.response?.data?.error) {
      errorMessage = `Erro do servidor: ${error.response.data.error}`;
    } else if (error.message) {
      errorMessage = `Erro na requisição: ${error.message}`;
    }
    throw new Error(errorMessage);
  }
};