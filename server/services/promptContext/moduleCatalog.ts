import { ModuleStore } from "./ModuleStore";
import { isDebug, log } from "./logger";

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
  if (/^".*"$/.test(value) || /^'.*'$/.test(value)) {
    return value.slice(1, -1);
  }
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

  if (typeof raw["min_intensity"] === "number") meta.minIntensity = raw["min_intensity"] as number;
  if (typeof raw["max_intensity"] === "number") meta.maxIntensity = raw["max_intensity"] as number;
  const opennessList = normalizeArray(raw["openness_in"]);
  if (opennessList.length) meta.opennessIn = opennessList as (1 | 2 | 3)[];
  if (raw["require_vulnerability"] != null) meta.requireVulnerability = Boolean(raw["require_vulnerability"]);
  const flagsAny = normalizeStringArray(raw["flags_any"]);
  if (flagsAny.length) meta.flagsAny = flagsAny;
  if (typeof raw["order"] === "number") meta.order = raw["order"] as number;
  if (typeof raw["dedupe_key"] === "string") meta.dedupeKey = (raw["dedupe_key"] as string).trim();
  if (typeof raw["inject_as"] === "string") meta.injectAs = (raw["inject_as"] as string).trim();

  return { body: rest.trimStart(), meta };
}

const STRICT_MISSING = process.env.ECO_STRICT_MODULES === "1";

export class ModuleCatalog {
  static async ensureReady() {
    const anyStore = ModuleStore as unknown as { bootstrap?: () => Promise<void> };
    if (typeof anyStore.bootstrap === "function") {
      await anyStore.bootstrap();
      return;
    }
    await ModuleStore.buildFileIndexOnce();
  }

  static async load(names: string[]): Promise<ModuleCandidate[]> {
    const uniqueNames = Array.from(new Set(names));
    const candidates = await Promise.all(
      uniqueNames.map(async (name) => {
        const raw = await this.require(name);
        const parsed = parseFrontMatter(raw);
        const tokens = ModuleStore.tokenCountOf(name, parsed.body);
        return { name, text: parsed.body, tokens, meta: parsed.meta } as ModuleCandidate;
      })
    );

    const candidateMap = new Map(candidates.map((candidate) => [candidate.name, candidate]));

    return names.map((name) => {
      const candidate = candidateMap.get(name);
      if (!candidate) {
        throw new Error(`Unexpected missing module candidate for ${name}`);
      }
      return candidate;
    });
  }

  static tokenCountOf(name: string, text: string): number {
    return ModuleStore.tokenCountOf(name, text);
  }

  private static async require(name: string): Promise<string> {
    const found = await ModuleStore.read(name);
    if (found && found.trim()) return found;

    const msg = `[ContextBuilder] módulo ausente: ${name}`;
    if (STRICT_MISSING) throw new Error(msg);
    if (isDebug()) log.debug(msg + " — usando vazio (dev/relaxado)");
    return "";
  }
}
