import axios from 'axios';

export const gerarPromptMestre = async (): Promise<string> => {
  console.log('Frontend: iniciando chamada para /api/prompt-mestre');

  try {
    const { data } = await axios.get<{ prompt: string }>('/api/prompt-mestre');
    if (!data.prompt) {
      console.error('Frontend: resposta sem campo prompt:', data);
      throw new Error('Formato de resposta inesperado do servidor');
    }
    console.log('Frontend: prompt mestre extraído com sucesso');
    return data.prompt;
  } catch (err) {
    console.error('Frontend: erro ao buscar o prompt mestre:', err);
    throw err;
  }
};
