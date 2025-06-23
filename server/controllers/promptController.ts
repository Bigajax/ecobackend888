import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { embedTextoCompleto } from '../services/embeddingService';
import { heuristicasTriggerMap, tagsPorHeuristica } from '../assets/config/heuristicasTriggers';
import { filosoficosTriggerMap } from '../assets/config/filosoficosTriggers'; // ✅ NOVO

/* ──────── Tipagens ──────── */
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

/* ──────── Supabase ──────── */
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

/* ──────── Utilitário: normalizar string ──────── */
function normalizarTexto(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* ──────── RPC: busca semântica de memórias ──────── */
async function buscarMemoriasSemelhantes(
  userId: string,
  input: string,
  limite = 3,
  similaridadeMinima = 0.5
): Promise<Memoria[]> {
  const vetor = await embedTextoCompleto(input);
  const vetorSQL = `'[${vetor.join(',')}]'`;

  const { data, error } = await supabase.rpc('buscar_memorias_semelhantes', {
    usuario_id_param: userId,
    vetor_param: vetorSQL
  });

  if (error) {
    console.warn('⚠️ Erro ao buscar memórias:', error.message);
    return [];
  }

  return (data as Memoria[] || [])
    .filter((m) => (m.similaridade ?? 0) >= similaridadeMinima)
    .map((m) => ({
      ...m,
      score: ((m.similaridade ?? 0) * 0.5) + ((m.intensidade ?? 0) / 10 * 0.5)
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limite);
}

/* ──────── Prompt principal ──────── */
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
  const modFilosDir = path.join(assetsDir, 'modulos_filosoficos'); // ✅ NOVO

  const promptBase = await fs.readFile(path.join(assetsDir, 'eco_prompt_programavel.txt'), 'utf-8');
  const forbidden = await fs.readFile(path.join(modulosDir, 'eco_forbidden_patterns.txt'), 'utf-8');

  let contexto = '';
  const entrada = (ultimaMsg || '').trim();
  const entradaSemAcentos = normalizarTexto(entrada);

  console.log('📨 Entrada do usuário:', entrada);
  console.log('🔡 Entrada normalizada:', entradaSemAcentos);

  if (perfil) {
    const emocoes = Object.keys(perfil.emocoes_frequentes || {}).join(', ') || 'nenhuma';
    const temas = Object.keys(perfil.temas_recorrentes || {}).join(', ') || 'nenhum';
    contexto += `\n🧠 Perfil emocional:\n• Emoções: ${emocoes}\n• Temas: ${temas}`;
  }

  const heuristicaAtiva = heuristicasTriggerMap.find((h: Heuristica) =>
    h.gatilhos.some((g) => entradaSemAcentos.includes(normalizarTexto(g)))
  );

  const moduloFilosoficoAtivo = filosoficosTriggerMap.find((f: ModuloFilosoficoTrigger) =>
    f.gatilhos.some((g) => entradaSemAcentos.includes(normalizarTexto(g)))
  );

  const tagsAlvo = heuristicaAtiva ? tagsPorHeuristica[heuristicaAtiva.arquivo] ?? [] : [];

  console.log('🎯 Heurística ativada:', heuristicaAtiva?.arquivo || 'nenhuma');
  console.log('📚 Módulo filosófico ativado:', moduloFilosoficoAtivo?.arquivo || 'nenhum');
  console.log('🏷 Tags alvo:', tagsAlvo);

  let memsUsadas = mems;
  if ((!memsUsadas?.length) && entrada && userId) {
    memsUsadas = await buscarMemoriasSemelhantes(userId, entrada);
    if (tagsAlvo.length) {
      memsUsadas = memsUsadas.filter(m => m.tags?.some(t => tagsAlvo.includes(t)));
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

  const modulosAdic: string[] = [];

  if (heuristicaAtiva) {
    try {
      const c = await fs.readFile(path.join(modCogDir, heuristicaAtiva.arquivo), 'utf-8');
      modulosAdic.push(`\n\n[Módulo Cognitivo: ${heuristicaAtiva.arquivo}]\n${c.trim()}`);
    } catch (e) {
      console.warn(`⚠️ Falha ao carregar ${heuristicaAtiva.arquivo}:`, (e as Error).message);
    }
  }

  if (moduloFilosoficoAtivo) {
    try {
      const c = await fs.readFile(path.join(modFilosDir, moduloFilosoficoAtivo.arquivo), 'utf-8');
      modulosAdic.push(`\n\n[Módulo Filosófico: ${moduloFilosoficoAtivo.arquivo}]\n${c.trim()}`);
    } catch (e) {
      console.warn(`⚠️ Falha ao carregar ${moduloFilosoficoAtivo.arquivo}:`, (e as Error).message);
    }
  }

  const criterios = await fs.readFile(path.join(modulosDir, 'eco_json_trigger_criteria.txt'), 'utf-8');
  modulosAdic.push(`\n\n[Módulo: eco_json_trigger_criteria]\n${criterios.trim()}`);
  modulosAdic.push(`\n\n[Módulo: eco_forbidden_patterns]\n${forbidden.trim()}`);

  const promptFinal = `${promptBase.trim()}\n\n${contexto.trim()}\n${modulosAdic.join('\n')}`.trim();

  console.log('📜 Prompt final (início):', promptFinal.slice(0, 300), '...');
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
