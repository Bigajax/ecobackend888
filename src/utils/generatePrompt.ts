// C:\Users\Rafael\Desktop\eco5555\Eco666\src\utils\generatePrompt.ts

// Supondo que você use 'axios' ou 'fetch'
import axios from 'axios'; // ou import 'axios' from 'axios';
// import { fetch } from 'whatwg-fetch'; // Se você estiver usando o fetch padrão do navegador ou um polyfill

export const gerarPromptMestre = async () => { // ou como sua função é definida
  console.log('Frontend: Iniciando chamada para /api/prompt-mestre'); // Log 1

  try {
    const response = await axios.get('/api/prompt-mestre'); // ou await fetch('/api/prompt-mestre');

    console.log('Frontend: Resposta recebida do backend:', response); // Log 2: Veja a resposta completa
    console.log('Frontend: Dados da resposta:', response.data); // Log 3: Veja os dados da resposta

    // IMPORTANTE: O backend está retornando o JSON { prompt: "..." }.
    // O frontend DEVE acessar 'response.data.prompt'.
    if (response.data && response.data.prompt) {
      console.log('Frontend: Prompt mestre extraído com sucesso:', response.data.prompt); // Log 4
      return response.data.prompt; // Retorne apenas o conteúdo do prompt
    } else {
      console.error('Frontend: Estrutura de resposta inesperada para prompt mestre:', response.data); // Log 5
      throw new Error('Formato de resposta inesperado do servidor para o prompt mestre.');
    }
  } catch (error) {
    console.error('Frontend: Erro ao buscar o prompt mestre:', error); // Log 6
    // Se estiver usando axios, o erro pode ter uma propriedade 'response' com mais detalhes do servidor.
    if (axios.isAxiosError(error) && error.response) {
      console.error('Frontend: Detalhes do erro do servidor:', error.response.data);
    }
    throw error; // Relança o erro para que o componente que chama possa tratá-lo
  }
};