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
import { get_encoding } from '@dqbd/tiktoken';

// ⬇️ Regras seguras (novo avaliador)
import { evalRule } from '../utils/ruleEval';

// ⬇️ Triggers de regulação (grounding/box/dispenza)
import {
  melhorPratica,
  extrairTempoMencionado,
} from '../assets/config/regulacaoTriggers';

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const isDebug = () => LOG_LEVEL === 'debug';
const log = {
  info: (...a: any[]) => console.log('[ECO]', ...a),
  warn: (...a: any[]) => console.warn('[ECO][WARN]', ...a),
  debug: (...a: any[]) => {
    if (isDebug()) console.debug('[ECO][DEBUG]', ...a);
  },
};

// ----------------------------------
// CONFIG
// ----------------------------------
const MAX_PROMPT_TOKENS = Number(process.env.ECO_MAX_PROMPT_TOKENS ?? 8000);
const NIVEL1_BUDGET = Number(process.env.ECO_NIVEL1_BUDGET ?? 2500);
const HARD_CAP_EXTRAS = 6; // limite de extras por turno
const TIMEOUT_FUZZY_MS = 1500;
const TIMEOUT_EMB_MS = 2200;
const TIMEOUT_MEM_MS = 2200;
const TIMEOUT_ENC_MS = 2000;

// ----------------------------------
// TYPES (locais; mantemos soltos para acoplar pouco)
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

interface Heuristica {
  arquivo: string;
  gatilhos: string[];
}
interface ModuloFilosoficoTrigger {
  arquivo: string;
  gatilhos: string[];
}

// ----------------------------------
// UTILS
// ----------------------------------
const normalizarTexto = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
const capitalizarNome = (n?: string) =>
  n ? n.trim().replace(/\b\w/g, (c) => c.toUpperCase()) : '';
const nivelAberturaParaNumero = (v: string | number | undefined): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const clean = v
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    if (clean === 'baixo') return 1;
    if (clean === 'medio') return 2;
    if (clean === 'alto') return 3;
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
  const ord = [...mems]
    .sort(
      (a, b) =>
        (b.intensidade ?? 0) - (a.intensidade ?? 0) ||
        (b.similaridade ?? 0) - (a.similaridade ?? 0),
    )
    .slice(0, 2);

  const temas = new Set<string>();
  const emocoes = new Set<string>();
  for (const m of ord) {
    (m.tags ?? []).slice(0, 3).forEach((t) => temas.add(t));
    if (m.emocao_principal) emocoes.add(m.emocao_principal);
  }

  const temasTxt = [...temas].slice(0, 3).join(', ') || '—';
  const emocoesTxt = [...emocoes].slice(0, 2).join(', ') || '—';
  return `\n📜 Continuidade: temas recorrentes (${temasTxt}) e emoções citadas (${emocoesTxt}); conecte apenas se fizer sentido agora.`;
}

// --- Minificador leve para cortar tokens supérfluos ---
function minifyTextSafe(s: string) {
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// --- Timeouts util ---
function withTimeout<T>(p: Promise<T>, ms: number, label = 'task'): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(id);
      resolve(v);
    }).catch((e) => {
      clearTimeout(id);
      reject(e);
    });
  });
}

// Cache estático de arquivos e índice de módulos (evita ENOENTs)
const staticCache = new Map<string, string>();
async function readStaticOnce(p: string) {
  if (staticCache.has(p)) return staticCache.get(p)!;
  const c = (await fs.readFile(p, 'utf-8')).trim();
  staticCache.set(p, c);
  return c;
}

const cacheModulos = new Map<string, string>();
const fileIndex = new Map<string, string>(); // nome -> caminho absoluto
let fileIndexBuilt = false;

async function buildFileIndexOnce(roots: string[]) {
  if (fileIndexBuilt) return;
  for (const base of roots) {
    try {
      const entries = await fs.readdir(base);
      for (const name of entries) {
        if (!fileIndex.has(name)) fileIndex.set(name, path.join(base, name));
      }
    } catch {
      /* ignore pasta ausente */
    }
  }
  fileIndexBuilt = true;
}

async function lerModulo(arquivo: string, pastas: string[]): Promise<string | null> {
  if (!arquivo || !arquivo.trim()) return null;
  if (cacheModulos.has(arquivo)) return cacheModulos.get(arquivo)!;

  // usa índice (rápido), se possível
  try {
    await buildFileIndexOnce(pastas);
    const p = fileIndex.get(arquivo);
    if (p) {
      const conteudo = (await fs.readFile(p, 'utf-8')).trim();
      cacheModulos.set(arquivo, conteudo);
      return conteudo;
    }
  } catch {
    /* fallback para busca manual */
  }

  // fallback: tentar manualmente (já com ordem otimizada de pastas)
  for (const base of pastas) {
    try {
      const caminho = path.join(base, arquivo);
      const conteudo = (await fs.readFile(caminho, 'utf-8')).trim();
      cacheModulos.set(arquivo, conteudo);
      return conteudo;
    } catch {
      /* tenta próxima pasta */
    }
  }
  log.warn(`Falha ao carregar módulo ${arquivo}: não encontrado`);
  return null;
}

// ----------------------------------
// 🔹 SUPORTE À MATRIZ V2 COM HERANÇA
// ----------------------------------
type Nivel = 1 | 2 | 3;
function isV2Matrix(m: any): boolean {
  return !!m?.byNivelV2 && !!m?.baseModules;
}
function resolveModulesForLevelV2(nivel: Nivel, m: any): string[] {
  const levelCfg = m.byNivelV2[nivel];
  if (!levelCfg) return [];
  const inherited = levelCfg.inherits.flatMap((cat: string) => m.baseModules?.[cat] ?? []);
  return [...inherited, ...levelCfg.specific];
}
function modulesForNivel(nivel: Nivel, m: any): { raw: string[]; inherited: string[]; specific: string[] } {
  if (isV2Matrix(m)) {
    const levelCfg = m.byNivelV2[nivel];
    const inherited = levelCfg?.inherits?.flatMap((cat: string) => m.baseModules?.[cat] ?? []) ?? [];
    const specific = levelCfg?.specific ?? [];
    const raw = [...inherited, ...specific];
    return { raw, inherited, specific };
  }
  // fallback V1
  const raw = [ ...(m.alwaysInclude ?? []), ...(m.byNivel?.[nivel] ?? []) ];
  return { raw, inherited: m.alwaysInclude ?? [], specific: m.byNivel?.[nivel] ?? [] };
}

// ------------------------------
// Seleção de módulos base (com V2 + gating + logs)
// ------------------------------
function selecionarModulosBase({
  nivel,
  intensidade,
  matriz,
  flags,
}: {
  nivel: Nivel;
  intensidade: number;
  matriz: any; // aceita V1 ou V2
  flags: { curiosidade?: boolean; duvida_classificacao?: boolean; pedido_pratico?: boolean };
}): {
  selecionados: string[];
  debug: {
    raw: string[];
    inherited: string[];
    specific: string[];
    posGating: string[];
    cortadosPorRegraOuIntensidade: string[];
  };
} {
  const { raw, inherited, specific } = modulesForNivel(nivel, matriz);

  // Dedup inicial
  const dedup = [...new Set(raw)];

  const cortados: string[] = [];
  const posGating = dedup.filter((arquivo) => {
    if (!arquivo || !arquivo.trim()) return false;

    // intensidade mínima
    const min = matriz.intensidadeMinima?.[arquivo];
    if (typeof min === 'number' && intensidade < min) {
      cortados.push(`${arquivo} [min=${min}, intensidade=${intensidade}]`);
      return false;
    }

    // regra semântica
    const cond = matriz.condicoesEspeciais?.[arquivo];
    if (!cond) return true;

    const ok = evalRule(cond.regra, {
      nivel,
      intensidade,
      curiosidade: !!flags.curiosidade,
      duvida_classificacao: !!flags.duvida_classificacao,
      pedido_pratico: !!flags.pedido_pratico,
    });

    if (!ok) cortados.push(`${arquivo} [regra=${cond.regra}]`);
    return ok;
  });

  log.info(`[ACT][MATRIX] versão: ${isV2Matrix(matriz) ? 'V2' : 'V1'}`);
  log.info('[ACT][MATRIX] herdados:', inherited);
  log.info('[ACT][MATRIX] específicos:', specific);
  log.info('[ACT][MATRIX] base(raw dedup):', dedup);
  log.info('[ACT][MATRIX] base(posGating):', posGating);
  if (cortados.length) log.info('[ACT][MATRIX] cortados (regra/intensidade):', cortados);

  return {
    selecionados: posGating,
    debug: { raw: dedup, inherited, specific, posGating, cortadosPorRegraOuIntensidade: cortados },
  };
}

// Monta corpo respeitando orçamento (usa encoder reutilizado) + LOG do que entrou/cortou
async function montarComBudget(
  nomes: string[],
  pastas: string[],
  budgetTokens: number,
  prioridade: string[] | undefined,
  enc: ReturnType<typeof get_encoding>,
) {
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
  const incluidos: string[] = [];
  const cortados: string[] = [];

  for (const nome of nomesOrdenados) {
    const conteudo = await lerModulo(nome, pastas);
    if (!conteudo) { cortados.push(`${nome} [missing]`); continue; }
    const t = enc.encode(conteudo).length;
    // se faltar menos de 10% do budget, corta para evitar estouro no final
    if (total + t > budgetTokens || budgetTokens - total < Math.ceil(budgetTokens * 0.1)) {
      log.info(`Corte por budget: ${nome} ficaria acima do limite (restante ${budgetTokens - total}).`);
      cortados.push(`${nome} [budget]`);
      continue;
    }
    total += t;
    blocos.push(conteudo);
    incluidos.push(nome);
  }

  log.info('[ACT][BUDGET] incluídos:', incluidos);
  if (cortados.length) log.info('[ACT][BUDGET] cortados:', cortados);
  log.info(`Corpo de módulos: ~${total} tokens (budget=${budgetTokens}).`);

  return minifyTextSafe(blocos.join('\n\n'));
}

// Deriva flags simples (evita tratar "como vai" como curiosidade)
function derivarFlags(entrada: string) {
  const curiosidade = /\b(por que|porque|pq|explica|explic(a|ar)|entender|entende|curios)\b/i.test(entrada);
  const pedido_pratico =
    /\b(o que faço|o que eu faço|como faço|como falo|pode ajudar|tem (ideia|dica)|me ajuda|ajuda com|sugest(ão|oes))\b/i.test(
      entrada,
    );
  const duvida_classificacao = false;
  return { curiosidade, pedido_pratico, duvida_classificacao };
}

// Helper para decidir módulos de regulação (triggers)
function decidirModulosRegulacao(msg: string, nivel: number, intensidade: number): string[] {
  if (nivel <= 1) return [];
  const tempo = extrairTempoMencionado(msg);
  const melhor = melhorPratica({
    texto: msg,
    nivelAbertura: nivel,
    intensidade,
    tempoMinDisponivel: tempo ?? null,
  });
  if (!melhor) return [];
  const extras =
    intensidade >= 7 && melhor.modulo !== 'ORIENTACAO_GROUNDING.txt'
      ? ['ORIENTACAO_GROUNDING.txt']
      : [];
  // garante unicidade
  return [...new Set([melhor.modulo, ...extras])];
}

// ----------------------------------
// SAUDAÇÃO (regex robusto, alinhado ao fast-path global)
// ----------------------------------
const MAX_LEN_FOR_GREETING = 40;
const GREET_RE =
  /^(?:(?:oi+|oie+|ola+|ol[aá]|alo+|opa+|salve)(?:[, ]*(?:tudo\s*bem|td\s*bem))?|tudo\s*(?:bem|bom|certo)|oi+[, ]*tudo\s*bem|ol[aá]\s*eco|oi\s*eco|oie\s*eco|ola\s*eco|alo\s*eco|bom\s*dia+|boa\s*tarde+|boa\s*noite+|boa\s*madrugada+|e\s*a[ei]|e\s*a[ií]\??|eai|eae|fala(?:\s*ai)?|falae|hey+|hi+|hello+|yo+|sup|beleza|blz|suave|de\s*boa|tranq(?:s)?|tranquilo(?:\s*ai)?|como\s*(?:vai|vc\s*esta|voce\s*esta|ce\s*ta|c[eu]\s*ta))(?:[\s,]*(@?eco|eco|bot|assistente|ai|chat))?\s*[!?.…]*$/i;

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
  skipSaudacao = true, // se o controller já tratou fast-path, mantém true
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

  // Ordem otimizada: põe modulosDir primeiro
  const pastasPossiveis = [modulosDir, modEmocDir, modEstoicosDir, modFilosDir, modCogDir];

  const forbidden = await readStaticOnce(path.join(modulosDir, 'eco_forbidden_patterns.txt'));

  // Encoder único por request
  const enc = get_encoding('cl100k_base');

  let contexto = '';
  const entrada = (texto ?? ultimaMsg ?? '').trim();
  const entradaSemAcentos = normalizarTexto(entrada);

  // Embedding único da entrada (reuso se vier). NÃO geramos aqui para não custar em NV1.
  const entradaEmbedding: number[] | null = userEmbedding && userEmbedding.length ? userEmbedding : null;

  // --- Detecta saudação breve (alinhado ao fast-path) ---
  const isSaudacaoBreve =
    entradaSemAcentos.length > 0 &&
    entradaSemAcentos.length <= MAX_LEN_FOR_GREETING &&
    GREET_RE.test(entradaSemAcentos);

  if (isSaudacaoBreve) {
    contexto += `\n🔎 Detecção: entrada reconhecida como saudação breve. Evite perguntas de abertura; acolha sem repetir a saudação.`;
  }

  // ----------------------------------
  // SAUDAÇÃO ESPECIAL (fast-path local) — só se skipSaudacao == false
  // ----------------------------------
  if (!skipSaudacao && isSaudacaoBreve) {
    log.info('Detecção de saudação curta (modo local). Aplicando REGRA_SAUDACAO.');
    try {
      let saudacaoConteudo = await readStaticOnce(path.join(modulosDir, 'REGRA_SAUDACAO.txt'));
      if (userName) saudacaoConteudo = saudacaoConteudo.replace(/\[nome\]/gi, capitalizarNome(userName));
      return minifyTextSafe(`📶 Entrada detectada como saudação breve.

${saudacaoConteudo.trim()}

${forbidden.trim()}`);
    } catch (e) {
      log.warn('Falha ao carregar módulo REGRA_SAUDACAO.txt:', (e as Error).message);
      return `⚠️ Erro ao carregar REGRA_SAUDACAO.`;
    }
  }

  // ----------------------------------
  // NÍVEL DE ABERTURA
  // ----------------------------------
  let nivel = heuristicaNivelAbertura(entrada) || 1;
  if (typeof nivel === 'string') nivel = nivelAberturaParaNumero(nivel);
  // Força NV1 quando saudação breve (para baratear o contexto)
  if (isSaudacaoBreve) nivel = 1;

  if (nivel < 1 || nivel > 3) {
    log.warn('Nível de abertura inválido. Fallback 1.');
    nivel = 1;
  }
  const desc = nivel === 1 ? 'superficial' : nivel === 2 ? 'reflexiva' : 'profunda';
  contexto += `\n📶 Abertura emocional sugerida (heurística): ${desc}`;
  log.info('[ACT] nivel:', nivel);

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
    memsUsadas = [
      {
        resumo_eco: blocoTecnicoForcado.analise_resumo ?? entrada ?? '',
        intensidade: Number(blocoTecnicoForcado.intensidade ?? 0),
        emocao_principal: blocoTecnicoForcado.emocao_principal ?? '',
        tags: blocoTecnicoForcado.tags ?? [],
      },
    ];
  } else if (nivel === 1) {
    log.info('Ignorando embeddings/memórias por abertura superficial (NV1).');
    memsUsadas = [];
  }

  if (memsUsadas && memsUsadas.length > 0) {
    memsUsadas = memsUsadas.map((mem) => ({
      ...mem,
      nivel_abertura: nivelAberturaParaNumero(mem.nivel_abertura),
    }));
  }

  // ----------------------------------
  // HEURÍSTICAS (gatilho literal + fuzzy + embedding)
  // → PULAR COMPLETAMENTE em NV1 para reduzir latência/custo
  // ----------------------------------
  let heuristicaAtiva: Heuristica | undefined = undefined;

  if (nivel > 1) {
    // literal
    heuristicaAtiva = heuristicasTriggerMap.find((h: Heuristica) =>
      h.gatilhos.some((g) => entradaSemAcentos.includes(normalizarTexto(g))),
    );

    const tarefasHeur: Record<string, Promise<any>> = {
      fuzzy: entrada
        ? withTimeout(buscarHeuristicaPorSimilaridade(entrada), TIMEOUT_FUZZY_MS, 'heuristicaFuzzy')
        : Promise.resolve([]),
      emb: entrada
        ? entradaEmbedding
          ? withTimeout(
              buscarHeuristicasSemelhantes({
                usuarioId: userId ?? null,
                userEmbedding: entradaEmbedding,
                matchCount: 5,
                threshold: 0.75,
              } as any),
              TIMEOUT_EMB_MS,
              'heuristicasEmbedding',
            )
          : withTimeout(
              buscarHeuristicasSemelhantes(entrada, userId ?? null),
              TIMEOUT_EMB_MS,
              'heuristicasEmbeddingText',
            )
        : Promise.resolve([]),
    };

    const [rFuzzy, rHeurEmb] = await Promise.allSettled([tarefasHeur.fuzzy, tarefasHeur.emb]);
    const heuristicasFuzzy = rFuzzy.status === 'fulfilled' ? rFuzzy.value || [] : [];
    var heuristicasEmbedding: any[] = rHeurEmb.status === 'fulfilled' ? rHeurEmb.value || [] : [];

    if (!heuristicaAtiva && heuristicasFuzzy?.length > 0) {
      heuristicaAtiva = heuristicasFuzzy[0];
      if (heuristicaAtiva?.arquivo) log.info(`Heurística fuzzy ativada: ${heuristicaAtiva.arquivo}`);
    } else if (!heuristicaAtiva) {
      log.info('Nenhuma heurística fuzzy ativada.');
    }
    if (isDebug()) {
      if (heuristicasEmbedding?.length)
        log.info(`${heuristicasEmbedding.length} heurística(s) cognitivas por embedding.`);
      else log.info('Nenhuma heurística embedding encontrada.');
    }
  } else {
    // NV1 → sem custo de heurística
    var heuristicasEmbedding: any[] = [];
  }

  // ----------------------------------
  // BUSCA DE MEMÓRIAS/REFERÊNCIAS/ENCADEAMENTOS (nivel > 1) — paralelo
  // ----------------------------------
  const tagsAlvo = heuristicaAtiva ? tagsPorHeuristica[heuristicaAtiva.arquivo] ?? [] : [];
  if (nivel > 1 && !memsUsadas?.length && entrada && userId) {
    try {
      let MIN_SIMILARIDADE = 0.15;
      if (/lembr|record|memória|memorias|memoria|recorda/i.test(entrada)) {
        log.info('Detecção de pergunta sobre lembrança: reduzindo threshold.');
        MIN_SIMILARIDADE = 0.12;
      }

      const tarefas: Record<string, Promise<any>> = {
        mems: entradaEmbedding
          ? withTimeout(
              buscarMemoriasSemelhantes(userId, {
                userEmbedding: entradaEmbedding,
                k: 6,
                threshold: MIN_SIMILARIDADE,
              }),
              TIMEOUT_MEM_MS,
              'memorias',
            )
          : withTimeout(
              buscarMemoriasSemelhantes(userId, { texto: entrada, k: 6, threshold: MIN_SIMILARIDADE } as any),
              TIMEOUT_MEM_MS,
              'memoriasTexto',
            ),
        refs: entradaEmbedding
          ? withTimeout(
              buscarReferenciasSemelhantes(userId, {
                userEmbedding: entradaEmbedding,
                k: 5,
                threshold: MIN_SIMILARIDADE,
              }),
              TIMEOUT_MEM_MS,
              'referencias',
            )
          : withTimeout(
              buscarReferenciasSemelhantes(userId, { texto: entrada, k: 5, threshold: MIN_SIMILARIDADE } as any),
              TIMEOUT_MEM_MS,
              'referenciasTexto',
            ),
        encs: entradaEmbedding
          ? withTimeout(
              buscarEncadeamentosPassados(userId, { userEmbedding: entradaEmbedding, kBase: 1 } as any),
              TIMEOUT_ENC_MS,
              'encadeamentos',
            )
          : withTimeout(
              buscarEncadeamentosPassados(userId, { texto: entrada, kBase: 1 } as any),
              TIMEOUT_ENC_MS,
              'encadeamentosTexto',
            ),
      };

      const [rMems, rRefs, rEncs] = await Promise.allSettled([tarefas.mems, tarefas.refs, tarefas.encs]);
      let memorias = rMems.status === 'fulfilled' ? rMems.value || [] : [];
      let referencias = rRefs.status === 'fulfilled' ? rRefs.value || [] : [];
      let encadeamentos = rEncs.status === 'fulfilled' ? rEncs.value || [] : [];

      const memoriasFiltradas = (memorias || []).filter((m: Memoria) => (m.similaridade ?? 0) >= MIN_SIMILARIDADE);
      const referenciasFiltradas = (referencias || []).filter((r: Memoria) => (r.similaridade ?? 0) >= MIN_SIMILARIDADE);

      memsUsadas = [...memoriasFiltradas, ...referenciasFiltradas]
        .sort((a, b) => (b.similaridade ?? 0) - (a.similaridade ?? 0))
        .slice(0, 3);

      const memoriaIntensa = memsUsadas.find(
        (m) => (m.intensidade ?? 0) >= 7 && (m.similaridade ?? 0) >= MIN_SIMILARIDADE,
      );
      if (memoriaIntensa) {
        log.info('Ajuste: priorizando memória intensa recuperada.');
        memsUsadas = [memoriaIntensa, ...memsUsadas.filter((m) => m !== memoriaIntensa)];
      }

      if (isDebug()) {
        if (memsUsadas?.length) {
          const memsResumo = memsUsadas.map((m, i) => ({
            idx: i + 1,
            resumo:
              (m.resumo_eco || '').slice(0, 50).replace(/\n/g, ' ') +
              ((m.resumo_eco || '').length > 50 ? '...' : ''),
            intensidade: m.intensidade,
            similaridade: m.similaridade,
          }));
          log.info('Memórias finais:', memsResumo);
        } else log.info('ℹ️ Nenhuma memória usada no contexto.');
      }

      if (tagsAlvo.length) {
        memsUsadas = memsUsadas.filter((m) => m.tags?.some((t) => tagsAlvo.includes(t)));
      }

      // Encadeamentos (texto leve)
      if (encadeamentos?.length) {
        const encadeamentoTextos = (encadeamentos as Memoria[])
          .filter((e) => e?.resumo_eco?.trim())
          .map((e) => `• "${e.resumo_eco.trim()}"`)
          .join('\n')
          .trim();
        if (encadeamentoTextos) {
          contexto += `\n\n📝 Encadeamentos relacionados:\n${encadeamentoTextos}`;
        }
      }
    } catch (e) {
      log.warn('Erro ao buscar memórias/referências:', (e as Error).message);
      memsUsadas = [];
    }
  }

  // Anexar memória atual (leve)
  if (entrada && perfil && nivel > 1) {
    const memoriaAtual: Memoria = {
      resumo_eco: entrada,
      tags: perfil.temas_recorrentes ? Object.keys(perfil.temas_recorrentes) : [],
      intensidade: 0,
      emocao_principal: Object.keys(perfil.emocoes_frequentes || {})[0] || '',
    };
    memsUsadas = [...(memsUsadas || []), memoriaAtual];
  }

  // Intensidade de contexto = máximo
  const intensidadeContexto = Math.max(0, ...(memsUsadas ?? []).map((m) => m.intensidade ?? 0));
  log.info('[ACT] intensidadeContexto(max mems):', intensidadeContexto);

  // Inserção de memórias (texto leve)
  if (memsUsadas && memsUsadas.length > 0 && nivel > 1) {
    contexto += `\n\n${construirNarrativaMemorias(memsUsadas)}`;
  }

  // ----------------------------------
  // SELEÇÃO E MONTAGEM DE MÓDULOS COM ORÇAMENTO
  // ----------------------------------
  // Import dinâmico para aceitar arquivos que exportem V1 e/ou V2
  const mod = await import('./matrizPromptBase');
  const matriz = (mod as any).matrizPromptBaseV2 ?? (mod as any).matrizPromptBase;

  const flags = derivarFlags(entrada);
  const baseSel = selecionarModulosBase({
    nivel: nivel as Nivel,
    intensidade: intensidadeContexto,
    matriz,
    flags,
  });
  const nomesBase = baseSel.selecionados;
  log.info('[ACT] always/core base info:', {
    versao: isV2Matrix(matriz) ? 'V2' : 'V1',
    herdados: baseSel.debug.inherited,
    especificos: baseSel.debug.specific,
  });
  log.info('[ACT] base(posGating):', nomesBase);

  // Módulos de regulação (antes dos extras)
  const modReg = decidirModulosRegulacao(entrada, nivel, intensidadeContexto);
  log.info('[ACT] regulacao:', modReg);

  // Extras (heurísticos/filosóficos/estoicos/emocionais)
  const nomesExtras: string[] = [];
  if (heuristicaAtiva?.arquivo) nomesExtras.push(heuristicaAtiva.arquivo);
  for (const h of heuristicasEmbedding ?? []) if (h?.arquivo) nomesExtras.push(h.arquivo);

  const podeConteudoExtra = nivel >= 2 && (entrada?.length ?? 0) >= 20;
  if (podeConteudoExtra) {
    for (const mf of filosoficosTriggerMap ?? []) {
      if (
        mf?.arquivo &&
        mf?.arquivo.trim() &&
        mf.gatilhos.some((g) => entradaSemAcentos.includes(normalizarTexto(g)))
      ) {
        nomesExtras.push(mf.arquivo);
      }
    }
    for (const es of estoicosTriggerMap ?? []) {
      if (
        es?.arquivo &&
        es?.arquivo.trim() &&
        es.gatilhos.every((g) => entradaSemAcentos.includes(normalizarTexto(g)))
      ) {
        nomesExtras.push(es.arquivo);
      }
    }
  }

  const modulosEmocionaisAtivos = emocionaisTriggerMap.filter((m: ModuloEmocionalTrigger) => {
    if (!m?.arquivo) return false;
    let intensidadeOk = true;
    const minInt = m.intensidadeMinima;
    if (typeof minInt === 'number')
      intensidadeOk = memsUsadas?.some((mem) => (mem.intensidade ?? 0) >= minInt) ?? false;
    const tagsPresentes = memsUsadas?.flatMap((mem) => mem.tags ?? []) ?? [];
    const emocoesPrincipais = memsUsadas?.map((mem) => mem.emocao_principal).filter(Boolean) ?? [];
    return (
      intensidadeOk &&
      (m.tags?.some((tag) => tagsPresentes.includes(tag)) ||
        m.tags?.some((tag) => emocoesPrincipais.includes(tag)))
    );
  });
  for (const me of modulosEmocionaisAtivos ?? []) if (me?.arquivo) nomesExtras.push(me.arquivo);
  for (const me of modulosEmocionaisAtivos ?? []) if (me?.relacionado?.length) {
    for (const rel of me.relacionado) nomesExtras.push(rel);
  }

  const extrasCapados = [...new Set(nomesExtras)].slice(0, HARD_CAP_EXTRAS);
  log.info(`[ACT] extrasCandidatos(cap=${HARD_CAP_EXTRAS}):`, extrasCapados);

  // Tokens usados por contexto; budget restante
  const contextoMin = minifyTextSafe(contexto);
  const tokensContexto = enc.encode(contextoMin).length;
  const budgetRestante = Math.max(1000, MAX_PROMPT_TOKENS - tokensContexto - 200);
  log.info('[ACT] tokensContexto:', tokensContexto, '| budgetRestante:', budgetRestante);

  // Guard anti-saudação para evitar aberturas “como você chega…”
  const antiSaudacaoGuard = `
NÃO inicie a resposta com fórmulas como:
- "como você chega", "como você está chegando", "como chega aqui hoje", "como você chega hoje".
Se a mensagem do usuário for apenas uma saudação breve, não repita a saudação, não faça perguntas fenomenológicas de abertura; apenas acolha de forma simples quando apropriado.`.trim();

  // Early return para Nível 1 (preset leve; sem memórias; sem heurísticas)
  if (nivel === 1) {
    const nomesNv1 = isV2Matrix(matriz)
      ? resolveModulesForLevelV2(1, matriz)
      : [ ...(matriz.alwaysInclude ?? []), 'ECO_ORQUESTRA_NIVEL1.txt' ];
    log.info('[ACT][NV1] selecionados:', nomesNv1, '| budgetNv1:', Math.min(budgetRestante, NIVEL1_BUDGET));

    const corpoNivel1 = await montarComBudget(
      nomesNv1,
      [modulosDir],
      Math.min(budgetRestante, NIVEL1_BUDGET),
      undefined,
      enc,
    );

    const instrucoesNivel1 = `\n⚠️ INSTRUÇÃO:
- Responda breve (≤ 3 linhas), sem perguntas exploratórias.
- Acolha e respeite silêncio. Não usar memórias neste nível.
- Use a Estrutura Padrão de Resposta como planejamento interno, mas NÃO exiba títulos/numeração.
- ${antiSaudacaoGuard}`;

    const forbiddenOnce = `\n${forbidden.trim()}\n${antiSaudacaoGuard}`;

    const finalNv1 = minifyTextSafe(
      `${contextoMin}\n\n${corpoNivel1}\n\n${instrucoesNivel1}\n\n${forbiddenOnce}`,
    );
    log.info(`Tokens estimados (final NV1): ~${enc.encode(finalNv1).length} (budget=${MAX_PROMPT_TOKENS})`);
    return finalNv1;
  }

  // Para níveis 2/3: base + regulação + extras (cap de extras)
  const nomesSelecionadosPreBudget = [...new Set([...nomesBase, ...decidirModulosRegulacao(entrada, nivel, intensidadeContexto), ...extrasCapados])];

  // PRIORIDADE dinâmica: se for V2, favorece camadas core→emotional→advanced antes do fallback limites.prioridade
  let prioridade: string[] | undefined = (matriz as any)?.limites?.prioridade;
  if (isV2Matrix(matriz)) {
    const pv2 = [
      ...(matriz.baseModules?.core ?? []),
      'ECO_ORQUESTRA_NIVEL1.txt','ECO_ORQUESTRA_NIVEL2.txt','ECO_ORQUESTRA_NIVEL3.txt',
      ...(matriz.baseModules?.emotional ?? []),
      ...(matriz.baseModules?.advanced ?? []),
    ];
    prioridade = [...new Set([ ...pv2, ...(prioridade ?? []) ])];
  }

  log.info('[ACT] selecionados(pre-budget):', nomesSelecionadosPreBudget);

  const corpoModulos = await montarComBudget(
    nomesSelecionadosPreBudget,
    pastasPossiveis,
    budgetRestante,
    prioridade,
    enc,
  );

  // Instruções finais
  const instrucoesFinais = `\n⚠️ INSTRUÇÃO AO MODELO:
- Use memórias/contexto como suporte, não como script.
- Ajuste a profundidade e o tom conforme o nível de abertura (superficial, reflexiva, profunda).
- Respeite o ritmo e a autonomia do usuário.
- Evite soluções prontas e interpretações rígidas.
- Use a “Estrutura Padrão de Resposta” como planejamento interno (6 partes), mas NÃO exiba títulos/numeração.
- Se notar padrões, convide à consciência com hipóteses leves — não diagnostique.
- ${antiSaudacaoGuard}`;

  // eco_json_trigger_criteria e MEMORIAS_NO_CONTEXTO (cache)
  let criterios = '';
  try {
    criterios = await readStaticOnce(path.join(modulosDir, 'eco_json_trigger_criteria.txt'));
  } catch (e) {
    log.warn('Falha ao carregar eco_json_trigger_criteria.txt:', (e as Error).message);
  }

  let memoriaInstrucoes = '';
  try {
    memoriaInstrucoes = await readStaticOnce(path.join(modulosDir, 'MEMORIAS_NO_CONTEXTO.txt'));
  } catch (e) {
    log.warn('Falha ao carregar MEMORIAS_NO_CONTEXTO.txt:', (e as Error).message);
  }

  const forbiddenOnce = `\n${forbidden.trim()}\n${antiSaudacaoGuard}`;

  const promptFinal = minifyTextSafe(
    [
      contextoMin,
      corpoModulos.trim(),
      criterios ? `\n${criterios}` : '',
      memoriaInstrucoes ? `\n${memoriaInstrucoes}` : '',
      instrucoesFinais,
      forbiddenOnce,
    ]
      .filter(Boolean)
      .join('\n\n'),
  );

  // Log de tokens final
  try {
    const totalTokens = enc.encode(promptFinal).length;
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
    log.warn('❌ Erro ao montar o prompt:', err as any);
    res.status(500).json({ error: 'Erro ao montar o prompt' });
  }
};
