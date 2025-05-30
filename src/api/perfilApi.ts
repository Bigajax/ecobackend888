import axios from 'axios';

const API_BASE_URL = '/api';

export const buscarPerfilEmocional = async (userId: string) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/profiles/${userId}`);

    if (response.data && response.data.success) {
      return response.data.perfil;
    } else {
      throw new Error('Perfil emocional não encontrado.');
    }
  } catch (error: any) {
    console.error('Erro ao buscar perfil emocional:', error.message);
    throw new Error('Erro ao buscar perfil emocional.');
  }
};
