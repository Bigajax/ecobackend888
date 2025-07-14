import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express';

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
function normalizarTexto(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function capitalizarNome(nome?: string): string {
  if (!nome) return '';
  return nome.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}
function nivelAberturaParaNumero(valor: string | number | undefined): number {
  if (typeof valor === 'string') {
    const clean = valor.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    if (clean === 'baixo') return 1;
    if (clean === 'medio') return 2;
    if (clean === 'alto') return 3;
    return 1;
  }
  if (typeof valor === 'number') {
    return valor;
  }
  return 1;
}

// ----------------------------------
// MAIN FUNCTION
// ----------------------------------
export async function montarContextoEco({
  perfil,
  ultimaMsg,
  userId,
  userName,
  mems,
  forcarMetodoViva = false,
  blocoTecnicoForcado = null
}: {
  perfil?: PerfilEmocional | null;
  ultimaMsg?: string;
  userId?: string;
  userName?: string;
  mems?: Memoria[];
  forcarMetodoViva?: boolean;
  blocoTecnicoForcado?: any;
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
  if (typeof nivel === 'string') {
    if (nivel === 'baixo') nivel = 1;
    else if (nivel === 'médio') nivel = 2;
    else if (nivel === 'alto') nivel = 3;
    else nivel = 1;
  }
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
  let memsUsadas = mems;

  if (forcarMetodoViva && blocoTecnicoForcado) {
    console.log('✅ Ativando modo forçado METODO_VIVA com bloco técnico fornecido.');
    memsUsadas = [{
      resumo_eco: blocoTecnicoForcado.analise_resumo ?? ultimaMsg ?? "",
      intensidade: Number(blocoTecnicoForcado.intensidade ?? 0),
      emocao_principal: blocoTecnicoForcado.emocao_principal ?? "",
      tags: blocoTecnicoForcado.tags ?? [],
    }];
  } else {
    if (nivel === 1) {
      console.log('⚠️ Ignorando embeddings/memórias por abertura superficial.');
      memsUsadas = [];
    }
  }

  // ----------------------------------
  // CONVERSÃO de nivel_abertura para número
  // ----------------------------------
  if (memsUsadas && memsUsadas.length > 0) {
    memsUsadas = memsUsadas.map(mem => ({
      ...mem,
      nivel_abertura: nivelAberturaParaNumero(mem.nivel_abertura)
    }));
  }

  // ----------------------------------
  // HEURÍSTICAS DIRETAS E FUZZY
  // ----------------------------------
  let heuristicaAtiva = heuristicasTriggerMap.find((h: Heuristica) =>
    h.gatilhos.some((g) => entradaSemAcentos.includes(normalizarTexto(g)))
  );

  if (entrada && !heuristicaAtiva) {
    const heuristicasFuzzy = await buscarHeuristicaPorSimilaridade(entrada);
    if (heuristicasFuzzy?.length > 0) {
      heuristicaAtiva = heuristicasFuzzy[0];
      if (heuristicaAtiva?.arquivo) {
        console.log(`✨ Heurística fuzzy ativada: ${heuristicaAtiva.arquivo} (similaridade mais alta)`);
      }
    } else {
      console.log('ℹ️ Nenhuma heurística fuzzy ativada.');
    }
  }

  if (entrada) {
    const queryEmbedding = await embedTextoCompleto(entrada, "🔍 heuristica");
    if (process.env.NODE_ENV && process.env.NODE_ENV.trim() !== 'production') {
      console.log("📌 Vetor de embedding (sumário):", queryEmbedding.slice(0, 3), "...");
    }
  }

  const heuristicasEmbedding = entrada
    ? await buscarHeuristicasSemelhantes(entrada, userId ?? null)
    : [];

  if (process.env.NODE_ENV && process.env.NODE_ENV.trim() !== 'production') {
    if (heuristicasEmbedding?.length) {
      console.log(`✅ ${heuristicasEmbedding.length} heurística(s) cognitivas embedding encontradas.`);
    } else {
      console.log('ℹ️ Nenhuma heurística embedding encontrada.');
    }
  }

  const modulosFilosoficosAtivos = filosoficosTriggerMap.filter((f) =>
    f?.arquivo && f?.arquivo.trim() && f.gatilhos.some((g) =>
      entradaSemAcentos.includes(normalizarTexto(g))
    )
  );

  const modulosEstoicosAtivos = estoicosTriggerMap.filter((e) =>
    e?.arquivo && e?.arquivo.trim() && e.gatilhos.every((g) =>
      entradaSemAcentos.includes(normalizarTexto(g))
    )
  );

  const tagsAlvo = heuristicaAtiva ? tagsPorHeuristica[heuristicaAtiva.arquivo] ?? [] : [];
  if (nivel > 1 && (!memsUsadas?.length) && entrada && userId) {
    try {
      let MIN_SIMILARIDADE = 0.55;
      const consultaParaLembranca = /lembr|record|memória|memorias|memoria|recorda/i.test(entrada);
      if (consultaParaLembranca) {
        console.log("🔎 Detecção de pergunta sobre lembrança: reduzindo threshold.");
        MIN_SIMILARIDADE = 0.3;
      }

      const [memorias, referencias] = await Promise.all([
        buscarMemoriasSemelhantes(userId, entrada),
        buscarReferenciasSemelhantes(userId, entrada)
      ]);

      const memoriasFiltradas = (memorias || []).filter(
        (m: Memoria) => (m.similaridade ?? 0) >= MIN_SIMILARIDADE
      );
      const referenciasFiltradas = (referencias || []).filter(
        (r: Memoria) => (r.similaridade ?? 0) >= MIN_SIMILARIDADE
      );

      memsUsadas = [...memoriasFiltradas, ...referenciasFiltradas];

      const memoriaIntensa = memsUsadas.find(m => (m.intensidade ?? 0) >= 7 && (m.similaridade ?? 0) >= MIN_SIMILARIDADE);
      if (memoriaIntensa) {
        console.log("✅ Ajuste minimalista: usando memória intensa recuperada sem clonar entrada.");
        memsUsadas = [memoriaIntensa, ...memsUsadas.filter(m => m !== memoriaIntensa)];
      }

      if (process.env.NODE_ENV && process.env.NODE_ENV.trim() !== 'production') {
        if (memsUsadas?.length) {
          console.log(`🧠 Memórias finais usadas no contexto:`);
          memsUsadas.forEach((m, idx) => {
            console.log(`• [${idx + 1}] "${m.resumo_eco.slice(0, 30)}..." | Intensidade: ${m.intensidade} | Similaridade: ${m.similaridade}`);
          });
        } else {
          console.log('ℹ️ Nenhuma memória usada no contexto.');
        }
      }

      if (tagsAlvo.length) {
        memsUsadas = memsUsadas.filter((m) =>
          m.tags?.some((t) => tagsAlvo.includes(t))
        );
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
  // ----------------------------------
  // INSERÇÃO DE MÓDULOS
  // ----------------------------------
  const modulosAdic: string[] = [];
  const modulosInseridos = new Set<string>();

  const inserirModuloUnico = async (arquivo: string | undefined, tipo: string) => {
  console.log(`[DEBUG inserirModuloUnico] tipo=${tipo} | arquivo=${arquivo}`);

  if (!arquivo || !arquivo.trim()) {
    console.warn(`⚠️ Ignorando chamada para inserirModuloUnico com arquivo inválido: "${arquivo}" (tipo: ${tipo})`);
    return;
  }

  if (modulosInseridos.has(arquivo)) {
    console.log(`ℹ️ Módulo já inserido anteriormente: ${arquivo}`);
    return;
  }

  const pastasPossiveis = [
    modEmocDir,
    modEstoicosDir,
    modFilosDir,
    modCogDir,
    modulosDir
  ];

  let encontrado = false;

  for (const base of pastasPossiveis) {
    try {
      const caminho = path.join(base, arquivo);
      const conteudo = await fs.readFile(caminho, 'utf-8');
      modulosAdic.push(`\n\n[Módulo ${tipo} → ${arquivo}]\n${conteudo.trim()}`);
      modulosInseridos.add(arquivo);
      console.log(`✅ Módulo carregado de: ${caminho}`);
      encontrado = true;
      break;
    } catch {
      // Tenta na próxima pasta
    }
  }

  if (!encontrado) {
    console.warn(`⚠️ Falha ao carregar módulo ${arquivo}: não encontrado em nenhuma pasta`);
  }
};


  // ----------------------------------
  // Always Include
  // ----------------------------------
  for (const arquivo of matrizPromptBase.alwaysInclude ?? []) {
    await inserirModuloUnico(arquivo, 'Base');
  }

  // ----------------------------------
  // Prompts por Nível
  // ----------------------------------
  const nivelPrompts = (matrizPromptBase.byNivel[nivel as 2 | 3] ?? [])
  .filter((arquivo: string) => {
    if (!arquivo || !arquivo.trim()) {
      console.warn(`⚠️ Ignorando arquivo vazio ou inválido na matrizPromptBase.byNivel: "${arquivo}"`);
      return false;
    }

    const intensidadeMin = matrizPromptBase.intensidadeMinima?.[arquivo];
    if (typeof intensidadeMin === 'number') {
      const temIntensa = memsUsadas?.some(mem => (mem.intensidade ?? 0) >= intensidadeMin);
      if (!temIntensa) {
        console.log(`⚠️ Ignorando ${arquivo} por intensidade < ${intensidadeMin}`);
        return false;
      }
    }

    const condicao = matrizPromptBase.condicoesEspeciais?.[arquivo];
    if (condicao) {
      if (arquivo === 'METODO_VIVA.txt') {
        if (!blocoTecnicoForcado) {
          console.log(`⚠️ Ignorando ${arquivo} pois não há bloco técnico para a mensagem atual.`);
          return false;
        }

        const intensidade = Number(blocoTecnicoForcado.intensidade ?? 0);
        const nivelAbertura = nivelAberturaParaNumero(blocoTecnicoForcado.nivel_abertura);

        const ativa = intensidade >= 7 && (nivelAbertura === 2 || nivelAbertura === 3);

        if (!ativa) {
          console.log(`⚠️ Ignorando ${arquivo} por condição especial (mensagem do usuário com intensidade < 7 ou nível_abertura não 2 ou 3)`);
          return false;
        }
      }
    }

    return true;
  });


  for (const arquivo of nivelPrompts) {
    await inserirModuloUnico(arquivo, 'Base');
  }

  // ----------------------------------
  // Heurísticas Cognitivas
  // ----------------------------------
  if (heuristicaAtiva?.arquivo) {
    await inserirModuloUnico(heuristicaAtiva.arquivo, 'Cognitivo');
  }
  for (const h of heuristicasEmbedding ?? []) {
    if (h?.arquivo) await inserirModuloUnico(h.arquivo, 'Cognitivo');
  }

  // ----------------------------------
  // Filosóficos e Estoicos
  // ----------------------------------
  for (const mf of modulosFilosoficosAtivos ?? []) {
    if (mf?.arquivo) await inserirModuloUnico(mf.arquivo, 'Filosófico');
  }

  for (const es of modulosEstoicosAtivos ?? []) {
    if (es?.arquivo) await inserirModuloUnico(es.arquivo, 'Estoico');
  }

  // ----------------------------------
  // Emocionais
  // ----------------------------------
  const modulosEmocionaisAtivos = emocionaisTriggerMap.filter((m: ModuloEmocionalTrigger) => {
    if (!m?.arquivo) return false;

    let intensidadeOk = true;
    const minInt = m.intensidadeMinima;
    if (typeof minInt === 'number') {
      intensidadeOk = memsUsadas?.some((mem) => (mem.intensidade ?? 0) >= minInt) ?? false;
    }

    const tagsPresentes = memsUsadas?.flatMap(mem => mem.tags ?? []) ?? [];
    const emocoesPrincipais = memsUsadas?.map(mem => mem.emocao_principal).filter(Boolean) ?? [];

    return intensidadeOk && (
      m.tags?.some(tag => tagsPresentes.includes(tag)) ||
      m.tags?.some(tag => emocoesPrincipais.includes(tag))
    );
  });

  for (const me of modulosEmocionaisAtivos ?? []) {
  if (me?.arquivo) {
    await inserirModuloUnico(me.arquivo, 'Emocional');
  }

  if (me?.relacionado?.length) {
    for (const rel of me.relacionado) {
      let carregado = false;

      try {
        await inserirModuloUnico(rel, 'Relacionado');
        carregado = true;
      } catch (e) {
        console.warn(`⚠️ Não encontrado em modulos_emocionais: ${rel}`);
      }

      if (!carregado) {
        try {
          await inserirModuloUnico(rel, 'Relacionado');
          carregado = true;
        } catch (e) {
          console.warn(`⚠️ Não encontrado em modulos_filosoficos/estoicos: ${rel}`);
        }
      }

      if (!carregado) {
        try {
          await inserirModuloUnico(rel, 'Relacionado');
          console.log(`✅ Fallback bem-sucedido em modulos_filosoficos para: ${rel}`);
        } catch (e) {
          console.warn(`⚠️ Falha ao carregar módulo relacionado em qualquer pasta: ${rel}`);
        }
      }
    }
  }
}

  // ----------------------------------
  // INSERÇÃO DE MEMÓRIAS E REFERÊNCIAS NO CONTEXTO
  // ----------------------------------
  if (memsUsadas && memsUsadas.length > 0 && nivel > 1) {
    const frasesContexto: string[] = [];
    for (const m of memsUsadas) {
      if (!m || !m.resumo_eco) continue;
      const textoBase = m.resumo_eco.trim();
      if (!textoBase) continue;

      const avisoSim = (m.similaridade && m.similaridade < 0.5)
        ? ` (memória de similaridade baixa ~${m.similaridade.toFixed(2)})`
        : '';

      frasesContexto.push(`• Anotação anterior${avisoSim}: "${textoBase}"`);
    }

    if (frasesContexto.length > 0) {
      contexto += `\n\n💭 Retomando suas experiências anteriores que podem ajudar nesta conversa:\n${frasesContexto.join('\n')}`;
    }
  }

  if (encadeamentos && encadeamentos.length > 0) {
    const encadeamentoTextos = encadeamentos
      .filter(e => e?.resumo_eco?.trim())
      .map(e => `• Encadeamento narrativo anterior: "${e.resumo_eco.trim()}"`)
      .join('\n')
      .trim();

    if (encadeamentoTextos) {
      contexto += `\n\n📝 Resgatando encadeamentos narrativos relacionados para manter coerência e continuidade:\n${encadeamentoTextos}`;
    }
  }

  // ----------------------------------
  // CRITÉRIOS E INSTRUÇÃO FINAL
  // ----------------------------------
  const criterios = await fs.readFile(path.join(modulosDir, 'eco_json_trigger_criteria.txt'), 'utf-8');
  modulosAdic.push(`\n\n[Módulo: eco_json_trigger_criteria]\n${criterios.trim()}`);
  modulosAdic.push(`\n\n[Módulo: eco_forbidden_patterns]\n${forbidden.trim()}`);

  try {
    const memoriaInstrucoes = await fs.readFile(path.join(modulosDir, 'MEMORIAS_NO_CONTEXTO.txt'), 'utf-8');
    modulosAdic.push(`\n\n[Módulo: MEMORIAS_NO_CONTEXTO]\n${memoriaInstrucoes.trim()}`);
  } catch (e) {
    console.warn('⚠️ Falha ao carregar MEMORIAS_NO_CONTEXTO.txt:', (e as Error).message);
  }

  modulosAdic.push(
    `\n\n⚠️ INSTRUÇÃO FINAL AO MODELO:\nPor favor, gere a resposta seguindo rigorosamente a estrutura definida no ECO_ESTRUTURA_DE_RESPOSTA.txt. Use as seções numeradas e marcadas com colchetes.`
  );

  // ----------------------------------
  // MONTAGEM FINAL
  // ----------------------------------
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
