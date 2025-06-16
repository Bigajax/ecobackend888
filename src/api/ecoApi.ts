import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabaseClient';

interface Message {
  id?: string;
  role: string;
  content: string;
}

const API_BASE_URL = '/api';

/**
 * Envia mensagens para a rota /api/ask-eco usando JWT do Supabase.
 */
export const enviarMensagemParaEco = async (
  userMessages: Message[],
  userName?: string,
  userId?: string
): Promise<string | undefined> => {
  try {
    /* ------------------------------------------------------------------ */
    /*  1. Validação de entrada                                           */
    /* ------------------------------------------------------------------ */
    if (!userId) {
      throw new Error('Usuário não autenticado. ID ausente.');
    }

    const mensagensValidas: Message[] = userMessages
      .slice(-3) // envia as 3 últimas
      .filter(
        (msg) =>
          msg &&
          typeof msg.role === 'string' &&
          typeof msg.content === 'string' &&
          msg.content.trim().length > 0
      )
      .map((msg) => ({
        ...msg,
        id: msg.id || uuidv4(),
      }));

    /* ------------------------------------------------------------------ */
    /*  2. Recupera JWT do Supabase                                       */
    /* ------------------------------------------------------------------ */
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.access_token) {
      throw new Error('Token de acesso ausente. Faça login novamente.');
    }

    /* ------------------------------------------------------------------ */
    /*  3. Chamada à API                                                  */
    /* ------------------------------------------------------------------ */
    console.log('✅ Enviando mensagens para /api/ask-eco:', mensagensValidas);

    const response = await axios.post(
      `${API_BASE_URL}/ask-eco`,
      {
        mensagens: mensagensValidas,      // <- backend espera "messages"
        nome_usuario: userName,
        usuario_id: userId,
      },
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    /* ------------------------------------------------------------------ */
    /*  4. Trata resposta                                                 */
    /* ------------------------------------------------------------------ */
    if (response.status >= 200 && response.status < 300) {
      const resposta = response.data;
      if (resposta && typeof resposta.message === 'string') {
        return resposta.message;
      }
      console.warn('⚠️ Resposta inesperada:', resposta);
      throw new Error('Formato inválido na resposta da Eco.');
    }

    throw new Error(response.data?.error || 'Erro inesperado da API /ask-eco');
  } catch (error: any) {
    /* ------------------------------------------------------------------ */
    /*  5. Tratamento de erro                                             */
    /* ------------------------------------------------------------------ */
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
