// backend atualizado para deixar a Eco fazer a introdução reflexiva sozinha

import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient';

let cachedFullSystemPrompt = null;

async function carregarFullSystemPrompt() {
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
        'eco_farewell.txt',
        'eco_subconscious_guidance.txt'
    ];
    const fileContents = await Promise.all(
        promptFiles.map(f => fs.readFile(path.join(assetsDir, f), 'utf-8'))
    );
    cachedFullSystemPrompt = promptFiles
        .map((f, i) => `## ${f.replace('.txt', '').replace(/_/g, ' ').toUpperCase()}\n\n${fileContents[i].trim()}`)
        .join('\n\n');
    return cachedFullSystemPrompt;
}

const mapRoleForOpenAI = (role) => {
    if (role === 'model') return 'assistant';
    if (role === 'system') return 'system';
    return 'user';
};

function limparResposta(text) {
    return text
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
        .replace(/[:;=8][\-–]?[(|)D]/g, '')
        .trim();
}

async function buscarContextoEmocionalCompleto(userId) {
    const { data: perfil } = await supabase
        .from('perfis_emocionais')
        .select('*')
        .eq('usuario_id', userId)
        .limit(1)
        .maybeSingle();

    const { data: mems } = await supabase
        .from('memories')
        .select('*')
        .eq('usuario_id', userId)
        .gte('intensidade', 7)
        .order('data_registro', { ascending: false })
        .limit(3);

    return { perfil, mems };
}

export const askOpenRouter = async (req, res) => {
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

        const { perfil, mems } = await buscarContextoEmocionalCompleto(userId);
        let blocoContextoEmocional = '';

        if (perfil) {
            const emocoes = Object.keys(perfil.emocoes_frequentes || {}).join(', ') || 'nenhuma destacada';
            const temas = Object.keys(perfil.temas_recorrentes || {}).join(', ') || 'nenhum destacado';
            const ultima = perfil.ultima_interacao_significativa || 'não registrado';
            const resumo = perfil.resumo_geral_ia || 'nenhum resumo disponível';

            blocoContextoEmocional += `\nPerfil emocional acumulado:\n- Emoções mais frequentes: ${emocoes}\n- Temas recorrentes: ${temas}\n- Última interação significativa: ${ultima}\n- Resumo geral: ${resumo}`;
        }

        if (mems && mems.length > 0) {
            const memStrings = mems.map(m => `(${m.data_registro}): emoção: ${m.emocao_principal}, contexto: ${m.contexto}, análise: ${m.analise_resumo}`).join('\n');

            blocoContextoEmocional += `\n\nÚltimas memórias emocionais intensas:\n${memStrings}`;
        }

        const promptComInstrucoes = `\n${fullSystemPrompt}\n\n${blocoContextoEmocional}\n\nO nome do usuário logado é: ${nomeSeguro}.\nA IA deve sempre considerar este nome como parte do contexto para personalizar a conversa.`;

        const chatMessages = [
            { role: 'system', content: promptComInstrucoes },
            ...messages.map((msg) => ({
                role: mapRoleForOpenAI(msg.role),
                content: msg.content,
            }))
        ];

        const openRouterResponse = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'openai/gpt-4o',
                messages: chatMessages,
                temperature: 0.9,
                top_p: 0.95,
                presence_penalty: 0.5,
                frequency_penalty: 0.2,
                max_tokens: 1500,
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
        if (!message) {
            return res.status(500).json({ error: 'Resposta vazia do modelo OpenRouter.' });
        }

        let conversationalText = message
            .split('--- BLOCO JSON ---')[0]
            .split('```json')[0]
            .split('```')[0]
            .trim();

        const cleanedConversationalText = limparResposta(conversationalText);

        const allJsonMatches = [...message.matchAll(/\{[\s\S]*?\}\s*/g)];
        if (allJsonMatches.length === 0) {
            return res.status(200).json({ message: cleanedConversationalText });
        }

        const lastJsonMatch = allJsonMatches[allJsonMatches.length - 1][0];
        let parsedMetadata;
        try {
            parsedMetadata = JSON.parse(lastJsonMatch);
        } catch {
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

        if (intensidade >= 7) {
            await supabase.from('memories').insert([{
                usuario_id: userId,
                mensagem_id: messages[messages.length - 1].id,
                resumo_eco: conversationalText,
                emocao_principal,
                intensidade,
                contexto: latestMessage,
                categoria: rotulo,
                salvar_memoria: true,
                data_registro: new Date().toISOString(),
                dominio_vida,
                padrao_comportamental,
                nivel_abertura,
                analise_resumo,
                tags: Array.isArray(tags) ? tags : []
            }]);
        }

        res.status(200).json({ message: cleanedConversationalText });

    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erro ao processar resposta da Eco via OpenRouter.' });
        }
    }
};
