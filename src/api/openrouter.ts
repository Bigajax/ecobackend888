import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

export const askOpenRouter = async (userMessages: { role: string; content: string }[]) => {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error('Erro: A chave de API do OpenRouter não foi encontrada nas variáveis de ambiente.');
    throw new Error('Chave de API do OpenRouter não configurada.');
  }

  // 🔹 Carrega todos os .md da pasta eco_prompts e concatena
  const loadEcoPrompt = async (): Promise<string> => {
    const promptDir = path.join(import.meta.env.BASE_URL || '.', 'src', 'eco_prompts');
    try {
      const files = await fs.readdir(promptDir);
      const mdFiles = files.filter(file => file.endsWith('.md'));

      const contents = await Promise.all(
        mdFiles.map(file => fs.readFile(path.join(promptDir, file), 'utf-8'))
      );

      return contents.join('\n\n');
    } catch (err) {
      console.error('Erro ao carregar os prompts da pasta eco_prompts:', err);
      return ''; // fallback vazio
    }
  };

  const systemPrompt = await loadEcoPrompt();

  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    ...userMessages,
  ];

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-3.5-turbo',
        messages: messages,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const message = response.data?.choices?.[0]?.message?.content;
    if (!message) {
      console.error('Erro: Estrutura de resposta inesperada da OpenRouter:', response.data);
      throw new Error('Estrutura de resposta inválida.');
    }

    return message;

  } catch (error: any) {
    console.error('Erro na OpenRouter:', error);
    throw error;
  }
};
