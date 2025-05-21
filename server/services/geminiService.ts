// C:\Users\Rafael\Desktop\eco5555\Eco666\server\services\geminiService.ts

import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express'; // Importar Request e Response do Express

// Função auxiliar para gerar saudação
function gerarSaudacaoPersonalizada(nome?: string) {
  const hora = new Date().getHours();
  let saudacao;

  if (hora < 12) saudacao = 'Bom dia';
  else if (hora < 18) saudacao = 'Boa tarde';
  else saudacao = 'Boa noite';

  if (nome) return `${saudacao}, ${nome}. Você chegou até aqui. Isso já diz algo.`;
  return `Olá. Você chegou até aqui. Isso já diz algo.`;
}

// Mapeia o papel 'assistant' (do frontend) para 'model' (esperado pelo Gemini)
// e 'user' para 'user'
const mapRoleForGemini = (role: string) => {
  return role === 'assistant' ? 'model' : role;
};

// A função principal que lida com a requisição e resposta do Express
export const askGemini = async (req: Request, res: Response) => { // Aceita req e res
  console.log('*** INICIANDO askGemini (Google API) ***');

  const { messages, userName } = req.body; // Pega 'messages' e 'userName' do corpo da requisição

  // Validação básica da entrada
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    console.error('Erro: Nenhuma mensagem fornecida na requisição.');
    return res.status(400).json({ error: 'Nenhuma mensagem de chat fornecida.' });
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

  if (!apiKey) {
    console.error('Erro: A chave de API do Google Gemini não foi encontrada nas variáveis de ambiente do servidor.');
    return res.status(500).json({ error: 'Chave de API do Google Gemini não configurada no servidor.' });
  }
  console.log('Chave de API Google Gemini detectada (primeiros 5 chars):', apiKey.substring(0, 5) + '...');

  try {
    const assetsDir = path.join(__dirname, '../assets'); // Ajusta o caminho para assets
    console.log('Diretório de assets calculado:', assetsDir);

    // Mapeamento dos arquivos de prompt
    const promptFiles = {
      manifesto: 'eco_manifesto_fonte.txt',
      principiosPoeticos: 'eco_principios_poeticos.txt',
      behavioralInstructions: 'eco_behavioral_instructions.txt',
      corePersonality: 'eco_core_personality.txt',
      guidelines: 'eco_guidelines_general.txt',
      emotions: 'eco_emotions.txt',
      examples: 'eco_examples_realistic.txt',
      genericInputs: 'eco_generic_inputs.txt',
      forbidden: 'eco_forbidden_patterns.txt',
      farewell: 'eco_farewell.txt',
    };

    // Ler todos os arquivos de prompt em paralelo
    const fileContents = await Promise.all(
      Object.values(promptFiles).map(fileName =>
        fs.readFile(path.join(assetsDir, fileName), 'utf-8')
      )
    );
    console.log('Arquivos lidos com sucesso!');

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
    ] = fileContents;

    // Constrói o fullSystemPrompt com os cabeçalhos
    const fullSystemPrompt = [
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const chatHistory = [];
    const saudacao = gerarSaudacaoPersonalizada(userName);

    // Adiciona o fullSystemPrompt e a saudação como a PRIMEIRA MENSAGEM DO USUÁRIO
    // ou uma parte da primeira mensagem, para o Gemini entender o contexto inicial.
    // Isso é uma forma comum de injetar o "system prompt" em modelos de chat.
    chatHistory.push({
      role: 'user',
      parts: [{ text: `${fullSystemPrompt}\n\n${saudacao}` }],
    });

    // Mapeia as mensagens do frontend para o formato esperado pelo Gemini.
    // A última mensagem do usuário (ou a única, se for a primeira interação)
    // será enviada separadamente pelo `sendMessage`.
    // Por isso, se houver histórico de 2 ou mais mensagens, o frontend envia a primeira do user
    // e a primeira da eco. A lógica abaixo garante que todas sejam incluídas no histórico
    // e a última seja enviada com `sendMessage`.
    const messagesToSend = messages.map((msg: { role: string; content: string }) => ({
      role: mapRoleForGemini(msg.role), // Mapeia 'assistant' para 'model'
      parts: [{ text: msg.content }],
    }));
    
    // Concatena o prompt do sistema com o histórico recebido do frontend.
    // É importante que o prompt do sistema seja a primeira entrada.
    const finalChatHistory = [...chatHistory, ...messagesToSend.slice(0, messagesToSend.length - 1)];


    // Inicializa o chat com o histórico construído
    const chat = model.startChat({
      history: finalChatHistory,
      generationConfig: {
        maxOutputTokens: 800, // Limita o tamanho da resposta para evitar respostas muito longas
      },
    });

    // A última mensagem do array 'messages' (que é a mensagem atual do usuário)
    // é enviada com o `sendMessage` para continuar a conversa.
    const latestUserMessageContent = messages[messages.length - 1].content;
    
    console.log("Enviando mensagem para o Gemini:", latestUserMessageContent);
    console.log("Histórico enviado:", JSON.stringify(finalChatHistory, null, 2));


    const result = await chat.sendMessage(latestUserMessageContent);
    const response = await result.response;
    const message = response.text();

    if (!message) {
      console.error('Erro: Resposta vazia ou inesperada do Google Gemini:', response);
      return res.status(500).json({ error: 'Resposta inválida ou vazia do Google Gemini.' });
    }

    console.log('*** askGemini CONCLUÍDO COM SUCESSO ***');
    // Envia a resposta do Gemini para o frontend
    res.status(200).json({ message });
  } catch (error: any) {
    console.error('*** ERRO NA FUNÇÃO askGemini ***');
    console.error('Detalhes do erro:', error);

    let errorMessage = 'Erro ao processar a resposta da ECO (via Gemini).';

    if (error.message) {
      errorMessage = `Erro do Google Gemini: ${error.message}`;
    } else {
      errorMessage = `Erro inesperado: ${error.toString()}`;
    }
    // Envia o erro para o frontend
    res.status(500).json({ error: errorMessage });
  }
};