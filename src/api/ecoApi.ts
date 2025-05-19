import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'; // Ajuste a URL base da sua API

export const enviarMensagemParaEco = async (
  userMessages: { role: string; content: string }[],
  userName?: string
): Promise<string | undefined> => {
  try {
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