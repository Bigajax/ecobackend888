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
    return text
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
        .replace(/[:;=8][\-–]?[(|)D]/g, '')
        .trim();
}

async function buscarContextoEmocionalCompleto(userId: string) {
    const { data: perfil, error: perfilError } = await supabase
        .from('perfis_emocionais')
        .select('*')
        .eq('usuario_id', userId)
        .limit(1)
        .maybeSingle();

    if (perfilError) {
        console.error('Erro ao buscar perfil emocional:', perfilError);
    }

    const { data: mems, error: memError } = await supabase
        .from('memories')
        .select('*')
        .eq('usuario_id', userId)
        .gte('intensidade', 7)
        .order('data_registro', { ascending: false })
        .limit(3);

    if (memError) {
        console.error('Erro ao buscar memórias recentes:', memError);
    }

    return { perfil, mems };
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
        const nomeSeguro = userName || 'Usuário';

        // Buscar contexto emocional acumulado
        const { perfil, mems } = await buscarContextoEmocionalCompleto(userId);
        let blocoContextoEmocional = '';

        if (perfil) {
            const emocoes = Object.keys(perfil.emocoes_frequentes || {}).join(', ') || 'nenhuma destacada';
            const temas = Object.keys(perfil.temas_recorrentes || {}).join(', ') || 'nenhum destacado';
            const ultima = perfil.ultima_interacao_significativa || 'não registrado';
            const resumo = perfil.resumo_geral_ia || 'nenhum resumo disponível';

            blocoContextoEmocional += `
Perfil emocional acumulado:
- Emoções mais frequentes: ${emocoes}
- Temas recorrentes: ${temas}
- Última interação significativa: ${ultima}
- Resumo geral: ${resumo}
`;
        }

        if (mems && mems.length > 0) {
            const memStrings = mems.map(m => {
                return `(${m.data_registro}): emoção: ${m.emocao_principal}, contexto: ${m.contexto}, análise: ${m.analise_resumo}`;
            }).join('\n');

            blocoContextoEmocional += `

Últimas memórias emocionais intensas:
${memStrings}
`;
        }

        const promptComInstrucoes = `
${fullSystemPrompt}

${blocoContextoEmocional}

O nome do usuário logado é: ${nomeSeguro}.
A IA deve sempre considerar este nome como parte do contexto para personalizar a conversa.

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
            { role: 'user', content: gerarSaudacaoPersonalizada(nomeSeguro) },
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
                temperature: 0.8,         // ← mais reflexivo
                top_p: 0.95,              // ← mais diversidade
                presence_penalty: 0.3,    // ← força novos tópicos
                frequency_penalty: 0.2,   // ← reduz repetição
                max_tokens: 1500,         // ← respostas mais longas
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

        let conversationalText = message
            .split('--- BLOCO JSON ---')[0]
            .split('```json')[0]
            .split('```')[0]
            .trim();

        const cleanedConversationalText = limparResposta(conversationalText);
        console.log('Texto conversacional limpo:', cleanedConversationalText);

        const allJsonMatches = [...message.matchAll(/\{[\s\S]*?\}\s*/g)];

        if (allJsonMatches.length === 0) {
            console.warn('Nenhum bloco JSON encontrado na resposta. Enviando apenas a mensagem textual.');
            return res.status(200).json({ message: cleanedConversationalText });
        }

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
                emocao_principal,
                intensidade,
                contexto: contextoUsuario,
                categoria: rotulo,
                salvar_memoria: true,
                data_registro: new Date().toISOString(),
                dominio_vida,
                padrao_comportamental,
                nivel_abertura,
                analise_resumo,
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
