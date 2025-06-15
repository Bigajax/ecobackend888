import axios from 'axios';
import { v4 as uuidv4 } from 'uuid'; // se ainda não usa, instale: npm install uuid

interface Message {
  id?: string; // 🔹 adicionado
  role: string;
  content: string;
}

const API_BASE_URL = '/api';

export const enviarMensagemParaEco = async (
  userMessages: Message[],
  userName?: string,
  userId?: string
): Promise<string | undefined> => {
  try {
    // Garante que as últimas mensagens tenham IDs únicos
    const mensagensValidas: Message[] = userMessages
      .slice(-3)
      .filter(msg =>
        msg && typeof msg.role === 'string' && typeof msg.content === 'string' && msg.content.trim().length > 0
      )
      .map(msg => ({
        ...msg,
        id: msg.id || uuidv4() // 🔹 Garante que cada mensagem tenha ID
      }));

    if (!userId) {
      throw new Error('Usuário não autenticado. ID ausente.');
    }

    console.log('✅ Enviando mensagens para /api/ask-eco:', mensagensValidas);

    const response = await axios.post(`${API_BASE_URL}/ask-eco`, {
      mensagens: mensagensValidas,
      nome_usuario: userName,
      usuario_id: userId
    });

    if (response.status >= 200 && response.status < 300) {
      const resposta = response.data;
      if (resposta && typeof resposta.message === 'string') {
        return resposta.message;
      } else {
        console.warn('⚠️ Resposta inesperada:', resposta);
        throw new Error('Formato inválido na resposta da Eco.');
      }
    } else {
      throw new Error(response.data?.error || 'Erro inesperado da API /ask-eco');
    }
  } catch (error: any) {
    let errorMessage = 'Erro ao obter resposta da Eco.';

    if (axios.isAxiosError(error)) {
      if (error.response?.data?.error) {
        errorMessage = `Erro do servidor: ${error.response.data.error}`;
      } else if (error.response?.status) {
        errorMessage = `Erro HTTP ${error.response.status}: ${error.response.statusText}`;
      } else if (error.request) {
        errorMessage = 'Sem resposta do servidor. Verifique se o backend está ativo.';
      } else {
        errorMessage = error.message;
      }
    } else {
      errorMessage = error.message || 'Erro inesperado';
    }

    console.error('❌ [ECO API] Erro ao enviar mensagem:', errorMessage);
    throw new Error(errorMessage);
  }
};
