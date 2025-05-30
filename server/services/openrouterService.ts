import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient';

let cachedFullSystemPrompt: string | null = null;

async function carregarFullSystemPrompt(): Promise<string> {
    if (cachedFullSystemPrompt) return cachedFullSystemPrompt;
    const assetsDir = path.join(__dirname, '..', 'assets');
    const promptFiles = [
        'eco_prompt_programavel.txt', 'eco_manifesto_fonte.txt',
        'eco_principios_poeticos.txt', 'eco_behavioral_instructions.txt',
        'eco_core_personality.txt', 'eco_guidelines_general.txt',
        'eco_emotions.txt', 'eco_examples_realistic.txt',
        'eco_generic_inputs.txt', 'eco_forbidden_patterns.txt', 'eco_farewell.txt'
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
    return nome ? `${saudacao}, ${nome}. Você chegou até aqui. Isso já diz algo.` : `Olá. Você chegou até aqui. Isso já diz algo.`;
}

const mapRoleForOpenAI = (role: string): 'user' | 'assistant' | 'system' => {
    if (role === 'model') return 'assistant';
    if (role === 'system') return 'system';
    return 'user';
};

function limparResposta(text: string): string {
    return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').replace(/[:;=8][\-–]?[(|)D]/g, '');
}

export const askOpenRouter = async (req: Request, res: Response) => {
    const { messages, userName, userId } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0 || !userId) {
        return res.status(400).json({ error: 'Mensagens ou usuário não fornecidos.' });
    }

    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterApiKey) {
        return res.status(500).json({ error: 'OPENROUTER_API_KEY não configurada.' });
    }

    try {
        const fullSystemPrompt = await carregarFullSystemPrompt();
        const latestMessage = messages[messages.length - 1].content;

        const promptComInstrucoes = `
${fullSystemPrompt}

Além de responder normalmente, no final da resposta, sempre forneça este bloco formatado em JSON (sem explicações, apenas o JSON):

{
  "emocao_principal": "<emoção central detectada>",
  "intensidade": <número de 1 a 10>,
  "rotulo": "<rótulo curto de 1 a 3 palavras>",
  "tags": ["tag1", "tag2", "tag3"],
  "dominio_vida": "<Trabalho, Relacionamentos, Família, Saúde, Pessoal>",
  "padrao_comportamental": "<Autocrítica, Ruminação, Busca por validação, Gratidão, Nenhum claro>",
  "nivel_abertura": <1, 2 ou 3>,
  "analise_resumo": "<uma frase curta explicando tecnicamente o momento do usuário>"
}
`;

        const chatMessages = [
            { role: 'system', content: promptComInstrucoes },
            { role: 'user', content: gerarSaudacaoPersonalizada(userName) },
            ...messages.slice(0, -1).map((msg: any) => ({
                role: mapRoleForOpenAI(msg.role),
                content: msg.content,
            })),
            { role: 'user', content: latestMessage }
        ];

        const openRouterResponse = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'openai/gpt-4o',
                messages: chatMessages,
                temperature: 0.7,
                max_tokens: 1000,
            },
            {
                headers: {
                    'Authorization': `Bearer ${openRouterApiKey}`,
                    'HTTP-Referer': process.env.YOUR_APP_DOMAIN || 'http://localhost:3001',
                    'Content-Type': 'application/json',
                },
            }
        );

        let message = openRouterResponse.data.choices[0].message.content;
        console.log('Mensagem bruta do OpenRouter (antes da limpeza):', message);

        if (!message) {
            return res.status(500).json({ error: 'Resposta vazia do modelo OpenRouter.' });
        }

        // 🔒 Corte seguro para limpar texto
        const startMarker = '--- RESPOSTA ECO ---';
        const endMarker = '--- BLOCO JSON ---';
        let conversationalText = '';

        const startIdx = message.indexOf(startMarker);
        const endIdx = message.indexOf(endMarker);

        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            // ✅ Formato correto com marcadores
            conversationalText = message.substring(startIdx + startMarker.length, endIdx).trim();
        } else {
            console.warn('Marcadores não encontrados corretamente. Fazendo corte seguro.');
            const jsonStartIdx = message.indexOf('{');
            if (jsonStartIdx !== -1) {
                conversationalText = message.substring(0, jsonStartIdx).trim();
            } else {
                conversationalText = message.trim();
            }
        }

        const cleanedConversationalText = limparResposta(conversationalText);
        console.log('Texto conversacional limpo:', cleanedConversationalText);

        // Busca TODOS os blocos JSON presentes
        const allJsonMatches = [...message.matchAll(/\{[\s\S]*?\}\s*/g)];

        if (allJsonMatches.length === 0) {
            console.warn('Nenhum bloco JSON encontrado na resposta. Enviando apenas a mensagem textual.');
            return res.status(200).json({ message: cleanedConversationalText });
        }

        // Seleciona apenas o ÚLTIMO bloco JSON
        const lastJsonMatch = allJsonMatches[allJsonMatches.length - 1][0];
        let parsedMetadata: any;
        try {
            parsedMetadata = JSON.parse(lastJsonMatch);
        } catch (jsonError) {
            console.error('Erro ao fazer parse do JSON da Eco:', jsonError);
            console.warn('Enviando apenas a mensagem textual devido ao erro no parse do JSON.');
            return res.status(200).json({ message: cleanedConversationalText });
        }

        const {
            emocao_principal,
            intensidade,
            rotulo,
            tags,
            dominio_vida,
            padrao_comportamental,
            nivel_abertura,
            analise_resumo
        } = parsedMetadata;

        const contextoUsuario = latestMessage;
        const tagsArray = Array.isArray(tags) ? tags : [];

        if (intensidade >= 7) {
            const { error: dbError } = await supabase.from('memories').insert([{
                usuario_id: userId,
                mensagem_id: messages[messages.length - 1].id,
                resumo_eco: conversationalText,
                emocao_principal: emocao_principal,
                intensidade: intensidade,
                contexto: contextoUsuario,
                categoria: rotulo,
                salvar_memoria: true,
                data_registro: new Date().toISOString(),
                dominio_vida: dominio_vida,
                padrao_comportamental: padrao_comportamental,
                nivel_abertura: nivel_abertura,
                analise_resumo: analise_resumo,
                tags: tagsArray
            }]);

            if (dbError) {
                console.error('Erro ao salvar memória no Supabase:', dbError);
            } else {
                console.log('Memória intensa salva no Supabase com sucesso.');
            }
        } else {
            console.log(`Memória com intensidade ${intensidade} ignorada (não salva).`);
        }

        res.status(200).json({ message: cleanedConversationalText });

    } catch (error: any) {
        console.error('Erro no askOpenRouter:', error.response?.data || error.message || error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erro ao processar resposta da Eco via OpenRouter.' });
        }
    }
};
