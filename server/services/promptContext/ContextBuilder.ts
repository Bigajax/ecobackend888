// server/services/promptContext/ContextBuilder.ts

import crypto from "crypto";
import { isDebug, log } from "./logger";
import { Budgeter } from "./Budgeter";
import { ModuleStore } from "./ModuleStore";
import { Selector, derivarNivel, detectarSaudacaoBreve } from "./Selector";

// Definição mínima para evitar falta de tipo (usamos apenas 'intensidade').
type MemoriaCompacta = { intensidade?: number };

// ----- Params -----
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

  /** 🔥 NOVO: memórias semelhantes vindas do Orchestrator */
  memoriasSemelhantes?: Array<{
    resumo_eco: string;
    similarity?: number;
    created_at?: string;
    tags?: string[] | null;
  }>;
};

/* ------------------------------------------------------------------
   Política de falta de módulos
   - STRICT_MISSING: se "1", lança erro quando módulo não é encontrado.
   - Caso contrário, só loga e retorna string vazia (Budgeter ignora).
------------------------------------------------------------------- */
const STRICT_MISSING = process.env.ECO_STRICT_MODULES === "1";

// Garante índice pronto (compat com versões sem bootstrap()).
async function ensureModuleIndexReady() {
  const anyStore = ModuleStore as unknown as { bootstrap?: () => Promise<void> };
  if (typeof anyStore.bootstrap === "function") {
    await anyStore.bootstrap!();
  } else {
    await ModuleStore.buildFileIndexOnce();
  }
}

/** Lê um módulo; se faltar, aplica a política acima. */
async function requireModule(name: string): Promise<string> {
  const found = await ModuleStore.read(name);
  if (found && found.trim()) return found;

  const msg = `[ContextBuilder] módulo ausente: ${name}`;
  if (STRICT_MISSING) throw new Error(msg);
  if (isDebug()) log.debug(msg + " — usando vazio (dev/relaxado)");
  return "";
}

/** 🔥 NOVO: bloco curto e seguro com memórias semelhantes */
function formatMemRecall(
  mems: BuildParams["memoriasSemelhantes"]
): string {
  if (!mems || !mems.length) return "";
  const linhas = mems.slice(0, 3).map((m) => {
    const pct =
      typeof m?.similarity === "number"
        ? ` ~${Math.round((m.similarity as number) * 100)}%`
        : "";
    const linha = String(m?.resumo_eco || "")
      .replace(/\s+/g, " ")
      .slice(0, 220);
    return `- ${linha}${linha.length >= 220 ? "…" : ""}${pct}`;
  });

  return [
    "CONTINUIDADE — SINAIS DO HISTÓRICO (use com leveza, sem afirmar que “lembra”):",
    ...linhas,
    "Se (e somente se) fizer sentido, pode contextualizar com: “uma coisa que você compartilhou foi…”.",
  ].join("\n");
}

export async function montarContextoEco(params: BuildParams): Promise<string> {
  const {
    userId: _userId,
    userName: _userName,
    texto,
    mems = [],
    heuristicas: _heuristicas = [],
    userEmbedding: _userEmbedding = [],
    forcarMetodoViva = false,
    blocoTecnicoForcado: _blocoTecnicoForcado = null,
    skipSaudacao: _skipSaudacao = false,
    derivados = null,
    aberturaHibrida = null,
    perfil: _perfil = null,
    memoriasSemelhantes = [], // 🔥 NOVO
  } = params;

  /* ---------- Sinais básicos ---------- */
  const saudacaoBreve = detectarSaudacaoBreve(texto);
  const nivel = derivarNivel(texto, saudacaoBreve) as 1 | 2 | 3;

  /* ---------- Memo/overhead ---------- */
  const memIntensity = Math.max(0, ...mems.map((m) => Number(m?.intensidade ?? 0)));
  const memCount = mems.length;

  /* ---------- Bootstrap de módulos ---------- */
  await ensureModuleIndexReady();

  /* ---------- Seleção vinda só do Selector (matriz V2 + regras) ---------- */
  const baseSelection = Selector.selecionarModulosBase({
    nivel,
    intensidade: memIntensity,
    flags: Selector.derivarFlags(texto),
  });

  // Conjunto base conforme Selector (sem union de "essentials" aqui!)
  const modulesRaw = Array.from(new Set(baseSelection.raw ?? []));
  const modulesAfterGating = Array.from(new Set(baseSelection.posGating ?? modulesRaw));

  /* ---------- Overhead instrucional (curto) ---------- */
  const responsePlan =
    "Fluxo: acolher (1 linha) • espelhar o núcleo (1 linha) • (opcional) uma impressão curta com permissão • máx. 1 pergunta viva • fechar leve.";

  const instrucoesFinais =
    "Ética: sem diagnósticos nem promessas de cura. Priorize autonomia, cuidado e ritmo. Se tema clínico/urgente, acolha e oriente apoio adequado.";

  // NV1 já traz antisaudação/plano dentro dos módulos mini; manter só instruções finais
  const overhead: Array<[string, string]> =
    nivel === 1
      ? [["ECO_INSTRUCOES_FINAIS", instrucoesFinais]]
      : [
          ["ECO_RESPONSE_PLAN", responsePlan],
          ["ECO_INSTRUCOES_FINAIS", instrucoesFinais],
        ];

  /* ---------- Política por nível ---------- */
  const MIN_NV1: string[] = ["NV1_CORE.txt", "IDENTIDADE_MINI.txt", "ANTISALDO_MIN.txt"];
  const ordered: string[] = nivel === 1 ? MIN_NV1 : modulesAfterGating;

  /* ---------- Loader com contagem de tokens ---------- */
  const candidates: { name: string; text: string; tokens: number }[] = [];
  for (const name of ordered) {
    const txt = await requireModule(name);
    const tokens = ModuleStore.tokenCountOf(name, txt);
    candidates.push({ name, text: txt, tokens });
  }

  /* ---------- Orçamento ---------- */
  const DEFAULT_BUDGET = 2500;
  const hardMin = 800;    // evita prompts anêmicos
  const hardMax = 6000;   // deixa espaço para histórico + completion
  const budgetTokens = Math.min(
    hardMax,
    Math.max(
      hardMin,
      Number.isFinite(Number(process.env.ECO_CONTEXT_BUDGET_TOKENS))
        ? Number(process.env.ECO_CONTEXT_BUDGET_TOKENS)
        : DEFAULT_BUDGET
    )
  );

  const tokenMap = Object.fromEntries(candidates.map((c) => [c.name, c.tokens]));
  const budgetResult = Budgeter.run({
    ordered,
    tokenOf: (name: string) => tokenMap[name] ?? 0,
    budgetTokens,
    sepTokens: 1,
    safetyMarginTokens: 0,
  });

  // Filtra os que cabem no orçamento preservando ordem
  const loaded = candidates.filter((c) => budgetResult.used.includes(c.name) && c.text.trim().length > 0);

  /* ---------- Reduções/recortes ---------- */
  const reduced = loaded.map((m) => {
    if (nivel === 1) return m; // NV1 módulos já são mini
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

  /* ---------- NOVO: bloco de memória viva ---------- */
  const memRecallBlock = formatMemRecall(memoriasSemelhantes);

  /* ---------- Prompt final ---------- */
  const prompt =
    [
      `// CONTEXTO ECO — NV${nivel}`,
      `// ${header}${dyn}`,
      "",
      stitched,
      "",
      memRecallBlock || "",           // 🔥 injetado aqui (fica vazio se não houver)
      "",
      instrucional,
      "",
      `Mensagem atual: ${texto}`,
    ]
      .filter(Boolean)
      .join("\n")
      .trim();

  /* ---------- Métricas & Debug ---------- */
  if (isDebug()) {
    const tokensContexto = ModuleStore.tokenCountOf("__INLINE__:ctx", texto);
    const overheadTokens = ModuleStore.tokenCountOf("__INLINE__:ovh", instrucional);
    const total = ModuleStore.tokenCountOf("__INLINE__:ALL", prompt);
    log.debug("[ContextBuilder] tokens & orçamento", {
      tokensContexto,
      overheadTokens,
      MAX_PROMPT_TOKENS: 8000,
      MARGIN_TOKENS: 256,
      budgetRestante: Math.max(0, 8000 - 256 - total),
    });
    log.debug("[Budgeter] resultado", {
      used: budgetResult.used,
      cut: budgetResult.cut,
      tokens: budgetResult.tokens,
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
    const isTitle =
      /^#{1,6}\s+/.test(ln) ||
      /^[A-ZÁÂÃÉÊÍÓÔÕÚÜÇ0-9][^\n]{0,80}$/.test(ln);
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
    "Você é a Eco: coach de autoconhecimento empático, reflexivo e bem-humorado.",
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
    ...mods
      .filter((m) => prio.includes(m.name))
      .sort((a, b) => prio.indexOf(a.name) - prio.indexOf(b.name)),
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
  const prio = [
    "IDENTIDADE.txt",
    "MODULACAO_TOM_REGISTRO.txt",
    "ENCERRAMENTO_SENSIVEL.txt",
  ];
  const sorted = [
    ...mods
      .filter((m) => prio.includes(m.name))
      .sort((a, b) => prio.indexOf(a.name) - prio.indexOf(b.name)),
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
