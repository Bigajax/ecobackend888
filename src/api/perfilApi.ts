import axios from 'axios';

const API_BASE_URL = '/api';

export const buscarPerfilEmocional = async (userId: string) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/profiles/${userId}`);

    if (response.status >= 200 && response.status < 300) {
      if (response.data && response.data.success) {
        return response.data.perfil;
      } else {
        console.error('Resposta mal formatada ao buscar perfil emocional:', response.data);
        throw new Error('Perfil emocional não encontrado.');
      }
    } else {
      const errorMessage = response.data?.message || 'Erro desconhecido ao buscar perfil emocional.';
      throw new Error(errorMessage);
    }
  } catch (error: any) {
    console.error('Erro ao buscar perfil emocional:', error);
    let errorMessage = 'Ocorreu um erro ao buscar o perfil emocional.';
    if (axios.isAxiosError(error)) {
      if (error.response?.data?.message) {
        errorMessage = `Erro do servidor: ${error.response.data.message}`;
      } else if (error.response?.status) {
        errorMessage = `Erro do servidor (status ${error.response.status}): ${error.response.statusText || 'Resposta inesperada'}`;
      } else if (error.request) {
        errorMessage = `Erro de rede: Nenhuma resposta recebida do servidor. Detalhes: ${error.message}`;
      } else {
        errorMessage = `Erro na requisição: ${error.message}`;
      }
    } else {
      errorMessage = `Erro inesperado: ${error.message || error.toString()}`;
    }
    throw new Error(errorMessage);
  }
};
