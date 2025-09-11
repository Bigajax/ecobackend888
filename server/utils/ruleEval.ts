// utils/ruleEval.ts
type Ctx = { nivel:number; intensidade:number; curiosidade?:boolean; duvida_classificacao?:boolean; pedido_pratico?:boolean };
export function evalRule(rule: string, ctx: Ctx): boolean {
  if (!rule?.trim()) return true;
  // substituições simples
  const map: Record<string, string> = {
    nivel: String(ctx.nivel),
    intensidade: String(ctx.intensidade),
    curiosidade: ctx.curiosidade ? 'true' : 'false',
    duvida_classificacao: ctx.duvida_classificacao ? 'true' : 'false',
    pedido_pratico: ctx.pedido_pratico ? 'true' : 'false',
  };
  let r = rule.replace(/\b(nivel|intensidade|curiosidade|duvida_classificacao|pedido_pratico)\b/g, m => map[m]);
  // tokens permitidos: true/false, números, (), &&, ||, !, <, <=, >, >=, ==, !=
  if (/[^0-9\s()!<>=&|truefals]/i.test(r)) return true; // fallback seguro
  // parser booleano mínimo
  try {
    // transforma 'true/false' em 1/0 para parser simples
    r = r.replace(/\btrue\b/gi, '1').replace(/\bfalse\b/gi, '0');
    // avalia com um parser próprio muito simples:
    // 1) comparações → 0/1
    r = r.replace(/(\d+(?:\.\d+)?)\s*(<=|>=|<|>|==|!=)\s*(\d+(?:\.\d+)?)/g,
      (_, a, op, b) => {
        const A = parseFloat(a), B = parseFloat(b);
        const ok = op === '<' ? A < B
          : op === '<=' ? A <= B
          : op === '>' ? A > B
          : op === '>=' ? A >= B
          : op === '==' ? A === B
          : A !== B;
        return ok ? '1' : '0';
      });
    // 2) !, &&, || (ordem): parênteses primeiro
    const evalExpr = (s: string): number => {
      while (/\([^()]*\)/.test(s)) s = s.replace(/\(([^()]+)\)/g, (_, inner) => String(evalExpr(inner)));
      s = s.replace(/!\s*([01])/g, (_, x) => (x === '1' ? '0' : '1'));
      const and = (t: string) => t.split('||').map(x =>
        x.trim().split(/&&/).every(y => y.trim() === '1') ? '1' : '0'
      ).some(v => v === '1') ? 1 : 0;
      return and(s);
    };
    return !!evalExpr(r);
  } catch { return true; }
}
