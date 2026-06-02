import matrizPromptBaseV2 from "./matrizPromptBaseV2";
import type { Camada, CondicaoEspecial } from "./types";
import type { Flags } from "./flags";
import { collectActiveSignals, evaluateRule, type RuleContext } from "./ruleEngine";

export type ModuleDebugEntry = {
  id: string;
  source:
    | "base"
    | "intensity"
    | "rule"
    | "front_matter"
    | "dedupe"
    | "budget"
    | "knapsack"
    | "bandit";
  activated: boolean;
  threshold?: number | null;
  rule?: string | null;
  signals?: string[];
  reason?: string;
};

export type BaseSelection = {
  nivel: 1 | 2 | 3;
  intensidade: number;
  flags: Flags;
  raw: string[];
  posGating: string[];
  priorizado: string[];
  cortados: string[];
  debug: { modules: ModuleDebugEntry[] };
};

interface BaseSelectionParams {
  nivel: 1 | 2 | 3;
  intensidade: number;
  flags: Flags;
  hasTechBlock?: boolean;
}

export function selecionarModulosBase({
  nivel,
  intensidade,
  flags,
  hasTechBlock,
}: BaseSelectionParams): BaseSelection {
  const cortados: string[] = [];

  if (nivel === 1) {
    const minis =
      matrizPromptBaseV2.byNivelV2[1]?.specific?.slice?.() ?? [
        "abertura_superficie.txt",
        "sistema_identidade.txt",
        "ANTISALDO_MIN.txt",
      ];

    const priorizado = ordenarPorPrioridade(
      minis,
      matrizPromptBaseV2.limites?.prioridade,
      1
    );

    return {
      nivel,
      intensidade,
      flags,
      raw: minis,
      posGating: priorizado,
      priorizado,
      cortados,
      debug: {
        modules: minis.map((id) => ({ id, source: "base", activated: true })),
      },
    };
  }

  const spec = matrizPromptBaseV2.byNivelV2[nivel]?.specific ?? [];
  const inherits = matrizPromptBaseV2.byNivelV2[nivel]?.inherits ?? [];
  const inheritedModules = inherits.flatMap(
    (camada: Camada) => matrizPromptBaseV2.baseModules[camada] ?? []
  );
  const rawSet = new Set<string>([...spec, ...inheritedModules]);
  const raw = Array.from(rawSet);

  const moduleDebugMap = new Map<string, ModuleDebugEntry>();
  raw.forEach((id) => {
    if (!moduleDebugMap.has(id)) {
      moduleDebugMap.set(id, { id, source: "base", activated: true });
    }
  });

  const gatedSet = new Set<string>(raw);
  for (const [mod, minInt] of Object.entries(
    matrizPromptBaseV2.intensidadeMinima ?? {}
  )) {
    if (gatedSet.has(mod) && intensidade < Number(minInt)) {
      gatedSet.delete(mod);
      cortados.push(`${mod} [min=${minInt}]`);
      moduleDebugMap.set(mod, {
        id: mod,
        source: "intensity",
        activated: false,
        threshold: Number(minInt),
      });
    } else if (gatedSet.has(mod)) {
      moduleDebugMap.set(mod, {
        id: mod,
        source: "intensity",
        activated: true,
        threshold: Number(minInt),
      });
    }
  }

  const ctx: RuleContext = { nivel, intensidade, hasTechBlock, ...flags } as RuleContext;
  const condicoes = Object.entries(
    (matrizPromptBaseV2.condicoesEspeciais ?? {}) as Record<string, CondicaoEspecial>
  );

  for (const [mod, cond] of condicoes) {
    try {
      const passed = evaluateRule(cond.regra, ctx);
      moduleDebugMap.set(mod, {
        id: mod,
        source: "rule",
        activated: passed,
        rule: cond.regra,
        signals: collectActiveSignals(cond.regra, ctx),
      });
      if (passed) {
        gatedSet.add(mod);
      }
    } catch {
      // regra malformada: ignora
    }
  }

  const posGating = Array.from(gatedSet);
  const priorizado = ordenarPorPrioridade(
    posGating,
    matrizPromptBaseV2.limites?.prioridade,
    nivel
  );

  return {
    nivel,
    intensidade,
    flags,
    raw,
    posGating: priorizado,
    priorizado,
    cortados,
    debug: { modules: Array.from(moduleDebugMap.values()) },
  };
}

function ordenarPorPrioridade(
  arr: string[],
  priorityFromMatrix?: string[],
  nivel?: 1 | 2 | 3
): string[] {
  const priority = Array.isArray(priorityFromMatrix) ? priorityFromMatrix.slice() : [];

  if (nivel === 1) {
    ["abertura_superficie.txt", "sistema_identidade.txt", "ANTISALDO_MIN.txt"].forEach((m) => {
      if (!priority.includes(m)) priority.unshift(m);
    });
  }

  const idx = new Map<string, number>();
  priority.forEach((n, i) => idx.set(n, i));

  const dedup = Array.from(new Set(arr));
  dedup.sort(
    (a, b) => (idx.get(a) ?? 999) - (idx.get(b) ?? 999) || a.localeCompare(b)
  );
  return dedup;
}
