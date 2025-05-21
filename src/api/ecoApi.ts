// C:\Users\Rafael\Desktop\eco5555\Eco666\src\api\ecoApi.ts

import axios from 'axios';

interface Message {
  role: string;
  content: string;
}

// A URL base deve ser definida como '/api' para que o proxy do Vite,
// configurado no vite.config.ts, intercepte as requisições e as
// redirecione corretamente para o seu backend em http://localhost:3001.
const API_BASE_URL = '/api'; 

export const enviarMensagemParaEco = async (
  userMessages: Message[], // Usando a interface Message para o array de mensagens
  userName?: string
): Promise<string | undefined> => {
  try {
    // A requisição será enviada para '/api/ask-gemini'.
    // O Vite irá interceptar '/api' e encaminhar para http://localhost:3001/api/ask-gemini
    const response = await axios.post(`${API_BASE_URL}/ask-gemini`, { 
      messages: userMessages,
      userName: userName,
    });

    if (response.status >= 200 && response.status < 300) {
      // O backend agora envia a resposta do Gemini no campo 'message'
      if (response.data && typeof response.data.message === 'string') {
        return response.data.message; 
      } else {
        console.error('Resposta da API Gemini mal formatada:', response.data);
        throw new Error('Resposta inesperada do servidor: Mensagem não encontrada.');
      }
    } else {
      // Se a resposta do backend indicar um erro (status fora do 2xx)
      const errorMessage = response.data?.error || 'Erro desconhecido ao comunicar com o back-end.';
      throw new Error(errorMessage);
    }
  } catch (error: any) {
    console.error('Erro ao comunicar com o back-end para a ECO (via Gemini):', error);
    let errorMessage = 'Ocorreu um erro ao obter a resposta da ECO.';
    // Verificações mais detalhadas para erros do Axios
    if (axios.isAxiosError(error)) {
      if (error.response?.data?.error) {
        // Erro específico retornado pelo seu backend
        errorMessage = `Erro do servidor: ${error.response.data.error}`;
      } else if (error.response?.status) {
        // Erro HTTP genérico com status
        errorMessage = `Erro do servidor (status ${error.response.status}): ${error.response.statusText || 'Resposta inesperada'}`;
      } else if (error.request) {
        // A requisição foi feita, mas não houve resposta (problema de rede/servidor offline)
        errorMessage = `Erro de rede: Nenhuma resposta recebida do servidor. Verifique se o backend está rodando em http://localhost:3001. Detalhes: ${error.message}`;
      } else {
        // Erro na configuração da requisição
        errorMessage = `Erro na requisição: ${error.message}`;
      }
    } else {
      // Outros tipos de erros (ex: erro no código do frontend)
      errorMessage = `Erro inesperado: ${error.message || error.toString()}`;
    }
    throw new Error(errorMessage);
  }
};