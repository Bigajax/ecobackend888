import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express';

let cachedFullSystemPrompt: string | null = null;

async function carregarFullSystemPrompt(): Promise<string> {
  if (cachedFullSystemPrompt) return cachedFullSystemPrompt;

  const assetsDir = path.join(__dirname, '..', 'assets');
  const promptFiles = [
    'eco_prompt_programavel.txt',
    'eco_manifesto_fonte.txt',
    'eco_principios_poeticos.txt',
    'eco_behavioral_instructions.txt',
    'eco_core_personality.txt',
    'eco_guidelines_general.txt',
    'eco_emotions.txt',
    'eco_examples_realistic.txt',
    'eco_generic_inputs.txt',
    'eco_forbidden_patterns.txt',
    'eco_farewell.txt'
  ];

  const fileContents = await Promise.all(
    promptFiles.map(f => fs.readFile(path.join(assetsDir, f), 'utf-8'))
  );

  cachedFullSystemPrompt = promptFiles
    .map((f, i) => `## ${f.replace('.txt', '').replace(/_/g, ' ').toUpperCase()}\n\n${fileContents[i].trim()}`)
    .join('\n\n');

  return cachedFullSystemPrompt;
}

function gerarSaudacaoPersonalizada(nome?: string): string {
  const hora = new Date().getHours();
  let saudacao;
  if (hora < 12) saudacao = 'Bom dia';
  else if (hora < 18) saudacao = 'Boa tarde';
  else saudacao = 'Boa noite';

  return nome
    ? `${saudacao}, ${nome}. Você chegou até aqui. Isso já diz algo.`
    : `Olá. Você chegou até aqui. Isso já diz algo.`;
}

const mapRoleForGemini = (role: string): 'user' | 'model' => {
  return role === 'assistant' ? 'model' : 'user';
};

// Função para limpar emojis e símbolos gráficos simples do output
function limparResposta(text: string): string {
  return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').replace(/[:;=8][\-–]?[(|)D]/g, '');
}

export const askGemini = async (req: Request, res: Response) => {
  const { messages, userName } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Nenhuma mensagem fornecida.' });
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key não configurada.' });
  }

  try {
    const fullSystemPrompt = await carregarFullSystemPrompt();

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-001' });

    const latestMessage = messages[messages.length - 1].content;

    // Bloqueia pedidos fora do escopo
    if (/gerar|criar|desenhar|fazer.*(código|imagem|projeto|arte|arquivo|ilustração)/i.test(latestMessage)) {
      return res.status(200).json({
        message: 'Eu entendo seu pedido, mas como Eco não crio códigos, imagens ou projetos. Estou aqui apenas para sentir e acolher com você.',
      });
    }

    // Constrói o histórico incluindo apenas o prompt + saudação + histórico sem repetir prompt
    const chatHistory = [
      {
        role: 'user',
        parts: [{ text: `${fullSystemPrompt}\n\n${gerarSaudacaoPersonalizada(userName)}` }],
      },
      ...messages.slice(0, -1).map((msg: any) => ({
        role: mapRoleForGemini(msg.role),
        parts: [{ text: msg.content }],
      })),
    ];

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: { maxOutputTokens: 800 },
    });

    const result = await chat.sendMessage(latestMessage);
    const response = await result.response;
    let message = response.text();

    if (!message) {
      return res.status(500).json({ error: 'Resposta vazia do modelo.' });
    }

    // Limpa emojis e símbolos gráficos
    message = limparResposta(message);

    res.status(200).json({ message });
  } catch (error: any) {
    console.error('Erro no askGemini:', error);
    res.status(500).json({ error: 'Erro ao processar resposta da Eco.' });
  }
};
