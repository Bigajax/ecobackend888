import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express';

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
import { get_encoding } from "@dqbd/tiktoken";

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const isDebug = () => LOG_LEVEL === 'debug';
const log = {
  info: (...a: any[]) => console.log('[ECO]', ...a),
  warn: (...a: any[]) => console.warn('[ECO][WARN]', ...a),
  debug: (...a: any[]) => { if (isDebug()) console.debug('[ECO][DEBUG]', ...a); }
};

// ----------------------------------
// CONFIG
// ----------------------------------
const MAX_PROMPT_TOKENS = Number(process.env.ECO_MAX_PROMPT_TOKENS ?? 8000);
const NIVEL1_BUDGET = Number(process.env.ECO_NIVEL1_BUDGET ?? 2500); // orçamento mais curto p/ nível 1

// ----------------------------------
// TYPES
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
  nivel_abertura?: number;
}

interface Heuristica { arquivo: string; gatilhos: string[]; }
interface ModuloFilosoficoTrigger { arquivo: string; gatilhos: string[]; }

// ----------------------------------
// UTILS
// ----------------------------------
const normalizarTexto = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
const capitalizarNome = (n?: string) => (n ? n.trim().replace(/\b\w/g, c => c.toUpperCase()) : '');
const nivelAberturaParaNumero = (v: string | number | undefined): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const clean = v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    if (clean === 'baixo') return 1; if (clean === 'medio') return 2; if (clean === 'alto') return 3;
  }
  return 1;
};

function construirStateSummary(perfil: PerfilEmocional | null, nivel: number): string {
  if (!perfil) return '';
  const emocoes = Object.keys(perfil.emocoes_frequentes || {}).join(', ') || 'nenhuma';
  const temas = Object.keys(perfil.temas_recorrentes || {}).join(', ') || 'nenhum';
  const abertura = nivel === 1 ? 'superficial' : nivel === 2 ? 'reflexiva' : 'profunda';
  const resumo = perfil.resumo_geral_ia || 'sem resumo geral registrado';
  return `\n🗺️ Estado Emocional Consolidado:
- Emoções frequentes: ${emocoes}
- Temas recorrentes: ${temas}
- Nível de abertura estimado: ${abertura}
- Última interação significativa: ${perfil.ultima_interacao_significativa ?? 'nenhuma'}
- Resumo geral: ${resumo}`.trim();
}

// versão enxuta (não cola frases longas)
function construirNarrativaMemorias(mems: Memoria[]): string {
  if (!mems || mems.length === 0) return '';
  const ord = [...mems].sort((a,b) =>
    (b.intensidade ?? 0) - (a.intensidade ?? 0) ||
    (b.similaridade ?? 0) - (a.similaridade ?? 0)
  ).slice(0, 2);

  const temas = new Set<string>();
  const emocoes = new Set<string>();
  for (const m of ord) {
    (m.tags ?? []).slice(0,3).forEach(t => temas.add(t));
    if (m.emocao_principal) emocoes.add(m.emocao_principal);
  }

  const temasTxt = [...temas].slice(0,3).join(', ') || '—';
  const emocoesTxt = [...emocoes].slice(0,2).join(', ') || '—';
  return `\n📜 Continuidade: temas recorrentes (${temasTxt}) e emoções citadas (${emocoesTxt}); conecte apenas se fizer sentido agora.`;
}

// Cache simples para reduzir I/O
const cacheModulos = new Map<string, string>();
async function lerModulo(arquivo: string, pastas: string[]): Promise<string | null> {
  if (!arquivo || !arquivo.trim()) return null;
  if (cacheModulos.has(arquivo)) return cacheModulos.get(arquivo)!;
  for (const base of pastas) {
    try {
      const caminho = path.join(base, arquivo);
      const conteudo = (await fs.readFile(caminho, 'utf-8')).trim();
      cacheModulos.set(arquivo, conteudo);
      return conteudo;
    } catch { /* tenta próxima pasta */ }
  }
  log.warn(`Falha ao carregar módulo ${arquivo}: não encontrado`);
  return null;
}

// Avaliador seguro de regras simples (substitui variáveis e flags e avalia expressão booleana)
function avaliarRegraSimples(regra: string, ctx: { nivel: number; intensidade: number; curiosidade?: boolean; duvida?: boolean; pedido?: boolean; }): boolean {
  if (!regra || !regra.trim()) return true;
  let expr = String(regra);

  // substituições explícitas
  expr = expr.replace(/intensidade/g, String(ctx.intensidade));
  expr = expr.replace(/nivel/g, String(ctx.nivel));

  // flags (lidar com "==true/false" e isoladas)
  const subFlag = (nome: string, val: boolean) => {
    expr = expr.replace(new RegExp(`${nome}\\s*==\\s*true`, 'g'), val ? '1' : '0');
    expr = expr.replace(new RegExp(`${nome}\\s*==\\s*false`, 'g'), val ? '0' : '1');
    expr = expr.replace(new RegExp(`\\b${nome}\\b`, 'g'), val ? '1' : '0');
  };
  subFlag('curiosidade', !!ctx.curiosidade);
  subFlag('duvida_classificacao', !!ctx.duvida);
  subFlag('pedido_pratico', !!ctx.pedido);

  // permitir apenas caracteres seguros
  const safe = expr.replace(/[^\d\s()&|!<>=]/g, '');
  try {
    // eslint-disable-next-line no-new-func
    return Boolean(Function(`"use strict"; return (${safe});`)());
  } catch (e) {
    log.warn('Regra inválida, aplicando fallback TRUE:', regra);
    return true;
  }
}

// Seleção de módulos por matriz, com gating antes de ler arquivos
function selecionarModulosBase({
  nivel, intensidade, matriz, flags
}: {
  nivel: number;
  intensidade: number;
  matriz: any;
  flags: { curiosidade?: boolean; duvida_classificacao?: boolean; pedido_pratico?: boolean; };
}): string[] {
  const nomes: string[] = [];
  // Always
  for (const arq of (matriz.alwaysInclude ?? [])) if (arq) nomes.push(arq);

  // Por nível (apenas nomes + filtros) — NV1 é tratado no fast-path
  const candidatos = (matriz.byNivel?.[nivel as 2 | 3] ?? []).filter((arquivo: string) => {
    if (!arquivo || !arquivo.trim()) return false;
    const min = matriz.intensidadeMinima?.[arquivo];
    if (typeof min === 'number' && intensidade < min) return false;

    const cond = matriz.condicoesEspeciais?.[arquivo];
    if (!cond) return true;

    return avaliarRegraSimples(cond.regra, {
      nivel,
      intensidade,
      curiosidade: !!flags.curiosidade,
      duvida: !!flags.duvida_classificacao,
      pedido: !!flags.pedido_pratico
    });
  });

  nomes.push(...candidatos);
  return nomes;
}

// Monta corpo de módulos respeitando orçamento de tokens (antes de ler tudo)
async function montarComBudget(nomes: string[], pastas: string[], budgetTokens: number, prioridade?: string[]) {
  const enc = get_encoding('cl100k_base');

  // ordena por prioridade se fornecida
  const orderMap = new Map<string, number>();
  (prioridade ?? []).forEach((n, i) => orderMap.set(n, i));
  const nomesOrdenados = [...new Set(nomes)].sort((a, b) => {
    const ia = orderMap.has(a) ? orderMap.get(a)! : Number.MAX_SAFE_INTEGER;
    const ib = orderMap.has(b) ? orderMap.get(b)! : Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return 0;
  });

  let total = 0;
  const blocos: string[] = [];
  for (const nome of nomesOrdenados) {
    const conteudo = await lerModulo(nome, pastas);
    if (!conteudo) continue;
    const t = enc.encode(conteudo).length;
    if (total + t > budgetTokens) {
      log.info(`Corte por budget: ${nome} ficaria acima do limite (restante ${budgetTokens - total}).`);
      continue;
    }
    total += t;
    blocos.push(conteudo);
  }
  enc.free?.();
  log.info(`Corpo de módulos: ~${total} tokens (budget=${budgetTokens}).`);
  return blocos.join('\n\n');
}

// Deriva “flags” simples da entrada
function derivarFlags(entrada: string) {
  const curiosidade = /\b(por que|porque|pq|como|explica|explic(a|ar)|entender|entende|curios)/i.test(entrada);
  const pedido_pratico = /\b(o que faço|o que eu faço|como faço|como falo|pode ajudar|tem (ideia|dica)|me ajuda|ajuda com|sugest(ão|oes))\b/i.test(entrada);
  const duvida_classificacao = false; // opcional: setar quando a detecção de intensidade estiver ambígua
  return { curiosidade, pedido_pratico, duvida_classificacao };
}

// ----------------------------------
// FUNÇÃO PRINCIPAL
// ----------------------------------
export async function montarContextoEco({
  perfil,
  ultimaMsg,
  userId,
  userName,
  mems,
  forcarMetodoViva = false,
  blocoTecnicoForcado = null,
  heuristicas = [],
  texto,
  userEmbedding,
  skipSaudacao = true,
}: {
  perfil?: PerfilEmocional | null;
  ultimaMsg?: string;
  userId?: string;
  userName?: string;
  mems?: Memoria[];
  forcarMetodoViva?: boolean;
  blocoTecnicoForcado?: any;
  heuristicas?: any[];
  texto?: string;
  userEmbedding?: number[];
  skipSaudacao?: boolean;
}): Promise<string> {
  const assetsDir = path.join(process.cwd(), 'assets');
  const modulosDir = path.join(assetsDir, 'modulos');
  const modCogDir = path.join(assetsDir, 'modulos_cognitivos');
  const modFilosDir = path.join(assetsDir, 'modulos_filosoficos');
  const modEstoicosDir = path.join(modFilosDir, 'estoicos');
  const modEmocDir = path.join(assetsDir, 'modulos_emocionais');

  const forbidden = await fs.readFile(path.join(modulosDir, 'eco_forbidden_patterns.txt'), 'utf-8');

  let contexto = '';
  const entrada = (texto ?? ultimaMsg ?? '').trim();
  const entradaSemAcentos = normalizarTexto(entrada);

  // ----------------------------------
  // SAUDAÇÃO ESPECIAL (fast-path)
  // ----------------------------------
  if (!skipSaudacao) {
    const saudacoesCurtaLista = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite'];
    const isSaudacaoCurta = saudacoesCurtaLista.some((s) => entradaSemAcentos.startsWith(s));
    if (isSaudacaoCurta) {
      log.info('Detecção de saudação curta. Aplicando regra de saudação.');
      try {
        let saudacaoConteudo = await fs.readFile(path.join(modulosDir, 'REGRA_SAUDACAO.txt'), 'utf-8');
        if (userName) saudacaoConteudo = saudacaoConteudo.replace(/\[nome\]/gi, capitalizarNome(userName));
        return `📶 Entrada detectada como saudação breve.

${saudacaoConteudo.trim()}

${forbidden.trim()}`;
      } catch (e) {
        log.warn('Falha ao carregar módulo REGRA_SAUDACAO.txt:', (e as Error).message);
        return `⚠️ Erro ao carregar REGRA_SAUDACAO.`;
      }
    }
  }

  // ----------------------------------
  // NÍVEL DE ABERTURA
  // ----------------------------------
  let nivel = heuristicaNivelAbertura(entrada) || 1;
  if (typeof nivel === 'string') nivel = nivelAberturaParaNumero(nivel);
  if (nivel < 1 || nivel > 3) { log.warn('Nível de abertura inválido. Fallback 1.'); nivel = 1; }
  const desc = nivel === 1 ? 'superficial' : nivel === 2 ? 'reflexiva' : 'profunda';
  contexto += `\n📶 Abertura emocional sugerida (heurística): ${desc}`;

  // ----------------------------------
  // PERFIL EMOCIONAL
  // ----------------------------------
  if (perfil) contexto += `\n\n${construirStateSummary(perfil, nivel)}`;

  // ----------------------------------
  // MEMÓRIAS (evitar custo quando nível é 1)
  // ----------------------------------
  let memsUsadas = mems;
  if (forcarMetodoViva && blocoTecnicoForcado) {
    log.info('Ativando modo forçado METODO_VIVA com bloco técnico fornecido.');
    memsUsadas = [{
      resumo_eco: blocoTecnicoForcado.analise_resumo ?? entrada ?? "",
      intensidade: Number(blocoTecnicoForcado.intensidade ?? 0),
      emocao_principal: blocoTecnicoForcado.emocao_principal ?? "",
      tags: blocoTecnicoForcado.tags ?? [],
    }];
  } else if (nivel === 1) {
    log.info('Ignorando embeddings/memórias por abertura superficial.');
    memsUsadas = [];
  }

  if (memsUsadas && memsUsadas.length > 0) {
    memsUsadas = memsUsadas.map(mem => ({ ...mem, nivel_abertura: nivelAberturaParaNumero(mem.nivel_abertura) }));
  }

  // ----------------------------------
  // HEURÍSTICAS (gatilho literal + fuzzy + embedding)
  // ----------------------------------
  let heuristicaAtiva = heuristicasTriggerMap.find((h: Heuristica) =>
    h.gatilhos.some((g) => entradaSemAcentos.includes(normalizarTexto(g)))
  );

  if (entrada && !heuristicaAtiva) {
    const heuristicasFuzzy = await buscarHeuristicaPorSimilaridade(entrada);
    if (heuristicasFuzzy?.length > 0) {
      heuristicaAtiva = heuristicasFuzzy[0];
      if (heuristicaAtiva?.arquivo) log.info(`Heurística fuzzy ativada: ${heuristicaAtiva.arquivo}`);
    } else {
      log.info('Nenhuma heurística fuzzy ativada.');
    }
  }

  // Heurísticas por embedding
  let heuristicasEmbedding: any[] = [];
  if (Array.isArray(heuristicas) && heuristicas.length > 0) {
    heuristicasEmbedding = heuristicas;
  } else if (entrada) {
    if (entrada.length < 6 && !userEmbedding) {
      log.info('⚠️ Texto curto e nenhum embedding fornecido — pulando busca de heurísticas.');
      heuristicasEmbedding = [];
    } else {
      try {
        heuristicasEmbedding = await buscarHeuristicasSemelhantes({
          usuarioId: userId ?? null,
          userEmbedding,
          texto: userEmbedding ? undefined : entrada,
          matchCount: 5,
          threshold: 0.75,
        } as any);
      } catch {
        heuristicasEmbedding = await buscarHeuristicasSemelhantes(entrada, userId ?? null);
      }
    }
  }
  if (isDebug()) {
    if (heuristicasEmbedding?.length) log.info(`${heuristicasEmbedding.length} heurística(s) cognitivas por embedding.`);
    else log.info('Nenhuma heurística embedding encontrada.');
  }

  // ----------------------------------
  // FILOSÓFICOS / ESTOICOS (apenas se nível >=2 e texto razoável)
  // ----------------------------------
  const podeConteudoExtra = nivel >= 2 && (entrada?.length ?? 0) >= 20;
  const modulosFilosoficosAtivos: ModuloFilosoficoTrigger[] = podeConteudoExtra
    ? filosoficosTriggerMap.filter((f) =>
        f?.arquivo && f?.arquivo.trim() && f.gatilhos.some((g) => entradaSemAcentos.includes(normalizarTexto(g))))
    : [];
  const modulosEstoicosAtivos = podeConteudoExtra
    ? estoicosTriggerMap.filter((e) =>
        e?.arquivo && e?.arquivo.trim() && e.gatilhos.every((g) => entradaSemAcentos.includes(normalizarTexto(g))))
    : [];

  // ----------------------------------
  // BUSCA DE MEMÓRIAS/REFERÊNCIAS (nivel > 1)
  // ----------------------------------
  const tagsAlvo = heuristicaAtiva ? (tagsPorHeuristica[heuristicaAtiva.arquivo] ?? []) : [];
  if (nivel > 1 && (!memsUsadas?.length) && entrada && userId) {
    try {
      let MIN_SIMILARIDADE = 0.55;
      if (/lembr|record|memória|memorias|memoria|recorda/i.test(entrada)) {
        log.info('Detecção de pergunta sobre lembrança: reduzindo threshold.');
        MIN_SIMILARIDADE = 0.3;
      }
      const [memorias, referencias] = await Promise.all([
        buscarMemoriasSemelhantes(userId, { userEmbedding, texto: entrada, k: 6 }),
        buscarReferenciasSemelhantes(userId, { userEmbedding, texto: entrada, k: 5 }),
      ]);

      const memoriasFiltradas = (memorias || []).filter((m: Memoria) => (m.similaridade ?? 0) >= MIN_SIMILARIDADE);
      const referenciasFiltradas = (referencias || []).filter((r: Memoria) => (r.similaridade ?? 0) >= MIN_SIMILARIDADE);

      memsUsadas = [...memoriasFiltradas, ...referenciasFiltradas];

      const memoriaIntensa = memsUsadas.find(m => (m.intensidade ?? 0) >= 7 && (m.similaridade ?? 0) >= MIN_SIMILARIDADE);
      if (memoriaIntensa) {
        log.info('Ajuste: priorizando memória intensa recuperada.');
        memsUsadas = [memoriaIntensa, ...memsUsadas.filter(m => m !== memoriaIntensa)];
      }

      if (isDebug()) {
        if (memsUsadas?.length) {
          const memsResumo = memsUsadas.map((m, i) => ({
            idx: i + 1,
            resumo: (m.resumo_eco || '').slice(0, 50).replace(/\n/g, ' ') + ((m.resumo_eco || '').length > 50 ? '...' : ''),
            intensidade: m.intensidade,
            similaridade: m.similaridade
          }));
          log.info('Memórias finais:', memsResumo);
        } else log.info('ℹ️ Nenhuma memória usada no contexto.');
      }

      if (tagsAlvo.length) memsUsadas = memsUsadas.filter((m) => m.tags?.some((t) => tagsAlvo.includes(t)));
    } catch (e) {
      log.warn('Erro ao buscar memórias/referências:', (e as Error).message);
      memsUsadas = [];
    }
  }

  // Anexar a “memória atual” ao fim (não na frente, para não zerar intensidade)
  if (entrada && perfil && nivel > 1) {
    const memoriaAtual: Memoria = {
      resumo_eco: entrada,
      tags: perfil.temas_recorrentes ? Object.keys(perfil.temas_recorrentes) : [],
      intensidade: 0,
      emocao_principal: Object.keys(perfil.emocoes_frequentes || {})[0] || ''
    };
    memsUsadas = [...(memsUsadas || []), memoriaAtual];
  }

  // Intensidade de contexto = máximo (estável para gating)
  const intensidadeContexto = Math.max(0, ...(memsUsadas ?? []).map(m => m.intensidade ?? 0));

  // ----------------------------------
  // ENCADEAMENTOS (nivel > 1)
  // ----------------------------------
  let encadeamentos: Memoria[] = [];
  if (entrada && userId && nivel > 1) {
    try {
      if (entrada.length < 6 && !userEmbedding) {
        log.info('⚠️ Entrada muito curta e sem embedding — pulando encadeamento.');
      } else {
        const encs = await buscarEncadeamentosPassados(userId, { userEmbedding, texto: entrada, kBase: 1 } as any);
        if (encs?.length) encadeamentos = encs.slice(0, 3) as any;
      }
    } catch (e) {
      log.warn('Erro ao buscar encadeamentos:', (e as Error).message);
    }
  }

  // Inserção de memórias e encadeamentos (texto leve)
  if (memsUsadas && memsUsadas.length > 0 && nivel > 1) {
    contexto += `\n\n${construirNarrativaMemorias(memsUsadas)}`;
  }
  if (encadeamentos?.length) {
    const encadeamentoTextos = encadeamentos
      .filter(e => e?.resumo_eco?.trim())
      .map(e => `• "${e.resumo_eco.trim()}"`)
      .join('\n')
      .trim();
    if (encadeamentoTextos) {
      contexto += `\n\n📝 Encadeamentos relacionados:\n${encadeamentoTextos}`;
    }
  }

  // ----------------------------------
  // SELEÇÃO E MONTAGEM DE MÓDULOS COM ORÇAMENTO
  // ----------------------------------
  const pastasPossiveis = [modEmocDir, modEstoicosDir, modFilosDir, modCogDir, modulosDir];
  const { matrizPromptBase } = await import('./matrizPromptBase');

  const flags = derivarFlags(entrada);
  const nomesBase = selecionarModulosBase({
    nivel, intensidade: intensidadeContexto, matriz: matrizPromptBase, flags
  });

  // Conteúdos extras (heurísticos/filosóficos/estoicos/emocionais) entram como candidatos
  const nomesExtras: string[] = [];

  // Heurísticas (gatilho literal/fuzzy/embedding)
  if (heuristicaAtiva?.arquivo) nomesExtras.push(heuristicaAtiva.arquivo);
  for (const h of heuristicasEmbedding ?? []) if (h?.arquivo) nomesExtras.push(h.arquivo);

  // Filosóficos / Estoicos (apenas se podeConteudoExtra)
  if (podeConteudoExtra) {
    for (const mf of modulosFilosoficosAtivos ?? []) if (mf?.arquivo) nomesExtras.push(mf.arquivo);
    for (const es of modulosEstoicosAtivos ?? []) if (es?.arquivo) nomesExtras.push(es.arquivo);
  }

  // Emocionais (por tags/intensidade)
  const modulosEmocionaisAtivos = emocionaisTriggerMap.filter((m: ModuloEmocionalTrigger) => {
    if (!m?.arquivo) return false;
    let intensidadeOk = true;
    const minInt = m.intensidadeMinima;
    if (typeof minInt === 'number') intensidadeOk = memsUsadas?.some((mem) => (mem.intensidade ?? 0) >= minInt) ?? false;
    const tagsPresentes = memsUsadas?.flatMap(mem => mem.tags ?? []) ?? [];
    const emocoesPrincipais = memsUsadas?.map(mem => mem.emocao_principal).filter(Boolean) ?? [];
    return intensidadeOk && (
      m.tags?.some(tag => tagsPresentes.includes(tag)) ||
      m.tags?.some(tag => emocoesPrincipais.includes(tag))
    );
  });
  for (const me of modulosEmocionaisAtivos ?? []) if (me?.arquivo) nomesExtras.push(me.arquivo);
  for (const me of modulosEmocionaisAtivos ?? []) if (me?.relacionado?.length) {
    for (const rel of me.relacionado) nomesExtras.push(rel);
  }

  // Orçamento: primeiro mede o contexto, depois usa o restante para módulos
  const enc = get_encoding('cl100k_base');
  const tokensContexto = enc.encode(contexto).length;
  enc.free?.();
  const budgetRestante = Math.max(1000, MAX_PROMPT_TOKENS - tokensContexto - 200); // 200 de folga

  // Early return para Nível 1 (super enxuto + orquestrador NV1)
  if (nivel === 1) {
    const nomesNv1 = [
      ...(matrizPromptBase.alwaysInclude ?? []),
      'ECO_ORQUESTRA_NIVEL1.txt' // <- NV1 só aqui
    ];

    const corpoNivel1 = await montarComBudget(
      nomesNv1,
      [modulosDir],
      Math.min(budgetRestante, NIVEL1_BUDGET)
    );

    const instrucoesNivel1 = `\n⚠️ INSTRUÇÃO:
- Responda breve (≤ 3 linhas), sem perguntas exploratórias.
- Acolha e respeite silêncio. Não usar memórias neste nível.
- Use a Estrutura Padrão de Resposta como planejamento interno, mas NÃO exiba títulos/numeração.`;

    const forbiddenOnce = `\n${forbidden.trim()}`;

    return `${contexto.trim()}\n\n${corpoNivel1}\n\n${instrucoesNivel1}\n\n${forbiddenOnce}`.trim();
  }

  // Para níveis 2/3: monta base + extras dentro do budget
  const nomesSelecionados = [...nomesBase, ...nomesExtras];

  // Prioridade opcional (se definida na matriz)
  const prioridade: string[] | undefined = (matrizPromptBase as any)?.limites?.prioridade;

  const corpoModulos = await montarComBudget(
    nomesSelecionados,
    pastasPossiveis,
    budgetRestante,
    prioridade
  );

  // Instruções finais coerentes (sem exigir “seções numeradas”)
  const instrucoesFinais = `\n⚠️ INSTRUÇÃO AO MODELO:
- Use memórias/contexto como suporte, não como script.
- Ajuste a profundidade e o tom conforme o nível de abertura (superficial, reflexiva, profunda).
- Respeite o ritmo e a autonomia do usuário.
- Evite soluções prontas e interpretações rígidas.
- Use a “Estrutura Padrão de Resposta” como planejamento interno (6 partes), mas NÃO exiba títulos/numeração.
- Se notar padrões, convide à consciência com hipóteses leves — não diagnostique.`;

  // eco_json_trigger_criteria e MEMORIAS_NO_CONTEXTO entram uma única vez no final
  let criterios = '';
  try {
    criterios = (await fs.readFile(path.join(modulosDir, 'eco_json_trigger_criteria.txt'), 'utf-8')).trim();
  } catch (e) {
    log.warn('Falha ao carregar eco_json_trigger_criteria.txt:', (e as Error).message);
  }

  let memoriaInstrucoes = '';
  try {
    memoriaInstrucoes = (await fs.readFile(path.join(modulosDir, 'MEMORIAS_NO_CONTEXTO.txt'), 'utf-8')).trim();
  } catch (e) {
    log.warn('Falha ao carregar MEMORIAS_NO_CONTEXTO.txt:', (e as Error).message);
  }

  const forbiddenOnce = `\n${forbidden.trim()}`;

  const promptFinal = [
    contexto.trim(),
    corpoModulos.trim(),
    criterios ? `\n${criterios}` : '',
    memoriaInstrucoes ? `\n${memoriaInstrucoes}` : '',
    instrucoesFinais,
    forbiddenOnce
  ].filter(Boolean).join('\n\n').trim();

  // Log de tokens final (sem cortes binários)
  try {
    const enc2 = get_encoding('cl100k_base');
    const totalTokens = enc2.encode(promptFinal).length;
    enc2.free?.();
    log.info(`Tokens estimados (final): ~${totalTokens} (budget=${MAX_PROMPT_TOKENS})`);
  } catch (error) {
    log.warn('Falha ao estimar tokens finais:', (error as Error).message);
  }

  return promptFinal;
}

// ----------------------------------
// EXPRESS HANDLER (preview)
// ----------------------------------
export const getPromptEcoPreview = async (_req: Request, res: Response) => {
  try {
    const promptFinal = await montarContextoEco({});
    res.json({ prompt: promptFinal });
  } catch (err) {
    log.warn('❌ Erro ao montar prompt:', err as any);
    res.status(500).json({ error: 'Erro ao montar o prompt' });
  }
};
