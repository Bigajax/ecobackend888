// IMPORTS
import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

import { embedTextoCompleto } from '../services/embeddingService';
import { heuristicasTriggerMap, tagsPorHeuristica } from '../assets/config/heuristicasTriggers';
import { filosoficosTriggerMap } from '../assets/config/filosoficosTriggers';
import { estoicosTriggerMap } from '../assets/config/estoicosTriggers';
import { emocionaisTriggerMap, ModuloEmocionalTrigger } from '../assets/config/emocionaisTriggers';
import { heuristicaNivelAbertura } from '../utils/heuristicaNivelAbertura';
import { buscarHeuristicasSemelhantes } from '../services/heuristicaService';
import { buscarHeuristicaPorSimilaridade } from '../services/heuristicaFuzzyService';
import { buscarMemoriasSemelhantes } from '../services/buscarMemorias';
import { buscarReferenciasSemelhantes } from '../services/buscarReferenciasSemelhantes';

// INTERFACES
interface PerfilEmocional {
  emocoes_frequentes?: Record<string, number>;
  temas_recorrentes?: Record<string, number>;
  ultima_interacao_significativa?: string;
  resumo_geral_ia?: string;
}

interface Memoria {
  data_registro?: string;
  resumo_eco: string;
  tags?: string[];
  intensidade?: number;
  similaridade?: number;
  score?: number;
  emocao_principal?: string;
}

interface Heuristica {
  arquivo: string;
  gatilhos: string[];
}

interface ModuloFilosoficoTrigger {
  arquivo: string;
  gatilhos: string[];
}

// SUPABASE
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

function normalizarTexto(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// FUNÇÃO PRINCIPAL
export async function montarContextoEco({
  perfil,
  ultimaMsg,
  userId,
  mems
}: {
  perfil?: PerfilEmocional | null;
  ultimaMsg?: string;
  userId?: string;
  mems?: Memoria[];
}): Promise<string> {
  const assetsDir = path.join(process.cwd(), 'assets');
  const modulosDir = path.join(assetsDir, 'modulos');
  const modCogDir = path.join(assetsDir, 'modulos_cognitivos');
  const modFilosDir = path.join(assetsDir, 'modulos_filosoficos');
  const modEstoicosDir = path.join(modFilosDir, 'estoicos');
  const modEmocDir = path.join(assetsDir, 'modulos_emocionais');

  const promptBase = await fs.readFile(path.join(assetsDir, 'eco_prompt_programavel.txt'), 'utf-8');
  const forbidden = await fs.readFile(path.join(modulosDir, 'eco_forbidden_patterns.txt'), 'utf-8');

  let contexto = '';
  const entrada = (ultimaMsg || '').trim();
  const entradaSemAcentos = normalizarTexto(entrada);

  if (perfil) {
    const emocoes = Object.keys(perfil.emocoes_frequentes || {}).join(', ') || 'nenhuma';
    const temas = Object.keys(perfil.temas_recorrentes || {}).join(', ') || 'nenhum';
    contexto += `\n🧠 Perfil emocional:\n• Emoções: ${emocoes}\n• Temas: ${temas}`;
  }

  if (entrada) {
    const nivel = heuristicaNivelAbertura(entrada);
    const desc = nivel === 1 ? 'superficial' : nivel === 2 ? 'reflexiva' : 'profunda';
    contexto += `\n📶 Abertura emocional sugerida (heurística): ${desc}`;
  }

  let heuristicaAtiva = heuristicasTriggerMap.find((h: Heuristica) =>
    h.gatilhos.some((g) => entradaSemAcentos.includes(normalizarTexto(g)))
  );

  if (entrada && !heuristicaAtiva) {
    const heuristicaFuzzy = await buscarHeuristicaPorSimilaridade(entrada);
    if (heuristicaFuzzy) {
      console.log("✨ Heurística fuzzy ativada:", heuristicaFuzzy.arquivo);
      heuristicaAtiva = heuristicaFuzzy;
    }
  }

  if (entrada) {
    const queryEmbedding = await embedTextoCompleto(entrada, "🔍 heuristica");
    console.log("📌 Vetor de embedding (parcial):", queryEmbedding.slice(0, 6), "...");
  }

  const heuristicasEmbedding = entrada ? await buscarHeuristicasSemelhantes(entrada) : [];

  const modulosFilosoficosAtivos = filosoficosTriggerMap.filter((f: ModuloFilosoficoTrigger) =>
    f.gatilhos.some((g) => entradaSemAcentos.includes(normalizarTexto(g)))
  );

  const modulosEstoicosAtivos = estoicosTriggerMap.filter((e: ModuloFilosoficoTrigger) =>
    e.gatilhos.some((g) => {
      const palavras = normalizarTexto(g).split(' ');
      return palavras.every(p => entradaSemAcentos.includes(p));
    })
  );

  const tagsAlvo = heuristicaAtiva ? tagsPorHeuristica[heuristicaAtiva.arquivo] ?? [] : [];

  let memsUsadas = mems;

  if ((!memsUsadas?.length) && entrada && userId) {
    try {
      const [memorias, referencias] = await Promise.all([
        buscarMemoriasSemelhantes(userId, entrada),
        buscarReferenciasSemelhantes(userId, entrada)
      ]);
      memsUsadas = [...(memorias || []), ...(referencias || [])];

      if (tagsAlvo.length) {
        memsUsadas = memsUsadas.filter(m => m.tags?.some(t => tagsAlvo.includes(t)));
      }
    } catch (e) {
      console.warn("⚠️ Erro ao buscar memórias/referências:", (e as Error).message);
      memsUsadas = [];
    }
  }

  if (entrada && perfil) {
    const memoriaAtual: Memoria = {
      resumo_eco: entrada,
      tags: perfil.temas_recorrentes ? Object.keys(perfil.temas_recorrentes) : [],
      intensidade: 0,
      emocao_principal: Object.keys(perfil.emocoes_frequentes || {})[0] || ''
    };
    memsUsadas = [memoriaAtual, ...(memsUsadas || [])];
  }

  if (memsUsadas?.length) {
    const memoriaUnica = new Map();
    memsUsadas = memsUsadas.filter(m => {
      const key = m.resumo_eco.trim();
      if (memoriaUnica.has(key)) return false;
      memoriaUnica.set(key, true);
      return true;
    });

    const blocos = memsUsadas
      .map(m => {
        const d = m.data_registro?.slice(0, 10);
        const tg = m.tags?.join(', ') || '';
        const leve = (m.intensidade ?? 0) < 7 ? 'Nota leve: ' : '';
        const resumo = m.resumo_eco.length > 220 ? m.resumo_eco.slice(0, 217) + '...' : m.resumo_eco;
        return `${leve}(${d}) ${resumo}${tg ? ` [tags: ${tg}]` : ''}`;
      }).join('\n');

    contexto += `\n\n📘 Memórias relacionadas:\n${blocos}`;
  }

  const modulosAdic: string[] = [];
  const modulosInseridos = new Set<string>();

  const inserirModuloUnico = async (arquivo: string, tipo: string, caminhoBase: string) => {
    if (modulosInseridos.has(arquivo)) return;
    try {
      const conteudo = await fs.readFile(path.join(caminhoBase, arquivo), 'utf-8');
      modulosAdic.push(`\n\n[Módulo ${tipo} → ${arquivo}]\n${conteudo.trim()}`);
      modulosInseridos.add(arquivo);
      console.log(`📎 Módulo ${tipo} inserido: ${arquivo}`);
    } catch (e) {
      console.warn(`⚠️ Falha ao carregar módulo ${arquivo}:`, (e as Error).message);
    }
  };

  if (heuristicaAtiva) await inserirModuloUnico(heuristicaAtiva.arquivo, 'Cognitivo', modCogDir);
  for (const h of heuristicasEmbedding) await inserirModuloUnico(h.arquivo, 'Cognitivo', modCogDir);
  for (const mf of modulosFilosoficosAtivos) await inserirModuloUnico(mf.arquivo, 'Filosófico', modFilosDir);
  for (const es of modulosEstoicosAtivos) await inserirModuloUnico(es.arquivo, 'Estoico', modEstoicosDir);

  const modulosEmocionaisAtivos = emocionaisTriggerMap.filter((m: ModuloEmocionalTrigger) => {
    const intensidadeOk = m.intensidadeMinima !== undefined
      ? memsUsadas?.some(mem => (mem.intensidade ?? 0) >= m.intensidadeMinima!)
      : true;

    const tagsPresentes = memsUsadas?.flatMap(mem => mem.tags ?? []) ?? [];
    const emocoesPrincipais = memsUsadas?.map(mem => mem.emocao_principal).filter(Boolean) ?? [];

    const tagsCombinam = m.tags?.some(tag => tagsPresentes.includes(tag));
    const emocaoCondiz = m.tags?.some(tag => emocoesPrincipais.includes(tag));

    return intensidadeOk && (tagsCombinam || emocaoCondiz);
  });

  for (const me of modulosEmocionaisAtivos) {
    console.log(`🧠 Módulo emocional ativado por critérios: ${me.arquivo}`);
    await inserirModuloUnico(me.arquivo, 'Emocional', modEmocDir);
    if (me.relacionado?.length) {
      for (const rel of me.relacionado) {
        await inserirModuloUnico(rel, 'Relacionado', modFilosDir);
      }
    }
  }

  const criterios = await fs.readFile(path.join(modulosDir, 'eco_json_trigger_criteria.txt'), 'utf-8');
  modulosAdic.push(`\n\n[Módulo: eco_json_trigger_criteria]\n${criterios.trim()}`);
  modulosAdic.push(`\n\n[Módulo: eco_forbidden_patterns]\n${forbidden.trim()}`);

  const promptFinal = `${promptBase.trim()}\n\n${contexto.trim()}\n${modulosAdic.join('\n')}`.trim();
  return promptFinal;
}

export const getPromptEcoPreview = async (_req: Request, res: Response) => {
  try {
    const promptFinal = await montarContextoEco({});
    res.json({ prompt: promptFinal });
  } catch (err) {
    console.error('❌ Erro ao montar prompt:', err);
    res.status(500).json({ error: 'Erro ao montar o prompt' });
  }
};
