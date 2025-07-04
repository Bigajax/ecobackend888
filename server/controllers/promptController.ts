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
import { buscarEncadeamentosPassados } from '../services/buscarEncadeamentos';

import { matrizPromptBase } from './matrizPromptBase';

// ----------------------------------
// INTERFACES
// ----------------------------------
interface PerfilEmocional {
  emocoes_frequentes?: Record<string, number>;
  temas_recorrentes?: Record<string, number>;
  ultima_interacao_significativa?: string;
  resumo_geral_ia?: string;
}

interface Memoria {
  created_at?: string;
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

// ----------------------------------
// SUPABASE CLIENT
// ----------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// ----------------------------------
// UTILS
// ----------------------------------
function normalizarTexto(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function capitalizarNome(nome?: string): string {
  if (!nome) return '';
  return nome.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ----------------------------------
// MAIN FUNCTION
// ----------------------------------
export async function montarContextoEco({
  perfil,
  ultimaMsg,
  userId,
  userName,
  mems
}: {
  perfil?: PerfilEmocional | null;
  ultimaMsg?: string;
  userId?: string;
  userName?: string;
  mems?: Memoria[];
}): Promise<string> {

  const assetsDir = path.join(process.cwd(), 'assets');
  const modulosDir = path.join(assetsDir, 'modulos');
  const modCogDir = path.join(assetsDir, 'modulos_cognitivos');
  const modFilosDir = path.join(assetsDir, 'modulos_filosoficos');
  const modEstoicosDir = path.join(modFilosDir, 'estoicos');
  const modEmocDir = path.join(assetsDir, 'modulos_emocionais');

  const forbidden = await fs.readFile(path.join(modulosDir, 'eco_forbidden_patterns.txt'), 'utf-8');

  let contexto = '';
  const entrada = (ultimaMsg || '').trim();
  const entradaSemAcentos = normalizarTexto(entrada);

  // ----------------------------------
  // SAUDAÇÃO ESPECIAL
  // ----------------------------------
  const saudacoesCurtaLista = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite'];
  const isSaudacaoCurta = saudacoesCurtaLista.some((saud) =>
    entradaSemAcentos.startsWith(saud)
  );

  if (isSaudacaoCurta) {
    console.log('🌱 Detecção de saudação curta. Aplicando regra exclusiva de saudação.');
    try {
      let saudacaoConteudo = await fs.readFile(path.join(modulosDir, 'REGRA_SAUDACAO.txt'), 'utf-8');
      if (userName) {
        saudacaoConteudo = saudacaoConteudo.replace(/\[nome\]/gi, capitalizarNome(userName));
      }
      return `📶 Entrada detectada como saudação breve.\n\n[Módulo REGRA_SAUDACAO]\n${saudacaoConteudo.trim()}\n\n[Módulo eco_forbidden_patterns]\n${forbidden.trim()}`;
    } catch (e) {
      console.warn(`⚠️ Falha ao carregar módulo REGRA_SAUDACAO.txt:`, (e as Error).message);
      return `⚠️ Erro ao carregar REGRA_SAUDACAO.`;
    }
  }

  // ----------------------------------
  // NÍVEL DE ABERTURA
  // ----------------------------------
  let nivel = heuristicaNivelAbertura(entrada) || 1;
  if (nivel < 1 || nivel > 3) {
    console.warn('⚠️ Nível de abertura ambíguo ou inválido. Aplicando fallback para nível 1.');
    nivel = 1;
  }
  const desc = nivel === 1 ? 'superficial' : nivel === 2 ? 'reflexiva' : 'profunda';
  contexto += `\n📶 Abertura emocional sugerida (heurística): ${desc}`;

  // ----------------------------------
  // PERFIL EMOCIONAL
  // ----------------------------------
  if (perfil) {
    const emocoes = Object.keys(perfil.emocoes_frequentes || {}).join(', ') || 'nenhuma';
    const temas = Object.keys(perfil.temas_recorrentes || {}).join(', ') || 'nenhum';
    contexto += `\n🧠 Perfil emocional:\n• Emoções: ${emocoes}\n• Temas: ${temas}`;
  }

  // ----------------------------------
  // MEMÓRIAS
  // ----------------------------------
  if (nivel === 1) {
    console.log('⚠️ Ignorando embeddings/memórias por abertura superficial.');
    mems = [];
  }

  // ----------------------------------
  // HEURÍSTICAS DIRETAS E FUZZY
  // ----------------------------------
  let heuristicaAtiva = heuristicasTriggerMap.find((h: Heuristica) =>
    h.gatilhos.some((g) => entradaSemAcentos.includes(normalizarTexto(g)))
  );

  if (entrada && !heuristicaAtiva) {
    heuristicaAtiva = await buscarHeuristicaPorSimilaridade(entrada);
    if (heuristicaAtiva) {
      console.log("✨ Heurística fuzzy ativada:", heuristicaAtiva.arquivo);
    }
  }

  if (entrada) {
    const queryEmbedding = await embedTextoCompleto(entrada, "🔍 heuristica");
    console.log("📌 Vetor de embedding (parcial):", queryEmbedding.slice(0, 6), "...");
  }

  const heuristicasEmbedding = entrada 
  ? await buscarHeuristicasSemelhantes(entrada, userId ?? null) 
  : [];


  const modulosFilosoficosAtivos = filosoficosTriggerMap.filter((f: ModuloFilosoficoTrigger) =>
    f.gatilhos.some((g) => entradaSemAcentos.includes(normalizarTexto(g)))
  );

  const modulosEstoicosAtivos = estoicosTriggerMap.filter((e: ModuloFilosoficoTrigger) =>
    e.gatilhos.every((g) => entradaSemAcentos.includes(normalizarTexto(g)))
  );

  const tagsAlvo = heuristicaAtiva ? tagsPorHeuristica[heuristicaAtiva.arquivo] ?? [] : [];

  let memsUsadas = mems;
  if (nivel > 1 && (!memsUsadas?.length) && entrada && userId) {
    try {
      const [memorias, referencias] = await Promise.all([
        buscarMemoriasSemelhantes(userId, entrada),
        buscarReferenciasSemelhantes(userId, entrada)
      ]);

      const MIN_SIMILARIDADE = 0.55;
      const memoriasFiltradas = (memorias || []).filter((m: Memoria) => (m.similaridade ?? 0) >= MIN_SIMILARIDADE);
      const referenciasFiltradas = (referencias || []).filter((r: Memoria) => (r.similaridade ?? 0) >= MIN_SIMILARIDADE);

      memsUsadas = [...memoriasFiltradas, ...referenciasFiltradas];

      if (tagsAlvo.length) {
        memsUsadas = memsUsadas.filter((m: Memoria) => m.tags?.some(t => tagsAlvo.includes(t)));
      }
    } catch (e) {
      console.warn("⚠️ Erro ao buscar memórias/referências:", (e as Error).message);
      memsUsadas = [];
    }
  }

  if (entrada && perfil && nivel > 1) {
    const memoriaAtual: Memoria = {
      resumo_eco: entrada,
      tags: perfil.temas_recorrentes ? Object.keys(perfil.temas_recorrentes) : [],
      intensidade: 0,
      emocao_principal: Object.keys(perfil.emocoes_frequentes || {})[0] || ''
    };
    memsUsadas = [memoriaAtual, ...(memsUsadas || [])];
  }

  let encadeamentos: Memoria[] = [];
  if (entrada && userId && nivel > 1) {
    try {
      encadeamentos = await buscarEncadeamentosPassados(userId, entrada);
      if (encadeamentos?.length) encadeamentos = encadeamentos.slice(0, 3);
    } catch (e) {
      console.warn("⚠️ Erro ao buscar encadeamentos:", (e as Error).message);
    }
  }

  const modulosAdic: string[] = [];
  const modulosInseridos = new Set<string>();

  const inserirModuloUnico = async (arquivo: string, tipo: string, caminhoBase: string) => {
    if (modulosInseridos.has(arquivo)) return;
    try {
      const conteudo = await fs.readFile(path.join(caminhoBase, arquivo), 'utf-8');
      modulosAdic.push(`\n\n[Módulo ${tipo} → ${arquivo}]\n${conteudo.trim()}`);
      modulosInseridos.add(arquivo);
    } catch (e) {
      console.warn(`⚠️ Falha ao carregar módulo ${arquivo}:`, (e as Error).message);
    }
  };

  for (const arquivo of matrizPromptBase.alwaysInclude) {
    await inserirModuloUnico(arquivo, 'Base', modulosDir);
  }

  const nivelPrompts = (matrizPromptBase.byNivel[nivel as 2 | 3] ?? []).filter((arquivo: string) => {
    if (arquivo === 'METODO_VIVA.txt') {
      const intensidadeAlta = memsUsadas?.some((mem: Memoria) => (mem.intensidade ?? 0) >= 7);
      return intensidadeAlta || nivel === 3;
    }
    return true;
  });

  for (const arquivo of nivelPrompts) {
    await inserirModuloUnico(arquivo, 'Base', modulosDir);
  }

  if (heuristicaAtiva) await inserirModuloUnico(heuristicaAtiva.arquivo, 'Cognitivo', modCogDir);
  for (const h of heuristicasEmbedding) await inserirModuloUnico(h.arquivo, 'Cognitivo', modCogDir);
  for (const mf of modulosFilosoficosAtivos) await inserirModuloUnico(mf.arquivo, 'Filosófico', modFilosDir);
  for (const es of modulosEstoicosAtivos) await inserirModuloUnico(es.arquivo, 'Estoico', modEstoicosDir);

  const modulosEmocionaisAtivos = emocionaisTriggerMap.filter((m: ModuloEmocionalTrigger) => {
    let intensidadeOk = true;
    if (typeof m.intensidadeMinima === 'number') {
      const min = m.intensidadeMinima;
      intensidadeOk = memsUsadas?.some((mem: Memoria) => (mem.intensidade ?? 0) >= min) ?? false;
    }

    const tagsPresentes = memsUsadas?.flatMap(mem => mem.tags ?? []) ?? [];
    const emocoesPrincipais = memsUsadas?.map(mem => mem.emocao_principal).filter(Boolean) ?? [];

    return intensidadeOk && (
      m.tags?.some(tag => tagsPresentes.includes(tag)) ||
      m.tags?.some(tag => emocoesPrincipais.includes(tag))
    );
  });

  for (const me of modulosEmocionaisAtivos) {
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

  modulosAdic.push(
    `\n\n⚠️ INSTRUÇÃO FINAL AO MODELO:\nPor favor, gere a resposta seguindo rigorosamente a estrutura definida no ECO_ESTRUTURA_DE_RESPOSTA.txt. Use as seções numeradas e marcadas com colchetes.`
  );

  const promptFinal = `${contexto.trim()}\n${modulosAdic.join('\n')}`.trim();
  return promptFinal;
}

// ----------------------------------
// EXPRESS HANDLER
// ----------------------------------
export const getPromptEcoPreview = async (_req: Request, res: Response) => {
  try {
    const promptFinal = await montarContextoEco({});
    res.json({ prompt: promptFinal });
  } catch (err) {
    console.error('❌ Erro ao montar prompt:', err);
    res.status(500).json({ error: 'Erro ao montar o prompt' });
  }
};
