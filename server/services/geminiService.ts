import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient';

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

function limparResposta(text: string): string {
  return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').replace(/[:;=8][\-–]?[(|)D]/g, '');
}

export const askGemini = async (req: Request, res: Response) => {
  const { messages, userName, userId } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0 || !userId) {
    return res.status(400).json({ error: 'Mensagens ou usuário não fornecidos.' });
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

    const promptComInstrucoes = `
${fullSystemPrompt}

Além de responder normalmente, no final da resposta, sempre forneça este bloco formatado em JSON (sem explicações, apenas o JSON):

{
  "resumo": "<resumo emocional em 1 frase>",
  "emocao": "<emoção principal>",
  "intensidade": <número de 1 a 10>,
  "tags": ["tag1", "tag2", "tag3"]
}
`;

    const chatHistory = [
      {
        role: 'user',
        parts: [{ text: `${promptComInstrucoes}\n\n${gerarSaudacaoPersonalizada(userName)}` }],
      },
      ...messages.slice(0, -1).map((msg: any) => ({
        role: mapRoleForGemini(msg.role),
        parts: [{ text: msg.content }],
      })),
    ];

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: { maxOutputTokens: 1000 },
    });

    const result = await chat.sendMessage(latestMessage);
    const response = await result.response;
    let message = response.text();

    if (!message) {
      return res.status(500).json({ error: 'Resposta vazia do modelo.' });
    }

    message = limparResposta(message);

    const jsonMatch = message.match(/\{[\s\S]*?\}$/);
    if (!jsonMatch) {
      console.warn('Nenhum bloco JSON encontrado na resposta.');
      return res.status(200).json({ message });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const { resumo, emocao, intensidade, tags } = parsed;

    const { error } = await supabase.from('memories').insert([
      {
        usuario_id: userId,
        mensagem_id: messages[messages.length - 1].id,
        resumo_eco: resumo,
        emocao_principal: emocao,
        intensidade: intensidade,
        categoria: tags,
        salvar_memoria: intensidade >= 7,
        data_registro: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error('Erro ao salvar memória no Supabase:', error);
    } else {
      console.log('Memória salva no Supabase com sucesso.');
    }

    res.status(200).json({ message: limparResposta(message), resumo, emocao, intensidade, tags });
  } catch (error: any) {
    console.error('Erro no askGemini:', error);
    res.status(500).json({ error: 'Erro ao processar resposta da Eco.' });
  }
};
