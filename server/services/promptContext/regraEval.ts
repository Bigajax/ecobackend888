import { RegraContext, FlagSemantica } from "./types";

/**
 * Avalia expressões do tipo:
 *  - "intensidade>=7 && hasTechBlock==true"
 *  - "ancoragem && nivel>=2 && !pedido_pratico"
 *  - "intensidade>=8 && nivel>=3 && (ideacao || desespero || vazio || autodesvalorizacao)"
 *
 * Regras da DSL:
 *  - Identificadores válidos: intensidade, nivel, hasTechBlock e todas as flags de FlagSemantica.
 *  - Operadores suportados: &&, ||, !, >=, <=, >, <, ==, !=
 *  - Literais booleanos: true, false
 *  - Números inteiros para comparações numéricas
 */
export function evalRegra(expr: string, ctx: RegraContext): boolean {
  if (!expr || typeof expr !== "string") return true;

  // Lista branca de identificadores
  const allowId = new Set<string>([
    "intensidade",
    "nivel",
    "hasTechBlock",
    // flags:
    ...Object.keys((ctx.flags ?? {}) as Record<FlagSemantica, boolean>),
    // fallback: permite todas as flags possíveis mesmo que ctx.flags não as traga populadas
    "pedido_pratico","saudacao","factual","cansaco","desabafo","urgencia","emocao_alta_linguagem",
    "ideacao","desespero","vazio","autodesvalorizacao",
    "vulnerabilidade","vergonha","defesas_ativas","combate","evitamento","autocritica",
    "culpa_marcada","catastrofizacao",
    "ruminacao","confusao_emocional","mencao_corporal","excesso_racionalizacao",
    "sofrimento_avaliativo","identificacao_pensamentos",
    "ancoragem","causas_superam_estatisticas","certeza_emocional",
    "excesso_intuicao_especialista","ignora_regressao_media",
  ]);

  // Funções de leitura do contexto
  const readBool = (id: string): boolean => {
    if (id === "hasTechBlock") return Boolean(ctx.hasTechBlock);
    const flags = ctx.flags ?? {};
    return Boolean((flags as any)[id]);
  };

  const readNum = (id: string): number => {
    if (id === "intensidade") return Number(ctx.intensidade ?? 0);
    if (id === "nivel") return Number(ctx.nivel ?? 1);
    throw new Error(`Variável numérica não permitida: ${id}`);
  };

  // Tokenização simples preservando parênteses e operadores
  // Permitimos apenas: identificadores, números, true/false, parênteses e operadores listados
  const sanitized = expr
    .replace(/\s+/g, " ")
    .trim();

  // Avaliador recursivo por parsing simples (sem Function)
  let i = 0;

  function parseExpression(): boolean {
    let value = parseTerm();
    while (true) {
      skipSpaces();
      if (match("||")) {
        const right = parseTerm();
        value = value || right;
      } else {
        break;
      }
    }
    return value;
  }

  function parseTerm(): boolean {
    let value = parseFactor();
    while (true) {
      skipSpaces();
      if (match("&&")) {
        const right = parseFactor();
        value = value && right;
      } else {
        break;
      }
    }
    return value;
  }

  function parseFactor(): boolean {
    skipSpaces();
    if (match("!")) {
      return !parseFactor();
    }
    if (match("(")) {
      const inner = parseExpression();
      expect(")");
      return inner;
    }
    // comparações: left (id/num/bool) op right (num/bool)
    const leftTok = parseToken();
    // se veio um identificador/num/bool sem operador, trate como boolean (flags/true/false) ou num>0?
    skipSpaces();

    // operadores de comparação
    const op =
      match(">=") ? ">=" :
      match("<=") ? "<=" :
      match("==") ? "==" :
      match("!=") ? "!=" :
      match(">")  ? ">"  :
      match("<")  ? "<"  : null;

    if (!op) {
      // Sem operador: se token é boolean literal → retorna; se é id flag → bool; se é número → número!=0
      if (leftTok.kind === "bool") return leftTok.b!;
      if (leftTok.kind === "number") return leftTok.n! !== 0;
      if (leftTok.kind === "id") {
        const id = leftTok.id!;
        if (!allowId.has(id)) throw new Error(`Identificador não permitido: ${id}`);
        // id numérico vira booleano por convenção? Aqui só flags e hasTechBlock entram como bool se não houver op.
        if (id === "intensidade" || id === "nivel") {
          // "intensidade" sozinho não faz sentido; considere true se >0
          return readNum(id) > 0;
        }
        return readBool(id);
      }
      return false;
    }

    // há operador: parse do right
    skipSpaces();
    const rightTok = parseToken();

    // Comparações numéricas
    if (leftTok.kind === "id" && (leftTok.id === "intensidade" || leftTok.id === "nivel")) {
      const leftNum = readNum(leftTok.id);
      const rightNum = rightTok.kind === "number"
        ? rightTok.n!
        : rightTok.kind === "bool"
          ? (rightTok.b! ? 1 : 0)
          : (() => { throw new Error("Comparação numérica exige número à direita"); })();
      return cmpNum(leftNum, op, rightNum);
    }

    // Comparações booleanas
    const leftBool =
      leftTok.kind === "bool" ? leftTok.b! :
      leftTok.kind === "id"   ? (allowId.has(leftTok.id!) ? (leftTok.id === "intensidade" || leftTok.id === "nivel"
          ? readNum(leftTok.id!) > 0
          : readBool(leftTok.id!)) : (() => { throw new Error(`Identificador não permitido: ${leftTok.id}`) })()) :
      (() => { throw new Error("Comparação booleana exige id/bool à esquerda"); })();

    const rightBool =
      rightTok.kind === "bool" ? rightTok.b! :
      rightTok.kind === "number" ? rightTok.n! !== 0 :
      rightTok.kind === "id"   ? (allowId.has(rightTok.id!) ? (rightTok.id === "intensidade" || rightTok.id === "nivel"
          ? readNum(rightTok.id!) > 0
          : readBool(rightTok.id!)) : (() => { throw new Error(`Identificador não permitido: ${rightTok.id}`) })()) :
      (() => { throw new Error("Comparação booleana exige bool/id à direita"); })();

    if (op === "==") return leftBool === rightBool;
    if (op === "!=") return leftBool !== rightBool;
    throw new Error(`Operador inválido para booleanos: ${op}`);
  }

  function parseToken():
    | { kind: "id"; id: string }
    | { kind: "number"; n: number }
    | { kind: "bool"; b: boolean } {
    skipSpaces();

    // boolean literal
    if (peekWord("true"))  { i += 4; return { kind: "bool", b: true  }; }
    if (peekWord("false")) { i += 5; return { kind: "bool", b: false }; }

    // número
    const num = matchRegex(/^[0-9]+/);
    if (num) return { kind: "number", n: Number(num) };

    // identificador
    const id = matchRegex(/^[a-z_][a-z0-9_]*/i);
    if (id) {
      if (!allowId.has(id)) throw new Error(`Identificador não permitido: ${id}`);
      return { kind: "id", id };
    }

    throw new Error(`Token inesperado perto de: "${sanitized.slice(i, i + 12)}"`);
  }

  function cmpNum(a: number, op: string, b: number): boolean {
    switch (op) {
      case ">=": return a >= b;
      case "<=": return a <= b;
      case ">":  return a >  b;
      case "<":  return a <  b;
      case "==": return a === b;
      case "!=": return a !== b;
      default:   throw new Error(`Operador numérico inválido: ${op}`);
    }
  }

  function skipSpaces() {
    while (sanitized[i] === " ") i++;
  }
  function match(s: string): boolean {
    if (sanitized.slice(i, i + s.length) === s) {
      i += s.length;
      return true;
    }
    return false;
  }
  function expect(s: string) {
    if (!match(s)) throw new Error(`Esperado "${s}"`);
  }
  function matchRegex(re: RegExp): string | null {
    const m = sanitized.slice(i).match(re);
    if (m && m.index === 0) {
      i += m[0].length;
      return m[0];
    }
    return null;
  }
  function peekWord(word: string) {
    return sanitized.slice(i, i + word.length).toLowerCase() === word;
  }

  try {
    const res = parseExpression();
    skipSpaces();
    if (i !== sanitized.length) throw new Error("Entrada não totalmente consumida");
    return Boolean(res);
  } catch {
    // fallback conservador
    return false;
  }
}

/** Extrai quais sinais (flags/nome de variáveis) ficaram verdadeiros na regra, para DEBUG */
export function collectActiveSignals(expr: string | undefined, ctx: RegraContext): string[] {
  if (!expr) return [];
  const ids = new Set<string>();
  const tokens = expr.match(/[a-z_][a-z0-9_]*/gi) ?? [];
  for (const t of tokens) {
    if (t === "intensidade" || t === "nivel" || t === "hasTechBlock") continue;
    const v = Boolean(ctx.flags?.[t as FlagSemantica]);
    if (v) ids.add(t);
  }
  return Array.from(ids);
}
