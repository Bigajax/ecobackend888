// server/services/promptContext/ContextBuilder.ts

import crypto from "crypto";
import { isDebug, log } from "./logger";
import { Budgeter } from "./Budgeter";
import { ModuleStore } from "./ModuleStore";
import { Selector, derivarNivel, detectarSaudacaoBreve } from "./Selector";
import type { MemoriaCompacta } from "./types";

type BuildParams = {
  userId?: string | null;
  userName?: string | null;
  texto: string;
  mems?: MemoriaCompacta[];
  heuristicas?: any[];
  userEmbedding?: number[];
  forcarMetodoViva?: boolean;
  blocoTecnicoForcado?: any;
  skipSaudacao?: boolean;
  derivados?: any;
  aberturaHibrida?: any;
  perfil?: any;
};

export async function montarContextoEco(params: BuildParams): Promise<string> {
  const {
    userId,
    userName,
    texto,
    mems = [],
    heuristicas = [],
    userEmbedding = [],
    forcarMetodoViva = false,
    blocoTecnicoForcado = null,
    skipSaudacao = false,
    derivados = null,
    aberturaHibrida = null,
    perfil = null,
  } = params;

  /* ---------- Sinais básicos ---------- */
  const saudacaoBreve = detectarSaudacaoBreve(texto);
  const nivel = derivarNivel(texto, saudacaoBreve);

  /* ---------- Memo/overhead ---------- */
  const memIntensity = Math.max(0, ...mems.map((m) => Number(m?.intensidade ?? 0)));
  const memCount = mems.length;

  /* ---------- Roteamento base de módulos ---------- */
  const baseSelection = Selector.selecionarModulosBase({
    nivel,
    intensidade: memIntensity,
    flags: Selector.derivarFlags(texto),
  });

  /* ---------- Overhead instrucional ---------- */
  const responsePlan =
    "Fluxo: acolher (1 linha) • espelhar o núcleo (1 linha) • (opcional) pedir permissão para uma impressão curta • 0–1 pergunta viva • fechar leve. Máx. 1 pergunta viva; linguagem simples; parágrafos curtos (1–3 linhas).";

  const instrucoesFinais =
    "Ética: sem diagnósticos ou promessas de cura. Priorize autonomia, cuidado e ritmo. Se tema clínico/urgente, acolha e oriente a buscar apoio adequado, sem rótulos.";

  // Em NV1, o plano e a antisaudação já estão dentro dos módulos (NV1_CORE + ANTISALDO_MIN).
  const overhead: Array<[string, string]> =
    nivel === 1
      ? [["ECO_INSTRUCOES_FINAIS", instrucoesFinais]]
      : [
          ["ECO_RESPONSE_PLAN", responsePlan],
          ["ECO_INSTRUCOES_FINAIS", instrucoesFinais],
        ];

  /* ---------- Módulos candidatos ---------- */
  const modulesRaw = baseSelection.raw ?? [];
  const modulesAfterGating = baseSelection.posGating ?? modulesRaw;

  // Política NV1: usar os módulos mínimos dedicados (sem IDENTIDADE.txt grande)
  const MIN_NV1: string[] = [
    "NV1_CORE.txt",        // regras concisas (princípios, forma, escala)
    "IDENTIDADE_MINI.txt", // essência curta da Eco
    "ANTISALDO_MIN.txt",   // guarda-corpo de saudação
  ];

  /* ---------- Loader com contagem de tokens ---------- */
  const store = await ModuleStore.buildFileIndexOnce();
  const loader = async (name: string) => {
    const text = await store.read(name);
    const tokens = await store.tokenCountOf(text);
    return { name, text, tokens };
  };

  /* ---------- Orçamento ---------- */
  const budgetTokens = Number(process.env.ECO_CONTEXT_BUDGET_TOKENS ?? 2500);
  const budgeter = new Budgeter({ budgetTokens });

  const ordered = nivel === 1 ? MIN_NV1 : [...new Set(modulesAfterGating)];

  const loaded: { name: string; text: string; tokens: number }[] = [];
  for (const n of ordered) {
    const it = await loader(n);
    const ok = budgeter.tryInclude(it.name, it.tokens);
    if (ok) loaded.push(it);
    else budgeter.registerCut(it.name, it.tokens);
  }

  /* ---------- Reduções/recortes ---------- */
  const reduced = loaded.map((m) => {
    // Em NV1, os módulos já são “mini”; não recortar.
    if (nivel === 1) return m;

    // NV2/3 — compactar apenas IDENTIDADE se estiver grande
    if (m.name === "IDENTIDADE.txt") {
      const resumida = extrairIdentidadeResumida(m.text);
      return { ...m, text: resumida || resumirIdentidadeFallback(m.text) };
    }
    return m;
  });

  /* ---------- Dedupe e ordenação final ---------- */
  const stitched = nivel === 1 ? stitchNV1(reduced) : stitchNV(reduced);

  const instrucional = overhead
    .map(([title, body]) => `### ${title}\n${body}`.trim())
    .join("\n\n");

  /* ---------- Cabeçalho + extras ---------- */
  const header = [
    `Nível de abertura: ${nivel}`,
    memCount > 0 ? `Memórias (internas): ${memCount} itens` : `Memórias: none`,
    forcarMetodoViva ? "Forçar VIVA: sim" : "Forçar VIVA: não",
  ].join(" | ");

  const extras: string[] = [];
  if (aberturaHibrida?.sugestaoNivel != null) {
    extras.push(`Ajuste dinâmico de abertura (sugerido): ${aberturaHibrida.sugestaoNivel}`);
  }
  if (derivados?.resumoTopicos) {
    const top = String(derivados.resumoTopicos).slice(0, 220);
    extras.push(`Observações de continuidade: ${top}${top.length >= 220 ? "…" : ""}`);
  }
  const dyn = extras.length ? `\n\n${extras.map((e) => `• ${e}`).join("\n")}` : "";

  /* ---------- Prompt final ---------- */
  const prompt =
    [
      `// CONTEXTO ECO — NV${nivel}`,
      `// ${header}${dyn}`,
      "",
      stitched,
      "",
      instrucional,
      "",
      `Mensagem atual: ${texto}`,
    ]
      .join("\n")
      .trim();

  /* ---------- Métricas & Debug ---------- */
  if (isDebug()) {
    const tokensContexto = await store.tokenCountOf(texto);
    const overheadTokens = await store.tokenCountOf(instrucional);
    const total = await store.tokenCountOf(prompt);
    log.debug("[ContextBuilder] tokens & orçamento", {
      tokensContexto,
      overheadTokens,
      MAX_PROMPT_TOKENS: 8000,
      MARGIN_TOKENS: 256,
      budgetRestante: Math.max(0, 8000 - 256 - total),
    });
    log.debug("[Budgeter] resultado", {
      used: budgeter.used,
      cut: budgeter.cut,
      tokens: budgeter.totalUsed,
    });
    log.info("[ContextBuilder] NV" + nivel + " pronto", { totalTokens: total });
  }

  return prompt;
}

/* =======================================================================
   Utilidades de compactação / dedupe
======================================================================= */

function hash(text: string) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 10);
}

function dedupeBySection(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  const seenTitles = new Set<string>();
  const seenHashes = new Set<string>();
  let currentBlock: string[] = [];

  const flush = () => {
    if (currentBlock.length === 0) return;
    const blockText = currentBlock.join("\n").trim();
    const key = hash(blockText);
    if (!seenHashes.has(key)) {
      seenHashes.add(key);
      out.push(blockText);
    }
    currentBlock = [];
  };

  for (const ln of lines) {
    const isTitle = /^#{1,6}\s+/.test(ln) || /^[A-ZÁÂÃÉÊÍÓÔÕÚÜÇ0-9][^\n]{0,80}$/.test(ln);
    if (isTitle) {
      flush();
      const normalizedTitle = ln.trim().toUpperCase().replace(/\s+/g, " ");
      if (seenTitles.has(normalizedTitle)) {
        // descarta bloco repetido
        currentBlock = [];
        continue;
      }
      seenTitles.add(normalizedTitle);
    }
    currentBlock.push(ln);
  }
  flush();
  return out.join("\n");
}

function extrairIdentidadeResumida(text: string): string | "" {
  const m = text.match(/(IDENTIDADE\s+RESUMIDA[\s\S]*?)(?:\n#{1,6}\s+|$)/i);
  if (m) return limparEspacos(m[1]);
  const n = text.match(/IDENTIDADE[\s\S]*?\n+([\s\S]{80,400}?)(?:\n{2,}|#{1,6}\s+)/i);
  if (n) return "IDENTIDADE — RESUMO\n" + limparEspacos(n[1]);
  return "";
}

function resumirIdentidadeFallback(_text: string): string {
  return [
    "IDENTIDADE — ECO (resumo)",
    "Você é a Eco: presença empática, reflexiva e clara.",
    "Fale simples, em 1–3 linhas por parágrafo. Máx. 1 pergunta viva.",
    "Convide escolhas; evite jargões e diagnósticos.",
  ].join("\n");
}

function limparEspacos(s: string) {
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ---------- Stitch ---------- */

function stitchNV1(mods: Array<{ name: string; text: string }>): string {
  const prio = ["NV1_CORE.txt", "IDENTIDADE_MINI.txt", "ANTISALDO_MIN.txt"];
  const sorted = [
    ...mods.filter((m) => prio.includes(m.name)).sort((a, b) => prio.indexOf(a.name) - prio.indexOf(b.name)),
    ...mods.filter((m) => !prio.includes(m.name)),
  ];
  const joined = sorted
    .map((m) => {
      const title = titleFromName(m.name);
      return `\n${title}\n\n${m.text}`.trim();
    })
    .join("\n\n");
  return dedupeBySection(joined);
}

function stitchNV(mods: Array<{ name: string; text: string }>): string {
  // ✅ Nova prioridade NV2/NV3
  const prio = ["IDENTIDADE.txt", "MODULACAO_TOM_REGISTRO.txt", "ENCERRAMENTO_SENSIVEL.txt"];
  const sorted = [
    ...mods.filter((m) => prio.includes(m.name)).sort((a, b) => prio.indexOf(a.name) - prio.indexOf(b.name)),
    ...mods.filter((m) => !prio.includes(m.name)),
  ];
  const joined = sorted
    .map((m) => {
      const title = titleFromName(m.name);
      return `\n${title}\n\n${m.text}`.trim();
    })
    .join("\n\n");
  return dedupeBySection(joined);
}

function titleFromName(name: string) {
  if (/NV1_CORE/i.test(name)) return "NV1 — CORE";
  if (/IDENTIDADE_MINI/i.test(name)) return "IDENTIDADE — ECO (mini)";
  if (/ANTISALDO_MIN/i.test(name)) return "ANTISSALDO — Diretriz mínima";
  if (/IDENTIDADE\.txt$/i.test(name)) return "IDENTIDADE — ECO (resumo)";
  if (/MODULACAO_TOM_REGISTRO/i.test(name)) return "MODULAÇÃO DE TOM & REGISTRO";
  if (/ENCERRAMENTO_SENSIVEL/i.test(name)) return "ENCERRAMENTO SENSÍVEL";
  if (/ESCALA_ABERTURA/i.test(name)) return "ESCALA DE ABERTURA (1–3)";
  if (/ESCALA_INTENSIDADE/i.test(name)) return "ESCALA DE INTENSIDADE (0–10)";
  if (/METODO_VIVA_ENXUTO/i.test(name)) return "MÉTODO VIVA — ENXUTO";
  if (/BLOCO_TECNICO_MEMORIA/i.test(name)) return "BLOCO TÉCNICO — MEMÓRIA";
  return name.replace(/\.txt$/i, "").replace(/_/g, " ");
}

/* =======================================================================
   Facade
======================================================================= */

export const ContextBuilder = {
  async build(params: BuildParams) {
    return montarContextoEco(params);
  },
};

export default montarContextoEco;
