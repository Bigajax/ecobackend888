/**
 * lenses/index.ts — Lentes temáticas reflexivas da Eco (fonte única, TypeScript).
 *
 * Camada C da arquitetura de prompt (ver docs/prompt-architecture.md): poucas lentes FORTES,
 * com gate determinístico (predicados TS sobre nível/intensidade/flags/texto). Substitui os `.txt`
 * temáticos que eram descartados no knapsack/stitcher. Entram no prompt pelo canal VIVO, junto de
 * `instructionPolicy` (ver ContextBuilder → assemblePrompt).
 *
 * Regras de design:
 * - Gate puro e determinístico (sem DSL, sem bandit). Fácil de testar via golden tests.
 * - `body` é o núcleo da lente; `depthBody` (opcional) é anexado quando intensidade ≥ 7 (NV3).
 * - Conteúdo conciso e auto-escopado por tema (a própria lente diz "quando o usuário trouxer X").
 */
import type { Flags } from "../flags";

export interface LensContext {
  nivel: 1 | 2 | 3;
  intensity: number;
  isVulnerable: boolean;
  flags: Flags;
  texto: string;
}

export interface Lens {
  id: string;
  gate: (ctx: LensContext) => boolean;
  body: string;
  /** Camada extra anexada quando intensidade ≥ 7 (NV3). */
  depthBody?: string;
}

const DEPTH_THRESHOLD = 7;

function norm(t: string): string {
  return (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tema de carreira/dinheiro/transição de identidade (sem \b final: casamento por prefixo). */
const RE_TRANSICAO =
  /\b(carreira|empreend|negocio|sair do emprego|morar sozinho|independencia|dinheiro|divida|financ|patrimonio|investiment|salario|comprometid|noivad)/;
/** Sensação de estar atrasado na vida / comparação social. */
const RE_ATRASO =
  /\b(atrasad|deveria (estar|ter)|era pra (eu )?ja|tarde demais|perdi (o )?tempo|fiquei para tras|fico para tras|ja devia ter|na minha frente|todo mundo (ja|conseguiu|consegue|esta))/;
/** Ruminação / pensamento em loop. */
const RE_RUMINACAO =
  /\b(nao paro de pensar|fico remoendo|nao saio disso|fico pensando|nao consigo parar de pensar|mente nao desliga|fico repassando)/;
/** Decisão / impasse / escolha. */
const RE_DECISAO =
  /\b(nao sei se devo|tenho que decidir|preciso decidir|fico na duvida entre|nao sei o que escolher|devo ou nao|que caminho|tomar uma decisao)/;
/** Luto / perda. */
const RE_LUTO = /\b(faleceu|morreu|perdi (minha|meu|a|o)|luto|saudade de|partiu|sepultamento|velorio)/;

export const LENSES: Lens[] = [
  {
    id: "IDENTIDADE_TRANSICAO",
    gate: (c) => c.nivel >= 2 && (RE_TRANSICAO.test(norm(c.texto)) || RE_ATRASO.test(norm(c.texto))),
    body:
      "Carreira, dinheiro, empreendedorismo, independência, comparação social ou 'estar atrasado na vida': não responda só ao fato explícito (o valor, a dívida, o emprego) — investigue o conflito identitário por baixo (o que isso parece dizer sobre quem a pessoa é, qual identidade está ameaçada, que transição está em curso: ex. empregado→empreendedor, dependente→independente). Padrão útil: 'Você falou de X, Y e Z; mas por baixo parece haver uma pergunta mais silenciosa...'. Em 'atraso', explore o referencial de comparação e as conquistas ignoradas — nunca frase motivacional. Distinga culpa ('fiz algo errado') de vergonha ('há algo errado comigo'). Reconheça recursos já presentes sem minimizar a dor; não romantize o sofrimento ('tudo acontece por uma razão').",
    depthBody:
      "Como a intensidade está alta: acolha primeiro e feche com pergunta de direção, não de resultado — 'Se demorasse mais do que você espera, o que faria esse período ainda valer a pena?'.",
  },
  {
    id: "AUTOVALOR_VERGONHA",
    gate: (c) => c.nivel >= 2 && (c.flags.vergonha || c.flags.autocritica || c.flags.culpa_marcada),
    body:
      "Quando aparecer vergonha ou identidade negativa ('sou um fracasso/defeituoso/uma decepção'): segurança psicológica primeiro. Separe a pessoa do comportamento/erro — o valor intrínseco não se perde nas falhas. Valide a emoção sem reforçar o rótulo de identidade. Não minimize ('todo mundo sente'), não use termo clínico, não diga que 'não é real'.",
    depthBody:
      "Em intensidade alta: nomeie a vergonha com delicadeza, abra espaço para pertencimento (consigo e em relações seguras) e feche com um gesto possível de autocuidado.",
  },
  {
    id: "VULNERABILIDADE_DEFESAS",
    gate: (c) =>
      c.nivel >= 2 && (c.flags.defesas_ativas || c.flags.evitamento || c.flags.combate || c.flags.vulnerabilidade),
    body:
      "Quando houver armaduras (racionalizar, minimizar, fazer piada, atacar antes, 'ter que ser forte sempre', produtividade sem parar): nomeie a defesa com cuidado, sem desarmá-la à força. Reconheça a função protetora antes de convidar a um microespaço mais aberto. Vulnerabilidade aqui é coragem com discernimento, não exposição obrigatória.",
  },
  {
    id: "RUMINACAO_PRESENCA",
    gate: (c) => c.nivel >= 2 && RE_RUMINACAO.test(norm(c.texto)),
    body:
      "Quando o pensamento estiver em loop ('não paro de pensar', 'fico remoendo'): não alimente o conteúdo do loop. Nomeie o padrão com gentileza e traga de volta ao concreto/presente (corpo, respiração, o que está aqui agora). Pensamentos não são a identidade — ajude a perceber o observador deles.",
  },
  {
    id: "DECISAO_AGENCIA",
    gate: (c) => c.nivel >= 2 && RE_DECISAO.test(norm(c.texto)),
    body:
      "Diante de impasse ou decisão: só estruture se houver algo concreto a organizar. Quando fizer sentido, ofereça até 3 elementos — o fato essencial, a intenção por trás e um próximo passo pequeno e executável. Mantenha como convite, preservando a autonomia da escolha; não decida pela pessoa.",
  },
  {
    id: "LUTO_PERDA",
    gate: (c) => c.nivel >= 2 && RE_LUTO.test(norm(c.texto)),
    body:
      "Em luto ou perda: presença antes de qualquer reorganização. Não busque sentido nem silver lining; não apresse fases. Acompanhe a dor no ritmo da pessoa, nomeie a saudade e o vínculo, e deixe claro que não há prazo para isso passar.",
    depthBody:
      "Em intensidade alta: reduza a análise ao mínimo, sustente o espaço e evite perguntas que peçam explicação — uma presença simples vale mais que uma pergunta.",
  },
];

/** Renderiza as lentes cujo gate passa, no mesmo formato dos blocos de instructionPolicy. */
export function renderLenses(ctx: LensContext): string {
  const blocks: string[] = [];
  for (const lens of LENSES) {
    let passed = false;
    try {
      passed = lens.gate(ctx);
    } catch {
      passed = false;
    }
    if (!passed) continue;
    const parts = [lens.body];
    if (lens.depthBody && ctx.intensity >= DEPTH_THRESHOLD) parts.push(lens.depthBody);
    blocks.push(`### ECO_LENS_${lens.id}\n${parts.join(" ")}`);
  }
  return blocks.join("\n\n").trim();
}

/** Lista ids das lentes ativas (debug/auditoria). */
export function activeLensIds(ctx: LensContext): string[] {
  return LENSES.filter((l) => {
    try {
      return l.gate(ctx);
    } catch {
      return false;
    }
  }).map((l) => l.id);
}
