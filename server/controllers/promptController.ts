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
import { encoding_for_model } from "@dqbd/tiktoken";

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const isDebug = () => LOG_LEVEL === 'debug';
const log = {
  info: (...a: any[]) => console.log('[ECO]', ...a),
  warn: (...a: any[]) => console.warn('[ECO][WARN]', ...a),
  debug: (...a: any[]) => { if (isDebug()) console.debug('[ECO][DEBUG]', ...a); }
};

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

function construirNarrativaMemorias(mems: Memoria[]): string {
  if (!mems || mems.length === 0) return '';
  const temas = new Set<string>();
  const emocoes = new Set<string>();
  const frases: string[] = [];
  for (const m of mems) {
    if (m.tags) m.tags.forEach(t => temas.add(t));
    if (m.emocao_principal) emocoes.add(m.emocao_principal);
    if (m.resumo_eco) frases.push(`"${m.resumo_eco.trim()}"`);
  }
  const temasTxt = [...temas].join(', ') || 'nenhum tema específico';
  const emocoesTxt = [...emocoes].join(', ') || 'nenhuma emoção destacada';
  const frasesTxt = frases.join(' ');
  return `\n📜 Narrativa Integrada das Memórias:
Em outros momentos, você trouxe temas como ${temasTxt}, com emoções de ${emocoesTxt}.
Você compartilhou pensamentos como ${frasesTxt}.
Considere como isso pode ressoar com o que sente agora.`.trim();
}

// ----------------------------------
// FUNÇÃO PRINCIPAL (sem embeddings redundantes)
// ----------------------------------
export async function montarContextoEco({
  perfil,
  ultimaMsg,
  userId,
  userName,
  mems,
  forcarMetodoViva = false,
  blocoTecnicoForcado = null,
  // novos parâmetros para evitar recomputes
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
  heuristicas?: any[];     // heurísticas já calculadas fora (opcional)
  texto?: string;          // alias explícito para a última mensagem
  userEmbedding?: number[]; // embedding já calculada fora (opcional)
  skipSaudacao?: boolean;  // já foi tratado fast-path?
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
  // SAUDAÇÃO ESPECIAL (pode ser pulada se já usamos fast-path)
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

[Módulo REGRA_SAUDACAO]
${saudacaoConteudo.trim()}

[Módulo eco_forbidden_patterns]
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
  // HEURÍSTICAS (preferir as recebidas por parâmetro)
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

  // Fallback de heurísticas por embedding (reaproveitando userEmbedding)
  let heuristicasEmbedding: any[] = [];
  if (Array.isArray(heuristicas) && heuristicas.length > 0) {
    heuristicasEmbedding = heuristicas;
  } else if (entrada) {
    if (entrada.length < 6 && !userEmbedding) {
      log.info('⚠️ Texto curto e nenhum embedding fornecido — pulando busca de heurísticas.');
      heuristicasEmbedding = [];
    } else {
      // ✅ usa a nova assinatura com reuse do embedding (se seu serviço já suporta)
      try {
        heuristicasEmbedding = await buscarHeuristicasSemelhantes({
          usuarioId: userId ?? null,
          userEmbedding,
          texto: userEmbedding ? undefined : entrada,
          matchCount: 5,
          threshold: 0.75,
        } as any);
      } catch {
        // fallback pra assinatura antiga (compat)
        heuristicasEmbedding = await buscarHeuristicasSemelhantes(entrada, userId ?? null);
      }
    }
  }

  if (isDebug()) {
    if (heuristicasEmbedding?.length) log.info(`${heuristicasEmbedding.length} heurística(s) cognitivas por embedding.`);
    else log.info('Nenhuma heurística embedding encontrada.');
  }

  // ----------------------------------
  // FILOSÓFICOS / ESTOICOS por gatilho literal
  // ----------------------------------
  const modulosFilosoficosAtivos = filosoficosTriggerMap.filter((f) =>
    f?.arquivo && f?.arquivo.trim() && f.gatilhos.some((g) => entradaSemAcentos.includes(normalizarTexto(g)))
  );
  const modulosEstoicosAtivos = estoicosTriggerMap.filter((e) =>
    e?.arquivo && e?.arquivo.trim() && e.gatilhos.every((g) => entradaSemAcentos.includes(normalizarTexto(g)))
  );

  // ----------------------------------
  // BUSCA DE MEMÓRIAS/REFERÊNCIAS (apenas nivel > 1 e entrada razoável)
  // ----------------------------------
  const tagsAlvo = heuristicaAtiva ? (tagsPorHeuristica[heuristicaAtiva.arquivo] ?? []) : [];
  if (nivel > 1 && (!memsUsadas?.length) && entrada && userId) {
    try {
      let MIN_SIMILARIDADE = 0.55;
      if (/lembr|record|memória|memorias|memoria|recorda/i.test(entrada)) {
        log.info('Detecção de pergunta sobre lembrança: reduzindo threshold.');
        MIN_SIMILARIDADE = 0.3;
      }

      // ✅ Reaproveita o embedding do usuário quando vier por parâmetro
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

  if (entrada && perfil && nivel > 1) {
    const memoriaAtual: Memoria = {
      resumo_eco: entrada,
      tags: perfil.temas_recorrentes ? Object.keys(perfil.temas_recorrentes) : [],
      intensidade: 0,
      emocao_principal: Object.keys(perfil.emocoes_frequentes || {})[0] || ''
    };
    memsUsadas = [memoriaAtual, ...(memsUsadas || [])];
  }

  // ----------------------------------
  // ENCADEAMENTOS (reaproveitando embedding e evitando chamadas desnecessárias)
  // ----------------------------------
  let encadeamentos: Memoria[] = [];
  if (entrada && userId && nivel > 1) {
    try {
      if (entrada.length < 6 && !userEmbedding) {
        log.info('⚠️ Entrada muito curta e sem embedding — pulando encadeamento.');
      } else {
        // versão que aceita options { userEmbedding }
        const encs = await buscarEncadeamentosPassados(userId, { userEmbedding, texto: entrada, kBase: 1 } as any);
        if (encs?.length) encadeamentos = encs.slice(0, 3) as any;
      }
    } catch (e) {
      log.warn('Erro ao buscar encadeamentos:', (e as Error).message);
    }
  }

  // ----------------------------------
  // CARREGADOR DE MÓDULOS (com dedupe)
  // ----------------------------------
  const modulosAdic: string[] = [];
  const modulosInseridos = new Set<string>();
  const pastasPossiveis = [modEmocDir, modEstoicosDir, modFilosDir, modCogDir, modulosDir];

  const inserirModuloUnico = async (arquivo: string | undefined, tipo: string) => {
    log.debug('Inserindo módulo', { tipo, arquivo });
    if (!arquivo || !arquivo.trim()) return;
    if (modulosInseridos.has(arquivo)) return;
    let encontrado = false;
    for (const base of pastasPossiveis) {
      try {
        const caminho = path.join(base, arquivo);
        const conteudo = await fs.readFile(caminho, 'utf-8');
        modulosAdic.push(`\n\n[Módulo ${tipo} → ${arquivo}]\n${conteudo.trim()}`);
        modulosInseridos.add(arquivo);
        log.info(`Módulo carregado: ${caminho}`);
        encontrado = true;
        break;
      } catch { /* tenta próxima pasta */ }
    }
    if (!encontrado) log.warn(`Falha ao carregar módulo ${arquivo}: não encontrado`);
  };

  // Always Include
  const { matrizPromptBase } = await import('./matrizPromptBase');
  for (const arquivo of matrizPromptBase.alwaysInclude ?? []) {
    await inserirModuloUnico(arquivo, 'Base');
  }

  // Prompts por Nível (mantido para compat, mesmo sem uso direto)
  const nivelPrompts = (matrizPromptBase.byNivel[nivel as 2 | 3] ?? []).filter((arquivo: string) => {
    if (!arquivo || !arquivo.trim()) return false;

    const intensidadeMin = matrizPromptBase.intensidadeMinima?.[arquivo];
    if (typeof intensidadeMin === 'number') {
      const temIntensa = memsUsadas?.some(mem => (mem.intensidade ?? 0) >= intensidadeMin);
      if (!temIntensa) return false;
    }

    const condicao = matrizPromptBase.condicoesEspeciais?.[arquivo];
    if (condicao) {
      const intensidade = memsUsadas && memsUsadas.length > 0 ? memsUsadas[0].intensidade ?? 0 : 0;
      const nivelAbertura = nivel;
      const regraAvaliavel = condicao.regra.replace(/intensidade/g, intensidade.toString()).replace(/nivel/g, nivelAbertura.toString());
      try { if (!eval(regraAvaliavel)) return false; } // eslint-disable-line no-eval
      catch (e) { log.warn('Erro ao avaliar regra', { arquivo, erro: (e as Error).message }); return false; }
    }
    return true;
  });
  // (opcional) se quiser realmente incluir nivelPrompts, descomente:
  // for (const arquivo of nivelPrompts) await inserirModuloUnico(arquivo, 'Base/Nível');

  const nivelDescricao = nivel === 1 ? 'superficial' : nivel === 2 ? 'reflexivo' : 'profundo';
  log.info(`Nível de abertura: ${nivelDescricao} (${nivel})`);

  // Heurísticas Cognitivas
  if ((heuristicaAtiva?.arquivo)) await inserirModuloUnico(heuristicaAtiva.arquivo, 'Cognitivo');
  for (const h of heuristicasEmbedding ?? []) if (h?.arquivo) await inserirModuloUnico(h.arquivo, 'Cognitivo');

  // Filosóficos / Estoicos
  for (const mf of filosoficosTriggerMap ? modulosFilosoficosAtivos : []) if (mf?.arquivo) await inserirModuloUnico(mf.arquivo, 'Filosófico');
  for (const es of modulosEstoicosAtivos ?? []) if (es?.arquivo) await inserirModuloUnico(es.arquivo, 'Estoico');

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
  for (const me of modulosEmocionaisAtivos ?? []) if (me?.arquivo) await inserirModuloUnico(me.arquivo, 'Emocional');
  for (const me of modulosEmocionaisAtivos ?? []) if (me?.relacionado?.length) {
    for (const rel of me.relacionado) await inserirModuloUnico(rel, 'Relacionado');
  }

  // Inserção de memórias e encadeamentos
  if (memsUsadas && memsUsadas.length > 0 && nivel > 1) {
    contexto += `\n\n${construirNarrativaMemorias(memsUsadas)}`;
  }
  if (encadeamentos?.length) {
    const encadeamentoTextos = encadeamentos
      .filter(e => e?.resumo_eco?.trim())
      .map(e => `• Encadeamento narrativo anterior: "${e.resumo_eco.trim()}"`)
      .join('\n')
      .trim();
    if (encadeamentoTextos) {
      contexto += `\n\n📝 Resgatando encadeamentos narrativos relacionados para manter coerência e continuidade:\n${encadeamentoTextos}`;
    }
  }

  // Critérios e instruções finais (usando o MESMO modulosAdic)
  const criterios = await fs.readFile(path.join(modulosDir, 'eco_json_trigger_criteria.txt'), 'utf-8');
  modulosAdic.push(`\n\n[Módulo: eco_json_trigger_criteria]\n${criterios.trim()}`);
  modulosAdic.push(`\n\n[Módulo: eco_forbidden_patterns]\n${forbidden.trim()}`);
  try {
    const memoriaInstrucoes = await fs.readFile(path.join(modulosDir, 'MEMORIAS_NO_CONTEXTO.txt'), 'utf-8');
    modulosAdic.push(`\n\n[Módulo: MEMORIAS_NO_CONTEXTO]\n${memoriaInstrucoes.trim()}`);
  } catch (e) {
    log.warn('Falha ao carregar MEMORIAS_NO_CONTEXTO.txt:', (e as Error).message);
  }

  const instrucoesFinais = `\n⚠️ INSTRUÇÃO AO MODELO:
- Use as memórias e o estado emocional consolidado como parte do seu raciocínio.
- Conecte os temas e emoções anteriores ao que o usuário traz agora.
- Ajuste a profundidade e o tom conforme o nível de abertura (superficial, reflexiva, profunda).
- Respeite o ritmo e a autonomia do usuário.
- Evite soluções prontas e interpretações rígidas.
- Estruture sua resposta conforme ECO_ESTRUTURA_DE_RESPOSTA.txt, usando as seções numeradas.
- Se notar padrões, convide à consciência, mas não diagnostique.`.trim();
  modulosAdic.push(`\n\n${instrucoesFinais}`);

  // Montagem final + budget de tokens
  let promptFinal = `${contexto.trim()}\n${modulosAdic.join('\n')}`.trim();
  try {
    const enc = await encoding_for_model('gpt-4');
    let tokens = enc.encode(promptFinal);
    const numTokens = tokens.length;
    log.info(`Tokens estimados: ~${numTokens}`);
    const MAX_PROMPT_TOKENS = 8000;
    if (numTokens > MAX_PROMPT_TOKENS) {
      log.warn(`Prompt acima do limite (${MAX_PROMPT_TOKENS}). Aplicando corte.`);
      tokens = tokens.slice(0, MAX_PROMPT_TOKENS - 100);
      promptFinal = new TextDecoder().decode(enc.decode(tokens));
    }
    enc.free();
  } catch (error) {
    log.warn('Falha ao cortar tokens:', (error as Error).message);
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
