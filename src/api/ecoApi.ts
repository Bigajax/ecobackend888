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
    return response.data?.response; // Assumindo que seu back-end retorna a resposta em um objeto { response: '...' }
  } catch (error: any) {
    console.error('Erro ao comunicar com o back-end para a ECO:', error);
    throw error;
  }
};