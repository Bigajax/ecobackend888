import axios from 'axios';

// Importa os arquivos .md como texto puro (graças ao vite-plugin-string)
import corePersonality from '../eco_prompts/eco_core_personality.md';
import emotions from '../eco_prompts/eco_emotions.md';
import examples from '../eco_prompts/eco_examples_realistic.md';
import farewell from '../eco_prompts/eco_farewell.md';
import forbidden from '../eco_prompts/eco_forbidden_patterns.md';
import genericInputs from '../eco_prompts/eco_generic_inputs.md';
import guidelines from '../eco_prompts/eco_guidelines_general.md';

export const askOpenRouter = async (userMessages: { role: string; content: string }[]) => {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error('Erro: A chave de API do OpenRouter não foi encontrada nas variáveis de ambiente.');
    throw new Error('Chave de API do OpenRouter não configurada.');
  }

  // Junta todos os prompts como um único system prompt
  const systemPrompt = [
    corePersonality,
    emotions,
    examples,
    farewell,
    forbidden,
    genericInputs,
    guidelines,
  ].join('\n\n');

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
