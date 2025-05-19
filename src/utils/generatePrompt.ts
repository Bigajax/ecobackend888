// src/prompts/generatePrompt.ts

export const gerarPromptMestre = async (): Promise<string> => {
  try {
    const response = await fetch('/api/prompt-mestre');
    if (!response.ok) {
      console.error(`Erro ao buscar o prompt mestre: ${response.status}`);
      return ''; // Ou lance um erro, dependendo do seu tratamento
    }
    const data = await response.json();
    return data.prompt || '';
  } catch (error) {
    console.error('Erro ao buscar o prompt mestre:', error);
    return ''; // Ou lance um erro
  }
};