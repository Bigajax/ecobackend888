// src/prompts/generatePrompt.ts

export const gerarPromptMestre = async (): Promise<string> => {
  console.log('Função gerarPromptMestre chamada!'); // Adicionado log no início

  try {
    const response = await fetch('/api/prompt-mestre'); // <--- Adicionando o prefixo '/api'

    console.log(`Resposta da API para /api/prompt-mestre: ${response.status}`); // Log do status da resposta

    if (!response.ok) {
      const errorText = await response.text(); // Obtém o texto da resposta de erro
      console.error(`Erro ao buscar o prompt mestre: ${response.status} - ${errorText}`); // Inclui o texto da resposta no erro
      throw new Error(`Erro ao buscar prompt mestre: ${response.status} - ${errorText}`); // Lança um erro para ser capturado no catch
    }

    const data = await response.json();
    console.log('Dados recebidos da API:', data); // Log dos dados

    if (!data.prompt) {
      console.warn('A API não retornou um prompt. Verifique a resposta da API.');
      return ''; // Retorna string vazia, ou você pode querer lançar um erro aqui
    }

    return data.prompt;
  } catch (error: any) {
    console.error('Erro ao buscar o prompt mestre:', error);
    return '';
  }
};
