import type { ResponsePlan } from "../../utils/types";
import mixpanel from "../../lib/mixpanel";
import type { AnySupabase } from "../../adapters/SupabaseAdapter";
import { log } from "../promptContext/logger";
import {
  ensureTrailingQuestion,
  extractKeywords,
  formatKeywordList,
  lowerFirst,
  normalizeForMatch,
} from "./textUtils";

interface DomainPlan {
  id: string;
  regex: RegExp;
  foco: string;
  passos: string[];
  perguntaFinal: string;
}

const DOMAIN_PLANS: DomainPlan[] = [
  {
    id: "ansiedade",
    regex: /ansios|agitado|preocupad|tens[ao]|inquiet|nervos|apreensiv|acelerad|angust/,
    foco: "Cuidar da ansiedade e mapear o que ativa essa tensão.",
    passos: [
      "Acolher a sensação sem tentar resolver rápido.",
      "Refletir onde ela sente a ansiedade no corpo ou nos pensamentos.",
      "Oferecer escolha entre regular o corpo ou explorar a causa.",
    ],
    perguntaFinal: "O que deixaria essa ansiedade 5% mais suportável agora?",
  },
  {
    id: "cansaco",
    regex: /cansad|exaust|esgotad|sem\s+energia|desgastad|fatigad|sobrecarg|sobrecarreg/,
    foco: "Cuidar da exaustão e mapear necessidades de descanso.",
    passos: [
      "Reconhecer que o corpo está no limite.",
      "Refletir qual parte pede pausa ou suporte.",
      "Convidar a separar o que é urgente do que pode esperar.",
    ],
    perguntaFinal: "Qual o primeiro sinal de que seu corpo pede pausa neste momento?",
  },
  {
    id: "tristeza",
    regex: /trist|chorar|chatead|desanim|pra\s+baixo|melancol|desesperanç/,
    foco: "Abrir espaço para a tristeza e entender o que ela revela.",
    passos: [
      "Acolher o peso com calma.",
      "Refletir a dor ou perda que aparece no relato.",
      "Convidar a nomear o que mais precisa de cuidado.",
    ],
    perguntaFinal: "O que nessa tristeza pede ser reconhecido primeiro?",
  },
  {
    id: "raiva",
    regex: /raiva|irritad|furios|brav[oa]|ódio|injustiç|injustica|indign/,
    foco: "Dar contorno para a raiva e entender o que ela protege.",
    passos: [
      "Validar a energia da raiva.",
      "Refletir o gatilho principal.",
      "Explorar o que ela gostaria de proteger ou mudar.",
    ],
    perguntaFinal: "O que você sente que essa raiva está tentando proteger?",
  },
  {
    id: "medo",
    regex: /medo|receio|insegur|apavor|assustad|temer|pavor|temor/,
    foco: "Mapear o medo e diferenciar ameaça real de antecipação.",
    passos: [
      "Acolher a sensação de medo sem minimizar.",
      "Refletir onde esse medo aparece (corpo, pensamentos, cenário).",
      "Convidar a identificar um passo pequeno de segurança.",
    ],
    perguntaFinal: "O que traria 1% de segurança para você agora?",
  },
  {
    id: "solidao",
    regex: /solidao|sozinh|isolad|desconect|abandona/,
    foco: "Oferecer companhia e mapear onde falta conexão.",
    passos: [
      "Reconhecer a sensação de estar só.",
      "Refletir se a falta é externa ou interna.",
      "Convidar a identificar qual ponte faria diferença.",
    ],
    perguntaFinal: "Que tipo de presença faria diferença para você hoje?",
  },
  {
    id: "confusao",
    regex: /confus|perdid|indecis|bagunç|bagunc|sem\s+rumo|n[aã]o\s+sei/,
    foco: "Trazer clareza e organizar o que está embaralhado.",
    passos: [
      "Acolher a sensação de estar perdido.",
      "Refletir o dilema ou decisão central.",
      "Convidar a escolher um ponto pequeno para começar.",
    ],
    perguntaFinal: "Qual pergunta interna merece atenção primeiro?",
  },
  {
    id: "desmotivacao",
    regex: /desmotiv|sem\s+vontade|sem\s+força|desist|tanto\s+faz|pra\s+que/,
    foco: "Reconectar com sentido e pequenos impulsos de ação.",
    passos: [
      "Validar o baixo ânimo sem cobrança.",
      "Refletir o que drenou a motivação.",
      "Convidar a escolher um passo minúsculo que faça sentido.",
    ],
    perguntaFinal: "O que mereceria receber 10% da sua energia hoje?",
  },
  {
    id: "gratidao",
    regex: /gratid|grato|grata|feliz|aliviad|leve|celebr/,
    foco: "Ampliar a sensação boa e registrá-la de forma consciente.",
    passos: [
      "Celebrar junto de forma genuína.",
      "Refletir o que gerou essa sensação.",
      "Convidar a guardar ou expandir esse estado.",
    ],
    perguntaFinal: "Como você gostaria de guardar essa sensação com carinho?",
  },
];

const DEFAULT_PLAN: ResponsePlan = {
  foco: "Criar um espaço seguro para você se ouvir com clareza.",
  passos: [
    "Acolher o que a pessoa trouxe, sem pressa.",
    "Refletir a parte mais viva do relato.",
    "Convidar para aprofundar onde sentir necessidade.",
  ],
  perguntaFinal: "Onde faz sentido começarmos juntos agora?",
  temas: [],
};

export function sugerirPlanoResposta(ultimaMsg: string): ResponsePlan {
  const normalized = normalizeForMatch(ultimaMsg || "");
  const temas = extractKeywords(ultimaMsg || "", 3);
  const matched = DOMAIN_PLANS.find((plan) => plan.regex.test(normalized));

  if (!matched) {
    return { ...DEFAULT_PLAN, temas };
  }

  return {
    foco: matched.foco,
    passos: [...matched.passos],
    perguntaFinal: matched.perguntaFinal,
    temas,
  };
}

export function construirRespostaPersonalizada(
  ultimaMsg: string,
  plan: ResponsePlan
): string {
  const temas = plan.temas && plan.temas.length ? plan.temas : extractKeywords(ultimaMsg || "", 2);
  const temaTexto = temas.length ? `Quando você fala sobre ${formatKeywordList(temas)},` : "Pelo que você trouxe,";
  const foco = plan.foco.replace(/\.$/, "");
  const focoSegment = foco ? ` queria primeiro ${lowerFirst(foco)}.` : "";
  const primeiroPasso = plan.passos?.[0] ? ` Podemos começar ${lowerFirst(plan.passos[0].replace(/\.$/, ""))}.` : "";
  const pergunta = ensureTrailingQuestion(plan.perguntaFinal || DEFAULT_PLAN.perguntaFinal);

  return (
    `Quero te acompanhar de verdade, sem respostas prontas. ${temaTexto}${focoSegment}` +
    `${primeiroPasso} ${pergunta}`
  ).trim();
}

interface BanditArmRow {
  arm_key: string;
  alpha: number | null;
  beta: number | null;
  pulls: number | null;
  reward_sum: number | null;
  reward_sq_sum: number | null;
}

export interface PlannerModuleInput {
  key: string;
  tokenCost: number;
}

export interface PlannerModuleDensity {
  key: string;
  sample: number;
  density: number;
  tokenCost: number;
  alpha: number;
  beta: number;
  pulls: number;
}

export interface PlannerSelectionResult {
  selectedModules: string[];
  ordering: PlannerModuleDensity[];
  budget: number;
  tokensExpected: number;
}

interface PolicyConfigRow {
  tokens_budget?: number | null;
  tokensBudget?: number | null;
  config?: Record<string, unknown> | null;
}

function randomNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleGamma(shape: number): number {
  if (!Number.isFinite(shape) || shape <= 0) return 0;
  if (shape < 1) {
    const u = Math.random();
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    const x = randomNormal();
    const v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;

    const u = Math.random();
    const xSquared = x * x;
    if (u < 1 - 0.0331 * xSquared * xSquared) {
      return d * v;
    }
    if (Math.log(u) < 0.5 * xSquared + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

function sampleBeta(alpha: number, beta: number): number {
  const a = alpha > 0 ? alpha : 1;
  const b = beta > 0 ? beta : 1;

  const x = sampleGamma(a);
  const y = sampleGamma(b);
  const total = x + y;
  if (total <= 0) return a / (a + b);
  return x / total;
}

function normalizeModules(modules: PlannerModuleInput[]): PlannerModuleInput[] {
  return modules
    .map((module) => ({
      key: module.key.trim(),
      tokenCost: Number(module.tokenCost),
    }))
    .filter((module) => module.key.length > 0 && Number.isFinite(module.tokenCost) && module.tokenCost > 0);
}

function mergeModuleCostOverrides(
  modules: PlannerModuleInput[],
  overrides: Record<string, number> | null | undefined
): PlannerModuleInput[] {
  if (!overrides) return modules;
  const overrideEntries = Object.entries(overrides)
    .map(([key, cost]) => [key.trim(), Number(cost)] as const)
    .filter(([key, cost]) => key.length > 0 && Number.isFinite(cost) && cost > 0);
  if (!overrideEntries.length) return modules;

  const overrideMap = new Map(overrideEntries);
  return modules.map((module) => ({
    key: module.key,
    tokenCost: overrideMap.get(module.key) ?? module.tokenCost,
  }));
}

async function loadPolicyConfig(
  supabase: AnySupabase | null | undefined
): Promise<{ budget: number | null; moduleCosts: Record<string, number> | null }> {
  const fallback = { budget: null, moduleCosts: null };
  if (!supabase) return fallback;

  try {
    const analytics = supabase.schema("analytics");

    const { data, error } = await analytics
      .from("eco_policy_config")
      .select("tokens_budget, config")
      .limit(1)
      .maybeSingle();

    if (error) {
      log.warn("[responsePlanner] failed to load policy config", { error: error.message });
      return fallback;
    }

    const row = (data as PolicyConfigRow | null) ?? null;
    if (!row) return fallback;

    const rawBudget = row.tokens_budget ?? row.tokensBudget ?? null;
    let parsedBudget: number | null = null;
    if (Number.isFinite(rawBudget ?? NaN)) {
      parsedBudget = Math.max(0, Number(rawBudget));
    } else if (row.config && typeof row.config === "object" && row.config !== null) {
      const tokensBudget = (row.config as Record<string, unknown>).tokensBudget;
      if (Number.isFinite(tokensBudget as number)) {
        parsedBudget = Math.max(0, Number(tokensBudget));
      }
    }

    let moduleCosts: Record<string, number> | null = null;
    const config = row.config ?? null;
    if (config && typeof config === "object") {
      const byKey = (config as Record<string, unknown>).moduleCosts;
      if (byKey && typeof byKey === "object" && !Array.isArray(byKey)) {
        const entries = Object.entries(byKey as Record<string, unknown>)
          .map(([key, cost]) => [key.trim(), Number(cost)] as const)
          .filter(([key, cost]) => key.length > 0 && Number.isFinite(cost) && cost > 0);
        if (entries.length) {
          moduleCosts = entries.reduce<Record<string, number>>((acc, [key, cost]) => {
            acc[key] = cost;
            return acc;
          }, {});
        }
      } else {
        const modules = (config as Record<string, unknown>).modules;
        if (Array.isArray(modules)) {
          const entries = modules
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const key = (entry as Record<string, unknown>).key;
              const cost = (entry as Record<string, unknown>).tokenCost;
              if (typeof key !== "string" || !key.trim()) return null;
              if (!Number.isFinite(cost as number) || (cost as number) <= 0) return null;
              return [key.trim(), Number(cost)] as const;
            })
            .filter((entry): entry is readonly [string, number] => Array.isArray(entry));
          if (entries.length) {
            moduleCosts = entries.reduce<Record<string, number>>((acc, [key, cost]) => {
              acc[key] = cost;
              return acc;
            }, {});
          }
        }
      }
    }

    return {
      budget: parsedBudget,
      moduleCosts,
    };
  } catch (error) {
    log.warn("[responsePlanner] policy config error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

async function loadBanditStats(
  supabase: AnySupabase | null | undefined,
  keys: string[]
): Promise<Map<string, BanditArmRow>> {
  const map = new Map<string, BanditArmRow>();
  if (!supabase || !keys.length) return map;

  try {
    const analytics = supabase.schema("analytics");

    const { data, error } = await analytics
      .from("eco_bandit_arms")
      .select("arm_key, alpha, beta, pulls, reward_sum, reward_sq_sum")
      .in("arm_key", keys);

    if (error) {
      log.warn("[responsePlanner] failed to load bandit stats", { error: error.message });
      return map;
    }

    if (!Array.isArray(data)) return map;
    for (const row of data as BanditArmRow[]) {
      if (!row || typeof row.arm_key !== "string") continue;
      map.set(row.arm_key, row);
    }
  } catch (error) {
    log.warn("[responsePlanner] bandit stats error", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return map;
}

export async function selectPlannerModules({
  supabase,
  modules,
  defaultBudget = 600,
}: {
  supabase?: AnySupabase | null;
  modules: PlannerModuleInput[];
  defaultBudget?: number;
}): Promise<PlannerSelectionResult> {
  const normalizedModules = normalizeModules(Array.isArray(modules) ? modules : []);
  if (!normalizedModules.length) {
    return { selectedModules: [], ordering: [], budget: defaultBudget, tokensExpected: 0 };
  }

  const policy = await loadPolicyConfig(supabase ?? null);
  const budget = Math.max(0, Number.isFinite(policy.budget ?? NaN) ? Number(policy.budget) : defaultBudget);
  const modulesWithOverrides = mergeModuleCostOverrides(normalizedModules, policy.moduleCosts);

  const keys = modulesWithOverrides.map((module) => module.key);
  const banditStats = await loadBanditStats(supabase ?? null, keys);

  const ordering: PlannerModuleDensity[] = modulesWithOverrides.map((module) => {
    const stats = banditStats.get(module.key);
    const alpha = Number.isFinite(stats?.alpha ?? NaN) ? Number(stats?.alpha) : 1;
    const beta = Number.isFinite(stats?.beta ?? NaN) ? Number(stats?.beta) : 1;
    const pulls = Number.isFinite(stats?.pulls ?? NaN) ? Number(stats?.pulls) : 0;
    const sample = sampleBeta(alpha, beta);
    const density = sample / module.tokenCost;
    return {
      key: module.key,
      sample,
      density,
      tokenCost: module.tokenCost,
      alpha,
      beta,
      pulls,
    };
  });

  ordering.sort((a, b) => b.density - a.density);

  const selected: string[] = [];
  let tokensUsed = 0;

  for (const entry of ordering) {
    if (entry.tokenCost <= 0) continue;
    if (tokensUsed + entry.tokenCost > budget && selected.length > 0) continue;
    if (tokensUsed + entry.tokenCost > budget && selected.length === 0) {
      // Always allow at least one module even if it exceeds the budget.
      selected.push(entry.key);
      tokensUsed += entry.tokenCost;
      continue;
    }

    if (tokensUsed + entry.tokenCost <= budget) {
      selected.push(entry.key);
      tokensUsed += entry.tokenCost;
    }
  }

  try {
    mixpanel.track("BE:Planner Selection", {
      modules: selected,
      budget,
      tokensExpected: tokensUsed,
    });
  } catch (error) {
    log.warn("[responsePlanner] mixpanel planner selection failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    selectedModules: selected,
    ordering,
    budget,
    tokensExpected: tokensUsed,
  };
}
