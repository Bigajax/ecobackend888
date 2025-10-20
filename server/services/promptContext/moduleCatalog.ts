import { ModuleStore } from "./ModuleStore";
import { isDebug, log } from "./logger";
import { ensureModuleManifest } from "./moduleManifest";

export type ModuleFrontMatter = {
  minIntensity?: number;
  maxIntensity?: number;
  opennessIn?: number[];
  requireVulnerability?: boolean;
  flagsAny?: string[];
  order?: number;
  dedupeKey?: string;
  injectAs?: string | null;
};

export type ModuleCandidate = {
  name: string;
  text: string;
  tokens: number;
  meta: ModuleFrontMatter;
};

type ParsedModule = { body: string; meta: ModuleFrontMatter };

function parseValue(raw: string): string | number | boolean | null | (string | number | boolean | null)[] {
  const value = raw.trim();
  if (!value) return "";
  if (/^".*"$/.test(value) || /^'.*'$/.test(value)) return value.slice(1, -1);
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^\[[\s\S]*\]$/.test(value)) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((part) => parseValue(part.trim()))
      .map((item) => (Array.isArray(item) ? String(item) : item));
  }
  const num = Number(value);
  if (Number.isFinite(num)) return num;
  return value;
}

function parseFrontMatterBlock(block: string): Record<string, unknown> {
  const lines = block.split(/\r?\n/);
  const result: Record<string, unknown> = {};
  let currentListKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const listItem = line.match(/^-\s*(.*)$/);
    if (listItem && currentListKey) {
      const arr = (result[currentListKey] as unknown[]) ?? [];
      arr.push(parseValue(listItem[1] ?? ""));
      result[currentListKey] = arr;
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const valuePart = line.slice(colonIndex + 1).trim();

    if (!valuePart) {
      currentListKey = key;
      result[key] = (result[key] as unknown[]) ?? [];
      continue;
    }

    currentListKey = null;
    result[key] = parseValue(valuePart);
  }

  return result;
}

function normalizeArray(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => value as number);
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
}

function parseFrontMatter(content: string): ParsedModule {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) {
    return { body: content.trim(), meta: {} };
  }

  const block = match[1] ?? "";
  const rest = content.slice(match[0].length);
  const raw = parseFrontMatterBlock(block);

  const meta: ModuleFrontMatter = {};

  if (typeof raw.minIntensity === "number") meta.minIntensity = raw.minIntensity as number;
  if (typeof raw.maxIntensity === "number") meta.maxIntensity = raw.maxIntensity as number;
  const opennessList = normalizeArray(raw.opennessIn);
  if (opennessList.length) meta.opennessIn = opennessList as (1 | 2 | 3)[];
  if (raw.requireVulnerability != null) meta.requireVulnerability = Boolean(raw.requireVulnerability);
  const flagsAny = normalizeStringArray(raw.flagsAny);
  if (flagsAny.length) meta.flagsAny = flagsAny;
  if (typeof raw["order"] === "number") meta.order = raw["order"] as number;
  if (typeof raw.dedupeKey === "string") meta.dedupeKey = (raw.dedupeKey as string).trim();
  if (typeof raw.injectAs === "string") meta.injectAs = (raw.injectAs as string).trim();

  return { body: rest.trimStart(), meta };
}

const STRICT_MISSING = process.env.ECO_STRICT_MODULES === "1";

/* -------------------------- util: normalizador -------------------------- */
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function normalizeKey(name: string): string {
  return stripDiacritics(name).toLowerCase();
}
function normalizeKeyWithoutExt(name: string): string {
  return normalizeKey(name).replace(/\.(txt|md)$/i, "");
}

/* -------------------------- caches simples ----------------------------- */
const parsedCache = new Map<string, ParsedModule>();   // chave: nome real do arquivo
const tokenCache = new Map<string, number>();          // chave: nome real do arquivo + hash simples

export class ModuleCatalog {
  /** Mapa de resolução tolerante (case/diacríticos) -> nome real */
  private static relaxedIndex: Map<string, string> | null = null;

  static async ensureReady() {
    const anyStore = ModuleStore as unknown as { bootstrap?: () => Promise<void> };
    if (typeof anyStore.bootstrap === "function") {
      await anyStore.bootstrap();
    } else {
      await ModuleStore.buildFileIndexOnce();
    }
    await ensureModuleManifest();
    await this.buildRelaxedIndexIfPossible();
  }

  private static async buildRelaxedIndexIfPossible() {
    // Usa listagem se a store expuser; caso contrário, fica null e segue no modo "exato".
    const anyStore = ModuleStore as unknown as { listNames?: () => Promise<string[]> };
    if (typeof anyStore.listNames !== "function") {
      this.relaxedIndex = null;
      return;
    }
    const names = await anyStore.listNames();
    const map = new Map<string, string>();
    for (const n of names) {
      const keyWithExt = normalizeKey(n);
      if (!map.has(keyWithExt)) map.set(keyWithExt, n);
      const keyWithoutExt = normalizeKeyWithoutExt(n);
      if (!map.has(keyWithoutExt)) map.set(keyWithoutExt, n);
    }
    this.relaxedIndex = map;
  }

  /** Resolve nome exato ou tolerante (case/diacríticos) para o nome real no FS */
  private static async resolveName(name: string): Promise<string> {
    // tenta direto primeiro
    const direct = await ModuleStore.read(name);
    if (direct && direct.trim()) return name;

    if (!name.toLowerCase().endsWith(".txt")) {
      const withTxt = `${name}.txt`;
      const asTxt = await ModuleStore.read(withTxt);
      if (asTxt && asTxt.trim()) return withTxt;
    }

    // tenta índice tolerante, se disponível
    if (this.relaxedIndex) {
      const key = normalizeKey(name);
      const resolved = this.relaxedIndex.get(key);
      if (resolved) return resolved;

      const keyNoExt = normalizeKeyWithoutExt(name);
      const resolvedNoExt = this.relaxedIndex.get(keyNoExt);
      if (resolvedNoExt) return resolvedNoExt;
    }

    // fallback: mantém o nome original (vai cair nos logs/STRICT)
    return name;
  }

  static async load(names: string[]): Promise<ModuleCandidate[]> {
    const uniqueNames = Array.from(new Set(names));

    const resolvedNames = await Promise.all(uniqueNames.map((n) => this.resolveName(n)));

    const candidates = await Promise.all(
      resolvedNames.map(async (resolvedRealName, i) => {
        const requested = uniqueNames[i]; // para debug
        const raw = await this.require(resolvedRealName, requested);
        const parsed = parsedCache.get(resolvedRealName) ?? parseFrontMatter(raw);
        parsedCache.set(resolvedRealName, parsed);

        const tokenKey = `${resolvedRealName}::${parsed.body.length}`;
        const tokens =
          tokenCache.get(tokenKey) ?? ModuleStore.tokenCountOf(resolvedRealName, parsed.body);
        tokenCache.set(tokenKey, tokens);

        return {
          name: resolvedRealName,
          text: parsed.body,
          tokens,
          meta: parsed.meta,
        } as ModuleCandidate;
      })
    );

    // Mantém a ordem de "names" (pedido original), resolvendo pelo nome real
    const candidateMap = new Map(candidates.map((c) => [c.name, c]));
    return resolvedNames.map((real) => {
      const candidate = candidateMap.get(real);
      if (!candidate) throw new Error(`Unexpected missing module candidate for ${real}`);
      return candidate;
    });
  }

  static tokenCountOf(name: string, text: string): number {
    const tokenKey = `${name}::${text.length}`;
    if (tokenCache.has(tokenKey)) return tokenCache.get(tokenKey)!;
    const t = ModuleStore.tokenCountOf(name, text);
    tokenCache.set(tokenKey, t);
    return t;
  }

  private static async require(realName: string, requestedName?: string): Promise<string> {
    const found = await ModuleStore.read(realName);
    if (found && found.trim()) return found;

    const msg = `[ContextBuilder] módulo ausente: ${requestedName ?? realName} (resolved: ${realName})`;
    if (STRICT_MISSING) throw new Error(msg);
    log.debug("module_missing", {
      requested: requestedName ?? realName,
      resolved: realName,
    });
    return "";
  }

  /* ---------- opcional: health-check para pré-boot ---------- */
  static async assertKnown(expected: string[]) {
    const anyStore = ModuleStore as unknown as { listNames?: () => Promise<string[]> };
    if (typeof anyStore.listNames !== "function") return;

    const existing = new Set((await anyStore.listNames()).map((n) => normalizeKey(n)));
    const missing = expected.filter((n) => !existing.has(normalizeKey(n)));

    if (missing.length) {
      log.warn("[ECO] Módulos ausentes (por nome/acentos):", { missing });
    } else if (isDebug()) {
      log.debug("[ECO] Todos os módulos esperados foram localizados.");
    }
  }
}
