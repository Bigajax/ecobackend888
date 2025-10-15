import { promises as fs } from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SERVER_ROOT = path.join(REPO_ROOT, "server");
const ASSETS_ROOT = path.join(SERVER_ROOT, "assets");
const DIST_ASSETS_ROOT = path.join(SERVER_ROOT, "dist", "assets");
const DOCS_ROOT = path.join(REPO_ROOT, "docs");
const INVENTORY_PATH = path.join(DOCS_ROOT, "modules-inventory.md");
const STUB_CONTENT = `---\nminIntensity: 0\nopennessIn: [1,2,3]\nflagsAny: []\ninjectAs: null\norder: 9999\n---\n`;

const SOURCE_DIRS: string[] = [
  path.join(SERVER_ROOT, "services"),
  path.join(SERVER_ROOT, "routes"),
  path.join(SERVER_ROOT, "assets", "config"),
  path.join(SERVER_ROOT, "tests"),
  path.join(REPO_ROOT, "src"),
];

const SUPPORTED_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

const REASON_HINTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /ContextBuilder\.ts$/, label: "ContextBuilder intents/gating" },
  { pattern: /matrizPromptBaseV2\.ts$/, label: "Matriz base de módulos" },
  { pattern: /heuristicasTriggers\.ts$/, label: "Gatilhos de heurísticas" },
  { pattern: /emocionaisTriggers\.ts$/, label: "Gatilhos emocionais" },
  { pattern: /estoicosTriggers\.ts$/, label: "Gatilhos estoicos" },
  { pattern: /regulacaoTriggers\.ts$/, label: "Gatilhos de regulação" },
  { pattern: /montarContextoEco\.ts$/, label: "Frontend legacy context builder" },
];

const MANUAL_CATEGORY: Record<string, string> = {
  usomemorias: "modulos_core",
  eco_presenca_racional: "modulos_filosoficos",
  eco_identificacao_mente: "modulos_filosoficos",
  eco_fim_do_sofrimento: "modulos_filosoficos",
  eco_observador_presente: "modulos_filosoficos",
  eco_corpo_emocao: "modulos_filosoficos",
  eco_corpo_sensacao: "modulos_filosoficos",
  eco_memoria_revisitar_passado: "modulos_emocionais",
  eco_emo_vergonha_combate: "modulos_emocionais",
  eco_vulnerabilidade_defesas: "modulos_emocionais",
  eco_vulnerabilidade_mitos: "modulos_emocionais",
};

const ASSET_CATEGORIES = [
  "modulos_core",
  "modulos_cognitivos",
  "modulos_emocionais",
  "modulos_extras",
  "modulos_filosoficos",
];

interface ModuleReference {
  canonicalName: string;
  normalizedKey: string;
  sources: Set<string>;
  reasons: Set<string>;
}

interface ModuleEntry extends ModuleReference {
  category: string;
  serverPath: string;
  distPath: string;
  status: "present" | "stub-existing" | "stub-created";
}

function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function normalizeKey(input: string): string {
  return stripDiacritics(input).toLowerCase();
}

function normalizeBase(raw: string): string {
  const cleaned = raw.replace(/\.(txt|md)$/i, "");
  return normalizeKey(cleaned);
}

function ensureTxt(name: string): string {
  return name.toLowerCase().endsWith(".txt") ? name : `${name}.txt`;
}

function scoreCandidate(name: string): number {
  let score = 0;
  if (/\.txt$/i.test(name)) score += 10;
  if (/[\p{Lu}]/u.test(name)) score += 0.1;
  if (/[^\u0000-\u007f]/.test(name)) score += 1;
  if (/[^a-z0-9_\.\-]/i.test(name)) score -= 1;
  return score;
}

function chooseRepresentative(current: string | undefined, incomingRaw: string): string {
  const incoming = ensureTxt(incomingRaw.trim());
  if (!current) return incoming;
  const scoredCurrent = scoreCandidate(current);
  const scoredIncoming = scoreCandidate(incoming);
  if (scoredIncoming > scoredCurrent) return incoming;
  if (scoredIncoming === scoredCurrent && incoming.length < current.length) return incoming;
  return current;
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        out = await walk(full, out);
      } else {
        const ext = path.extname(entry.name);
        if (SUPPORTED_EXT.has(ext)) {
          out.push(full);
        }
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Falha ao ler diretório ${dir}:`, err);
    }
  }
  return out;
}

function classifyReason(filePath: string): string {
  for (const { pattern, label } of REASON_HINTS) {
    if (pattern.test(filePath)) return label;
  }
  return `referenciado em ${path.relative(REPO_ROOT, filePath)}`;
}

function isLikelyModuleName(name: string): boolean {
  if (!/^[\p{L}\p{N}_\.\-]+$/u.test(name)) return false;
  if (name.includes("..")) return false;
  return true;
}

async function collectModuleReferences(): Promise<Map<string, ModuleReference>> {
  const files: string[] = [];
  for (const dir of SOURCE_DIRS) {
    const collected = await walk(dir);
    files.push(...collected);
  }

  const references = new Map<string, ModuleReference>();
  const regex = /["'`](?<name>(?:[A-Z]{2,}_[^"'`\\]*?|eco_[^"'`\\]*?|USOMEM[^"'`\\]*?))['"`]/gu;

  for (const file of files) {
    const content = await fs.readFile(file, "utf-8");
    for (const match of content.matchAll(regex)) {
      const rawName = match.groups?.name?.trim();
      if (!rawName) continue;
      if (rawName.includes("/")) continue;
      if (!isLikelyModuleName(rawName)) continue;
      const normalized = normalizeBase(rawName);
      const canonical = chooseRepresentative(references.get(normalized)?.canonicalName, rawName);
      const existing = references.get(normalized);
      const reason = classifyReason(file);
      if (existing) {
        existing.canonicalName = canonical;
        existing.sources.add(path.relative(REPO_ROOT, file));
        existing.reasons.add(reason);
        references.set(normalized, existing);
      } else {
        references.set(normalized, {
          canonicalName: canonical,
          normalizedKey: normalized,
          sources: new Set([path.relative(REPO_ROOT, file)]),
          reasons: new Set([reason]),
        });
      }
    }
  }

  return references;
}

function resolveCategory(normalized: string, canonical: string): string {
  if (MANUAL_CATEGORY[normalized]) return MANUAL_CATEGORY[normalized];
  if (normalized.includes("heuristica")) return "modulos_cognitivos";
  if (normalized.includes("memoria") || normalized.includes("vulnerabilidade") || normalized.includes("emo_")) {
    return "modulos_emocionais";
  }
  if (
    normalized.includes("presenca") ||
    normalized.includes("mente") ||
    normalized.includes("sofrimento") ||
    normalized.includes("corpo") ||
    normalized.includes("observador")
  ) {
    return "modulos_filosoficos";
  }
  if (canonical.startsWith("IDENTIDADE") || canonical.startsWith("DEVELOPER_")) {
    return "modulos_core";
  }
  return "modulos_core";
}

async function readFileIfExists(target: string): Promise<string | null> {
  try {
    const content = await fs.readFile(target, "utf-8");
    return content;
  } catch {
    return null;
  }
}

async function ensureDirectory(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function ensureStub(entry: ModuleEntry): Promise<ModuleEntry> {
  const existing = await readFileIfExists(entry.serverPath);
  if (existing != null) {
    const trimmed = existing.trim();
    if (trimmed === STUB_CONTENT.trim()) {
      entry.status = "stub-existing";
    } else {
      entry.status = "present";
    }
  } else {
    await ensureDirectory(path.dirname(entry.serverPath));
    await fs.writeFile(entry.serverPath, STUB_CONTENT, "utf-8");
    entry.status = "stub-created";
  }

  const distExisting = await readFileIfExists(entry.distPath);
  if (distExisting == null) {
    await ensureDirectory(path.dirname(entry.distPath));
    await fs.writeFile(entry.distPath, STUB_CONTENT, "utf-8");
  }

  return entry;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function findExistingAsset(canonical: string): Promise<{ serverPath: string; category: string } | null> {
  let stubCandidate: { serverPath: string; category: string } | null = null;
  for (const category of ASSET_CATEGORIES) {
    const candidate = path.join(ASSETS_ROOT, category, canonical);
    if (!(await fileExists(candidate))) continue;
    const content = await readFileIfExists(candidate);
    if (content && content.trim() !== STUB_CONTENT.trim()) {
      return { serverPath: candidate, category };
    }
    if (!stubCandidate) {
      stubCandidate = { serverPath: candidate, category };
    }
  }
  return stubCandidate;
}

async function buildInventoryEntry(ref: ModuleReference): Promise<ModuleEntry> {
  const canonical = ensureTxt(ref.canonicalName);
  const normalized = normalizeBase(canonical);
  const existing = await findExistingAsset(canonical);
  const category = existing?.category ?? resolveCategory(normalized, canonical);
  const serverPath = existing?.serverPath ?? path.join(ASSETS_ROOT, category, canonical);
  const distPath = path.join(DIST_ASSETS_ROOT, category, canonical);
  return {
    ...ref,
    canonicalName: canonical,
    normalizedKey: normalized,
    category,
    serverPath,
    distPath,
    status: "present",
  };
}

function formatStatus(status: ModuleEntry["status"]): string {
  switch (status) {
    case "present":
      return "presente";
    case "stub-existing":
      return "stub (existente)";
    case "stub-created":
      return "stub (criado agora)";
    default:
      return status;
  }
}

function formatSources(entry: ModuleEntry): string {
  const reasons = Array.from(entry.reasons).sort();
  return reasons.join("; ");
}

async function writeInventory(entries: ModuleEntry[]) {
  await ensureDirectory(DOCS_ROOT);
  const timestamp = new Date().toISOString();
  const total = entries.length;
  const present = entries.filter((e) => e.status === "present").length;
  const stubExisting = entries.filter((e) => e.status === "stub-existing").length;
  const stubCreated = entries.filter((e) => e.status === "stub-created").length;

  const header = `# Inventário de módulos\n\n` +
    `- Última varredura: ${timestamp}\n` +
    `- Total referenciados: ${total}\n` +
    `- Presentes: ${present}\n` +
    `- Stubs existentes: ${stubExisting}\n` +
    `- Stubs criados nesta execução: ${stubCreated}\n\n` +
    `| Módulo | Status | Caminho (server/assets) | Motivo |\n` +
    `| --- | --- | --- | --- |\n`;

  const rows = entries
    .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, "pt-BR"))
    .map((entry) => {
      const relPath = path.relative(REPO_ROOT, entry.serverPath);
      return `| ${entry.canonicalName} | ${formatStatus(entry.status)} | ${relPath} | ${formatSources(entry)} |`;
    })
    .join("\n");

  await fs.writeFile(INVENTORY_PATH, header + rows + "\n", "utf-8");
}

async function main() {
  const references = await collectModuleReferences();
  const entries: ModuleEntry[] = [];

  for (const ref of references.values()) {
    const entry = await buildInventoryEntry(ref);
    const ensured = await ensureStub(entry);
    entries.push(ensured);
  }

  await writeInventory(entries);

  const created = entries.filter((e) => e.status === "stub-created");
  const existing = entries.filter((e) => e.status === "stub-existing");
  const present = entries.filter((e) => e.status === "present");

  console.log("Inventário concluído:");
  console.log(`  Presentes: ${present.length}`);
  console.log(`  Stubs existentes: ${existing.length}`);
  console.log(`  Stubs criados nesta execução: ${created.length}`);
}

main().catch((err) => {
  console.error("modules:inventory falhou", err);
  process.exitCode = 1;
});
