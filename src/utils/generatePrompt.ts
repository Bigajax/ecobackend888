// src/prompts/generatePrompt.ts

export const gerarPromptMestre = async (): Promise<string> => {
  try {
    const response = await fetch('/api/prompt-mestre'); // <--- Adicionando o prefixo '/api'
    if (!response.ok) {
      console.error(`Erro ao buscar o prompt mestre: ${response.status}`);
      return '';
    }
    const data = await response.json();
    return data.prompt || '';
  } catch (error) {
    console.error('Erro ao buscar o prompt mestre:', error);
    return '';
  }
};