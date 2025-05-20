// C:\Users\Rafael\Desktop\eco5555\Eco666\server\services\openrouter.ts

import axios from 'axios';
import path from 'path';
import fs from 'fs/promises'; // Importa a versão de promises para async/await

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
  console.log('*** INICIANDO askOpenRouter ***'); // Log de início da função
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error('Erro: A chave de API do OpenRouter não foi encontrada nas variáveis de ambiente do servidor.');
    // Lança um erro para ser capturado no controller, que por sua vez enviará um 500 para o frontend.
    throw new Error('Chave de API do OpenRouter não configurada no servidor.');
  }
  console.log('Chave de API OpenRouter detectada (primeiros 5 chars):', apiKey.substring(0, 5) + '...'); // Log da chave

  try {
    // Usando path.join com __dirname ou process.cwd() é crucial.
    // Se seus arquivos .txt estão em `server/assets/`, e o script é executado de `server/`,
    // `__dirname` apontará para `server/`.
    // `process.cwd()` aponta para a raiz do projeto (Eco666) se você executa `npm start` de `Eco666/server/`.
    // Vamos usar `__dirname` para ter certeza do caminho relativo ao services/openrouter.ts
    // Se o services/openrouter.ts está em server/services/, e assets está em server/assets/,
    // então o caminho é ../assets.
    const assetsDir = path.join(__dirname, '../assets'); // Ajustado para ser relativo a `services`
    console.log('Diretório de assets:', assetsDir); // Log do diretório de assets

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

    console.log('Tentando ler arquivos do sistema de arquivos...'); // Log antes da leitura
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
    console.log('Arquivos lidos com sucesso!'); // Log após a leitura

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

    console.log('Enviando requisição para OpenRouter API...'); // Log antes da requisição Axios
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-4', // Verifique se este modelo está disponível na sua conta OpenRouter
        messages: messages,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('Resposta recebida da OpenRouter API. Status:', response.status); // Log do status da resposta

    const message = response.data?.choices?.[0]?.message?.content;
    if (!message) {
      console.error('Erro: Estrutura de resposta inesperada da OpenRouter:', response.data);
      throw new Error('Estrutura de resposta inválida ou vazia.');
    }

    console.log('*** askOpenRouter CONCLUÍDO COM SUCESSO ***'); // Log de sucesso
    return message;
  } catch (error: any) {
    console.error('*** ERRO NA FUNÇÃO askOpenRouter ***'); // Log de erro
    console.error('Detalhes do erro:', error); // Log do objeto de erro completo

    let errorMessage = 'Erro ao processar a resposta da ECO.';

    if (error.response?.data?.error?.message) {
      errorMessage = `Erro da OpenRouter: ${error.response.data.error.message}`;
      console.error('Mensagem de erro da OpenRouter API:', error.response.data.error.message);
    } else if (error.message) {
      errorMessage = `Erro na requisição: ${error.message}`;
      console.error('Mensagem de erro da requisição:', error.message);
    }

    // Retorne um objeto com a propriedade 'error' para que o controller possa pegá-lo
    // Isso é importante porque o controller espera uma Promise<any>
    throw new Error(errorMessage); // Lança o erro para ser pego no controller.
  }
};