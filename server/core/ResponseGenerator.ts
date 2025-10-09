import { callOpenRouterChat } from "../adapters/OpenRouterAdapter";
import { limparResposta, formatarTextoEco } from "../utils/text";
import { hedge } from "./policies/hedge";
import { REFLEXO_PATTERNS } from "./reflexoPatterns";

const MODEL_MAIN     = process.env.ECO_MODEL_MAIN     || "openai/gpt-5-chat";
const MODEL_TECH_ALT = process.env.ECO_MODEL_TECH_ALT || "openai/gpt-5-mini";

/* ---------------------------------------------
 * FAST GREET (inalterado, só system melhorado)
 * ------------------------------------------- */
export async function fastGreet(prompt: string) {
  const lightSystem =
    "Sou a ECO: curiosa, presente, sem julgamentos ou prescrições, acolhendo e refletindo com um tom calmo, direto e gentil, convidando à autorreflexão com honestidade cuidadosa e humor apropriado, sem orientar diretamente.";
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
    "X-Title": "Eco App - Fast Lane",
  };
  const data = await callOpenRouterChat(
    {
      model: MODEL_TECH_ALT,
      temperature: 0.6,
      max_tokens: 180,
      messages: [
        { role: "system", content: lightSystem },
        { role: "user", content: prompt },
      ],
    },
    headers,
    6000
  );
  const raw =
    data?.choices?.[0]?.message?.content ??
    "Tô aqui com você. O que tá pedindo atenção agora?";
  return formatarTextoEco(limparResposta(raw));
}

/* ---------------------------------------------------
 * CONTEXTUAL MICRO-REFLEXO
 * - Usa templates com {{espelho}} e {{topico}}
 * - Adiciona softener opcional no início
 * - Garante no máx. 1 pergunta
 * -------------------------------------------------- */

type MicroSource =
  | { type: "template"; text: string } // novo modelo (usa {{espelho}}/{{topico}})
  | { type: "plain"; text: string };   // legado (frase fixa)

const SOFTENERS = [
  "Tô contigo.",
  "Faz sentido.",
  "Te ouvi.",
  "Tô aqui.",
  "Entendo.",
];

// gera um “espelho” curto da fala do usuário
function construirEspelho(msg: string): string {
  if (!msg) return "";
  // remove emojis e excesso de espaços
  let t = msg
    .replace(
      /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDFFF])/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  // pega a 1ª sentença ou até 110 chars
  const primeiraSentenca = t.split(/(?<=[.!?…])\s+/)[0] || t;
  t = primeiraSentenca.slice(0, 110).trim();

  // se ficou muito curto, retorna vazio para não soar robótico
  if (t.length < 8) return "";
  return t;
}

// tenta inferir um “tópico” simples com base em palavras chave
function inferirTopico(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (/valid(a[rç][aã]o|ar)\b|validar\s+ideia/.test(m)) return "validação";
  if (/control(ar|o|e|a)\b|resultado/.test(m)) return "controle de resultados";
  if (/ansios|preocup|p[aá]nico|tens[aã]o/.test(m)) return "ansiedade";
  if (/cansad|exaust|sem energia/.test(m)) return "cansaço";
  if (/fric[cç][aã]o|funcionalidade|bug|quebr/.test(m)) return "fricção técnica";
  if (/confus|indecis|n[aã]o sei/.test(m)) return "clareza";
  return "";
}

// transforma as strings do REFLEXO_PATTERNS para fontes (template/legado)
function mapToMicroSources(responses?: string[]): MicroSource[] {
  if (!responses || responses.length === 0) return [];
  return responses.map((txt) => {
    // heurística simples: se contém {{espelho}} ou {{topico}}, tratamos como template
    if (/\{\{\s*(espelho|topico)\s*\}\}/i.test(txt)) {
      return { type: "template", text: txt };
    }
    // fallback “templateável”: injeta {{espelho}} no início de forma suave
    return { type: "plain", text: txt };
  });
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// garante no máximo 1 interrogação (1 pergunta)
function limitarPerguntas(phrase: string): string {
  const idxs = [...phrase.matchAll(/\?/g)].map((m) => m.index ?? -1);
  if (idxs.length <= 1) return phrase;
  // mantém a primeira e transforma as demais em ponto final
  let out = phrase;
  for (let i = 1; i < idxs.length; i++) {
    const pos = idxs[i]!;
    out = out.slice(0, pos) + "." + out.slice(pos + 1);
  }
  return out;
}

function montarComContexto(template: string, espelho: string, topico: string): string {
  return template
    .replace(/\{\{\s*espelho\s*\}\}/gi, espelho || "")
    .replace(/\{\{\s*topico\s*\}\}/gi, topico || "");
}

/**
 * microReflexoLocalContextual
 * @param msg última fala do usuário
 * @returns string pronta (curta, com 1 pergunta máx.) ou null
 */
export function microReflexoLocal(msg: string): string | null {
  const t = (msg || "").trim().toLowerCase();
  if (!t) return null;

  const hits: { key: string; priority: number; sources: MicroSource[] }[] = [];
  for (const [key, cfg] of Object.entries(REFLEXO_PATTERNS)) {
    if (cfg.patterns.some((rx) => rx.test(t))) {
      const sources = mapToMicroSources((cfg as any).microTemplates || cfg.microResponses);
      hits.push({ key, priority: cfg.priority, sources });
    }
  }
  if (hits.length === 0) return null;

  // menor número = mais urgente
  hits.sort((a, b) => a.priority - b.priority);
  const best = hits[0];
  if (!best.sources.length) return null;

  const espelho = construirEspelho(msg);
  const topico  = inferirTopico(msg);
  const soft    = pickRandom(SOFTENERS);

  let out: string;
  const choice = pickRandom(best.sources);

  if (choice.type === "template") {
    out = montarComContexto(choice.text, espelho, topico);
  } else {
    // legado: injeta um espelho curto no início se existir
    out = espelho ? `${soft} ${espelho}. ${choice.text}` : `${soft} ${choice.text}`;
  }

  // limpeza + 1 pergunta no máx.
  out = out.replace(/\s+/g, " ").trim();
  out = limitarPerguntas(out);

  // acabamento padrão do app
  return formatarTextoEco(limparResposta(out));
}

/* ---------------------------------------------
 * CHAT COMPLETION COM HEDGE
 * ------------------------------------------- */
export async function chatCompletion(messages: any[], maxTokens: number) {
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
    "X-Title": "Eco App - Chat",
  };

  const main = callOpenRouterChat(
    {
      model: MODEL_MAIN,
      messages,
      temperature: 0.7,
      top_p: 0.9,
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
      max_tokens: maxTokens,
    },
    headers,
    9000
  );
  const mini = callOpenRouterChat(
    {
      model: MODEL_TECH_ALT,
      messages,
      temperature: 0.65,
      top_p: 0.9,
      max_tokens: Math.min(420, maxTokens),
    },
    headers,
    5500
  );
  return hedge(main, mini, 2500);
}
