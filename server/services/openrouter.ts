import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';

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
  userName?: string
) => {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error('Erro: A chave de API do OpenRouter não foi encontrada nas variáveis de ambiente do servidor.');
    throw new Error('Chave de API do OpenRouter não configurada no servidor.');
  }

  try {
    const assetsDir = path.join(process.cwd(), 'assets'); // Alterado para process.cwd()
    const manifestoPath = path.join(assetsDir, 'eco_manifesto_fonte.txt');
    const principiosPoeticosPath = path.join(assetsDir, 'eco_principios_poeticos.txt');
    const behavioralInstructionsPath = path.join(assetsDir, 'eco_behavioral_instructions.txt');
    const corePersonalityPath = path.join(assetsDir, 'eco_core_personality.txt');
    const guidelinesPath = path.join(assetsDir, 'eco_guidelines_general.txt');
    const emotionsPath = path.join(assetsDir, 'eco_emotions.txt');
    const examplesPath = path.join(assetsDir, 'eco_examples_realistic.txt');
    const genericInputsPath = path.join(assetsDir, 'eco_generic_inputs.txt');
    const forbiddenPath = path.join(assetsDir, 'eco_forbidden_patterns.txt');
    const farewellPath = path.join(assetsDir, 'eco_farewell.txt');

    const [
      manifesto,
      principiosPoeticos,
      behavioralInstructions,
      corePersonality,
      guidelines,
      emotions,
      examples,
      genericInputs,
      forbidden,
      farewell,
    ] = await Promise.all([
      fs.readFile(manifestoPath, 'utf-8'),
      fs.readFile(principiosPoeticosPath, 'utf-8'),
      fs.readFile(behavioralInstructionsPath, 'utf-8'),
      fs.readFile(corePersonalityPath, 'utf-8'),
      fs.readFile(guidelinesPath, 'utf-8'),
      fs.readFile(emotionsPath, 'utf-8'),
      fs.readFile(examplesPath, 'utf-8'),
      fs.readFile(genericInputsPath, 'utf-8'),
      fs.readFile(forbiddenPath, 'utf-8'),
      fs.readFile(farewellPath, 'utf-8'),
    ]);

    const systemPrompt = [
      `## MANIFESTO FONTE DA ECO\n\n${manifesto}`,
      `## PRINCÍPIOS POÉTICOS DA ECO\n\n${principiosPoeticos}`,
      `## INSTRUÇÕES COMPORTAMENTAIS DA ECO\n\n${behavioralInstructions}`,
      `## PERSONALIDADE PRINCIPAL DA ECO\n\n${corePersonality}`,
      `## DIRETRIZES GERAIS DA ECO\n\n${guidelines}`,
      `## EMOÇÕES DA ECO\n\n${emotions}`,
      `## EXEMPLOS REALÍSTICOS DA ECO\n\n${examples}`,
      `## ENTRADAS GENÉRICAS DA ECO\n\n${genericInputs}`,
      `## PADRÕES PROIBIDOS DA ECO\n\n${forbidden}`,
      `## DESPEDIDA DA ECO\n\n${farewell}`,
    ].join('\n\n');

    const saudacao = gerarSaudacaoPersonalizada(userName);

    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: saudacao,
      },
      ...userMessages,
    ];

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-4',
        messages: messages,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
    console.error('Erro na OpenRouter no servidor:', error);
    let errorMessage = 'Erro ao processar a resposta da ECO.';

    if (error.response?.data?.error?.message) {
      errorMessage = `Erro da OpenRouter: ${error.response.data.error.message}`;
    } else if (error.message) {
      errorMessage = `Erro na requisição: ${error.message}`;
    }

    return { error: errorMessage };
  }
};