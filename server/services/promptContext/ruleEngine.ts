import type { Flags } from "./flags";

export type RuleContext = Flags & {
  nivel: number;
  intensidade: number;
  hasTechBlock?: boolean;
};

export function evaluateRule(rule: string, ctx: RuleContext): boolean {
  if (!rule || typeof rule !== "string") return true;

  const orTerms = rule
    .split("||")
    .map((s) => s.trim())
    .filter(Boolean);

  if (orTerms.length === 0) return true;

  const evalAnd = (expr: string): boolean => {
    const andTerms = expr
      .split("&&")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const term of andTerms) {
      const notFlag = term.match(/^!\s*([a-z_]+)$/i);
      if (notFlag) {
        const v = readVarBool(notFlag[1], ctx);
        if (v === null || v !== false) return false;
        continue;
      }

      const flag = term.match(/^([a-z_]+)$/i);
      if (flag) {
        const v = readVarBool(flag[1], ctx);
        if (v !== true) return false;
        continue;
      }

      const cmpNum = term.match(/^([a-z_]+)\s*(>=|<=|==|!=|>|<)\s*([0-9]+)$/i);
      if (cmpNum) {
        const left = readVarNum(cmpNum[1], ctx);
        const op = cmpNum[2];
        const right = Number(cmpNum[3]);
        if (left === null) return false;
        if (!compare(left, op, right)) return false;
        continue;
      }

      const cmpBool = term.match(/^([a-z_]+)\s*(==|!=)\s*(true|false)$/i);
      if (cmpBool) {
        const left = readVarBool(cmpBool[1], ctx);
        if (left === null) return false;
        const want = cmpBool[3].toLowerCase() === "true";
        const ok = cmpBool[2] === "==" ? left === want : left !== want;
        if (!ok) return false;
        continue;
      }

      return false;
    }

    return true;
  };

  for (const andExpr of orTerms) {
    if (evalAnd(andExpr)) return true;
  }

  return false;
}

export function collectActiveSignals(rule: string | undefined, ctx: RuleContext): string[] {
  if (!rule) return [];
  const tokens = rule.match(/[a-z_]+/gi) ?? [];
  const seen = new Set<string>();
  const signals: string[] = [];

  for (const token of tokens) {
    const key = token.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const value = readVarBool(key, ctx);
    if (value === true) {
      signals.push(key);
    }
  }

  return signals;
}

function readVarBool(name: string, ctx: RuleContext): boolean | null {
  if (name === "hasTechBlock") {
    return Boolean(ctx.hasTechBlock);
  }

  if (name in ctx) {
    return Boolean((ctx as Record<string, unknown>)[name]);
  }

  return null;
}

function readVarNum(name: string, ctx: RuleContext): number | null {
  if (name === "nivel" || name === "intensidade") {
    return Number((ctx as Record<string, unknown>)[name]);
  }

  return null;
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case "<":
      return a < b;
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    default:
      return false;
  }
}
