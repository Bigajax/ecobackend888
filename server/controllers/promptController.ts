import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

import { embedTextoCompleto } from '../services/embeddingService';
import { heuristicasTriggerMap, tagsPorHeuristica } from '../assets/config/heuristicasTriggers';
import { filosoficosTriggerMap } from '../assets/config/filosoficosTriggers';
import { heuristicaNivelAbertura } from '../utils/heuristicaNivelAbertura';
import { buscarHeuristicasSemelhantes } from '../services/heuristicaService';
import { buscarHeuristicaPorSimilaridade } from '../services/heuristicaFuzzyService';
import { buscarMemoriasSemelhantes } from '../services/buscarMemorias';

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
}

interface Heuristica {
  arquivo: string;
  gatilhos: string[];
}

interface ModuloFilosoficoTrigger {
  arquivo: string;
  gatilhos: string[];
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

function normalizarTexto(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

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

  // 🔍 Heurística via gatilho
  let heuristicaAtiva = heuristicasTriggerMap.find((h: Heuristica) =>
    h.gatilhos.some((g) => entradaSemAcentos.includes(normalizarTexto(g)))
  );

  // 🔍 Fuzzy match se não houver heurística direta
  if (entrada && !heuristicaAtiva) {
    const heuristicaFuzzy = await buscarHeuristicaPorSimilaridade(entrada);
    if (heuristicaFuzzy) {
      console.log("✨ Heurística fuzzy ativada:", heuristicaFuzzy.arquivo);
      heuristicaAtiva = heuristicaFuzzy;
    }
  }

  // 🔍 Log de embedding (debug)
  if (entrada) {
    const queryEmbedding = await embedTextoCompleto(entrada, "🔍 heuristica");
    console.log("📌 Vetor de embedding (parcial):", queryEmbedding.slice(0, 6), "...");
  }

  // 🔍 Heurísticas por similaridade semântica (embedding)
  const heuristicasEmbedding = entrada ? await buscarHeuristicasSemelhantes(entrada) : [];

  if (heuristicasEmbedding.length) {
    console.log("📊 Heurísticas ativadas por embedding:");
    heuristicasEmbedding.forEach((h: any, i: number) => {
      const nome = h.nome || h.arquivo || `Heurística ${i + 1}`;
      const similaridade = h.similaridade?.toFixed(3) ?? "N/A";
      console.log(`• ${nome} (similaridade: ${similaridade})`);
    });
  } else {
    console.log("🔍 Nenhuma heurística semelhante encontrada via embedding.");
  }

  // 🔍 Módulos filosóficos via múltiplos gatilhos
  const modulosFilosoficosAtivos = filosoficosTriggerMap.filter((f: ModuloFilosoficoTrigger) =>
    f.gatilhos.some((g) => entradaSemAcentos.includes(normalizarTexto(g)))
  );

  const tagsAlvo = heuristicaAtiva ? tagsPorHeuristica[heuristicaAtiva.arquivo] ?? [] : [];

  let memsUsadas = mems;
  if ((!memsUsadas?.length) && entrada && userId) {
    try {
      memsUsadas = await buscarMemoriasSemelhantes(userId, entrada);
      if (tagsAlvo.length) {
        memsUsadas = (memsUsadas ?? []).filter(m => m.tags?.some(t => tagsAlvo.includes(t)));
      }
    } catch (e) {
      console.warn("⚠️ Erro ao buscar memórias semelhantes:", (e as Error).message);
      memsUsadas = [];
    }
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
        const resumo = m.resumo_eco.length > 220 ? m.resumo_eco.slice(0, 217) + '...' : m.resumo_eco;
        return `(${d}) ${resumo}${tg ? ` [tags: ${tg}]` : ''}`;
      }).join('\n');

    contexto += `\n\n📘 Memórias relacionadas:\n${blocos}`;
  }

  // 🔗 Inserção de módulos
  const modulosAdic: string[] = [];
  const modulosInseridos = new Set<string>();

  const inserirModuloUnico = async (arquivo: string, tipo: 'cognitivo' | 'filosofico') => {
    if (modulosInseridos.has(arquivo)) return;
    try {
      const caminho = tipo === 'filosofico' ? modFilosDir : modCogDir;
      const conteudo = await fs.readFile(path.join(caminho, arquivo), 'utf-8');
      modulosAdic.push(`\n\n[Módulo ${tipo === 'filosofico' ? 'Filosófico' : 'Cognitivo'}: ${arquivo}]\n${conteudo.trim()}`);
      modulosInseridos.add(arquivo);
    } catch (e) {
      console.warn(`⚠️ Falha ao carregar ${arquivo}:`, (e as Error).message);
    }
  };

  if (heuristicaAtiva) await inserirModuloUnico(heuristicaAtiva.arquivo, 'cognitivo');
  for (const h of heuristicasEmbedding) await inserirModuloUnico(h.arquivo, 'cognitivo');
  for (const mf of modulosFilosoficosAtivos) await inserirModuloUnico(mf.arquivo, 'filosofico');

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
