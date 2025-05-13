import axios from 'axios';

// Importa os arquivos .md como texto puro (graças ao vite-plugin-string)
import corePersonality from '../eco_prompts/eco_core_personality.md';
import emotions from '../eco_prompts/eco_emotions.md';
import examples from '../eco_prompts/eco_examples_realistic.md';
import farewell from '../eco_prompts/eco_farewell.md';
import forbidden from '../eco_prompts/eco_forbidden_patterns.md';
import genericInputs from '../eco_prompts/eco_generic_inputs.md';
import guidelines from '../eco_prompts/eco_guidelines_general.md';
import manifesto from '../eco_prompts/eco_manifesto_fonte.md'; // Importe o manifesto
import principiosPoeticos from '../eco_prompts/eco_principios_poeticos.md'; // Importe os princípios poéticos

// Função auxiliar para gerar saudação com base no horário
function gerarSaudacaoPersonalizada(nome?: string) {
  const hora = new Date().getHours();
  let saudacao;

  if (hora < 12) saudacao = 'Bom dia';
  else if (hora < 18) saudacao = 'Boa tarde';
  else saudacao = 'Boa noite';

  if (nome) return `${saudacao}, ${nome}. Você chegou até aqui. Isso já diz algo.`;
  return `Olá. Você chegou até aqui. Isso já diz algo.`;
}

export const askOpenRouter = async (
  userMessages: { role: string; content: string }[],
  userName?: string // <- nome do usuário opcional
) => {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error('Erro: A chave de API do OpenRouter não foi encontrada nas variáveis de ambiente.');
    throw new Error('Chave de API do OpenRouter não configurada.');
  }

  // Junta todos os prompts como um único system prompt, incluindo o manifesto e os princípios
  const systemPrompt = [
    `## MANIFESTO FONTE DA ECO

${manifesto}

## PRINCÍPIOS POÉTICOS DA ECO

${principiosPoeticos}

## PERSONALIDADE PRINCIPAL DA ECO

${corePersonality}

## DIRETRIZES GERAIS DA ECO

${guidelines}

## EMOÇÕES DA ECO

${emotions}

## EXEMPLOS REALÍSTICOS DA ECO

${examples}

## ENTRADAS GENÉRICAS DA ECO

${genericInputs}

## PADRÕES PROIBIDOS DA ECO

${forbidden}

## DESPEDIDA DA ECO

${farewell}`,
  ].join('\n\n');

  // Saudação com horário e nome
  const saudacao = gerarSaudacaoPersonalizada(userName);

  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: saudacao, // <- entra antes da conversa real
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