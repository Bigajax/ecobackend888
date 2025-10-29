/// <reference types="node" />

import * as path from "path";
import { promises as fs, Dirent } from "fs";
import { log, isDebug } from "./logger";
import { getAssetsRoot } from "../../src/utils/assetsRoot";

/** ---------------------- Encoder resiliente ---------------------- */
type Encoder = { encode: (s: string) => number[] };

function makeEncoder(): Encoder {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { get_encoding } = require("@dqbd/tiktoken");
    const enc = get_encoding("cl100k_base");
    if (isDebug()) log.debug("[ModuleStore] Encoder: tiktoken(cl100k_base)");
    return enc;
  } catch (err) {
    const te = new TextEncoder();
    if (isDebug())
      log.debug("[ModuleStore] Encoder: TextEncoder fallback", { err: String(err) });
    return { encode: (s: string) => Array.from(te.encode(s)) };
  }
}
const enc = makeEncoder();

/** Normaliza nome de arquivo para chave do índice (case-insensitive). */
function normKey(name: string) {
  return name.normalize("NFC").toLowerCase();
}

/** Extensões suportadas para módulos. */
const ALLOWED_EXT = new Set([".txt", ".md"]);

type FileMetadata = {
  full: string;
  name: string;
  rel: string;
};

/** -------------------------- Helpers de path -------------------------- */

/** Retorna apenas diretórios que existem. */
function normalizeRoot(candidate: string): string {
  return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
}

async function filterExistingDirs(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of paths) {
    const resolved = normalizeRoot(p);
    try {
      const st = await fs.stat(resolved);
      if (st.isDirectory()) out.push(resolved);
    } catch {
      // ignore
    }
  }
  return out;
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    const st = await fs.stat(dir);
    return st.isDirectory();
  } catch {
    return false;
  }
}

/** Tenta resolver roots a partir da env ou de candidatos padrão. */
async function resolveDefaultRoots(): Promise<string[]> {
  const roots: string[] = [];
  const pushRoot = (candidate: string | null | undefined) => {
    if (!candidate) return;
    const resolved = normalizeRoot(candidate);
    if (!roots.includes(resolved)) {
      roots.push(resolved);
    }
  };

  const envRootCandidates = (process.env.ECO_PROMPT_ROOTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeRoot);

  if (envRootCandidates.length > 0) {
    const existing = await filterExistingDirs(envRootCandidates);
    if (existing.length > 0) {
      for (const candidate of existing) {
        pushRoot(candidate);
      }
    } else {
      log.warn("[ModuleStore] ECO_PROMPT_ROOTS provided but none found", {
        envRoots: envRootCandidates,
      });
    }
  }

  const assetsRoot = normalizeRoot(getAssetsRoot());
  if (!(await directoryExists(assetsRoot))) {
    log.warn("[ModuleStore] assets_root_missing", { root: assetsRoot });
  }
  pushRoot(assetsRoot);

  const workspaceRoot = normalizeRoot(path.resolve(process.cwd(), "server/assets"));
  if (workspaceRoot !== assetsRoot && (await directoryExists(workspaceRoot))) {
    pushRoot(workspaceRoot);
  }

  const distRoot = normalizeRoot(path.resolve(process.cwd(), "dist/assets"));
  if (distRoot !== assetsRoot && (await directoryExists(distRoot))) {
    pushRoot(distRoot);
  }

  const serverDistRoot = normalizeRoot(path.resolve(process.cwd(), "server/dist/assets"));
  if (serverDistRoot !== assetsRoot && (await directoryExists(serverDistRoot))) {
    pushRoot(serverDistRoot);
  }

  const legacyRoot = normalizeRoot(path.resolve(process.cwd(), "assets"));
  if (await directoryExists(legacyRoot)) {
    log.warn("[ModuleStore] legacy_assets_detected", { legacyRoot });
    pushRoot(legacyRoot);
  }

  if (isDebug()) {
    log.debug("[ModuleStore] resolved_roots", { roots });
  }

  return roots;
}

/** ----------------------------- Classe ----------------------------- */

export class ModuleStore {
  private static _i: ModuleStore;
  static get I() { return (this._i ??= new ModuleStore()); }

  private roots: string[] = [];
  private fileIndexBuilt = false;
  private fileIndex = new Map<string, FileMetadata>(); // key(norm) -> file metadata
  private uniqueFiles = new Map<string, FileMetadata>();
  private cacheModulos = new Map<string, string>(); // key(norm) -> content
  private tokenCountCache = new Map<string, number>(); // key -> tokens
  private cacheSources = new Map<string, { root: string | null; path: string | null }>();
  private buildLock: Promise<void> | null = null;
  private bootstrapped = false;

  /** --------------------- Configuração & util --------------------- */

  /** Define pastas e limpa caches/índices. */
  configure(roots: string[]) {
    this.roots = (roots || []).filter(Boolean).map(normalizeRoot);
    this.fileIndexBuilt = false;
    this.fileIndex.clear();
    this.uniqueFiles.clear();
    this.cacheModulos.clear();
    this.tokenCountCache.clear();
    this.cacheSources.clear();
    this.bootstrapped = this.roots.length > 0;
    if (isDebug()) log.debug("[ModuleStore.configure]", { roots: this.roots });
  }

  /** Inicializa roots automaticamente se não houver configuração explícita. */
  private async ensureBootstrapped() {
    if (this.bootstrapped && this.roots.length > 0) return;

    const defaults = await resolveDefaultRoots();
    if (defaults.length === 0) {
      // Ainda assim permita funcionar via registerInline(); mas avise.
      if (isDebug())
        log.debug("[ModuleStore.ensureBootstrapped] no roots found; relying on inline modules only");
      this.bootstrapped = true;
      return;
    }

    this.configure(defaults);
    this.bootstrapped = true;
    if (isDebug())
      log.debug("[ModuleStore.bootstrap] configurado", { roots: this.roots });
  }

  /** Exposto para o servidor chamar no boot (recomendado). */
  async bootstrap() {
    await this.ensureBootstrapped();
    await this.buildFileIndexOnce();
  }

  /** Estatísticas rápidas (para debug endpoints). */
  stats() {
    return {
      roots: [...this.roots],
      indexedCount: this.uniqueFiles.size,
      cachedCount: this.cacheModulos.size,
      built: this.fileIndexBuilt,
    };
  }

  /** Lista até N nomes indexados (sem caminhos), útil para debug. */
  listIndexed(limit = 50) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of this.uniqueFiles.values()) {
      if (seen.has(item.full)) continue;
      seen.add(item.full);
      out.push(item.rel || item.name);
      if (out.length >= limit) break;
    }
    return out;
  }

  async listNames(): Promise<string[]> {
    await this.buildFileIndexOnce();
    return Array.from(this.uniqueFiles.values()).map((item) => item.name);
  }

  /** Invalida caches (tudo ou só um módulo). */
  invalidate(name?: string) {
    if (!name) {
      this.cacheModulos.clear();
      this.tokenCountCache.clear();
      this.cacheSources.clear();
      return;
    }
    const k = normKey(name);
    this.cacheModulos.delete(k);
    this.tokenCountCache.delete(k);
    this.cacheSources.delete(k);
    // inline caches usam chaves __INLINE__: não dá para invalidar seletivo sem parâmetro extra
  }

  /** Registra um módulo “inline” (fallback em memória) com esse nome. */
  registerInline(name: string, content: string) {
    const k = normKey(name);
    const c = (content ?? "").trim();
    this.cacheModulos.set(k, c);
    this.tokenCountCache.set(k, enc.encode(c).length);
    this.cacheSources.set(k, { root: null, path: null });
    // NÃO grava no fileIndex; é somente cache em memória.
    if (isDebug()) log.debug("[ModuleStore.registerInline] registrado", { name, tokens: this.tokenCountCache.get(k) });
  }

  // ------- Wrappers estáticos (compat) -------
  static async buildFileIndexOnce(): Promise<void> { return this.I.buildFileIndexOnce(); }
  static async bootstrap(): Promise<void> { return this.I.bootstrap(); }
  static configure(roots: string[]) { this.I.configure(roots); }
  static async read(name: string): Promise<string | null> { return this.I.read(name); }
  static tokenCountOf(name: string, content?: string): number { return this.I.tokenCountOf(name, content); }
  static stats() { return this.I.stats(); }
  static listIndexed(limit?: number) { return this.I.listIndexed(limit); }
  static async listNames(): Promise<string[]> { return this.I.listNames(); }
  static invalidate(name?: string) { return this.I.invalidate(name); }
  static registerInline(name: string, content: string) { return this.I.registerInline(name, content); }
  // -------------------------------------------

  /** -------------------- Indexação de arquivos ------------------- */

  /** Varre diretórios recursivamente e retorna arquivos suportados. */
  private async walkDir(base: string, relative = ""): Promise<FileMetadata[]> {
    const out: FileMetadata[] = [];
    try {
      const entries: Dirent[] = await fs.readdir(base, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const ent of entries) {
        const full = path.join(base, ent.name);
        const rel = relative ? path.posix.join(relative, ent.name) : ent.name;
        if (ent.isDirectory()) {
          const nested = await this.walkDir(full, rel);
          out.push(...nested);
        } else {
          const ext = path.extname(ent.name).toLowerCase();
          if (ALLOWED_EXT.has(ext)) {
            out.push({ name: ent.name, full, rel });
          }
        }
      }
    } catch (err) {
      if (isDebug())
        log.debug("[ModuleStore.walkDir] skipping root (not found)", { base, err: String(err) });
    }
    return out;
  }

  /** Constrói índice de arquivos (garante execução única com lock). */
  private async buildFileIndexOnce() {
    if (this.fileIndexBuilt) return;

    await this.ensureBootstrapped();

    // lock para evitar corrida em ambientes com boot concorrente
    if (!this.buildLock) {
      this.buildLock = (async () => {
        let totalIndexed = 0;

        if (this.roots.length === 0) {
          // sem roots: funciona apenas com inline; não é erro.
          if (isDebug())
            log.debug("[ModuleStore.buildFileIndexOnce] no roots; inline-only mode");
          this.fileIndexBuilt = true;
          return;
        }

        for (const base of this.roots) {
          const files = await this.walkDir(base);
          for (const f of files) {
            const key = normKey(f.name);
            if (!this.fileIndex.has(key)) {
              this.fileIndex.set(key, f);
            }
            const relKey = normKey(f.rel);
            if (!this.fileIndex.has(relKey)) {
              this.fileIndex.set(relKey, f);
            }
            if (!this.uniqueFiles.has(f.full)) {
              this.uniqueFiles.set(f.full, f);
              totalIndexed++;
            }
          }
        }
        this.fileIndexBuilt = true;
        if (isDebug())
          log.debug("[ModuleStore.buildFileIndexOnce] index built", {
            roots: this.roots.length,
            files: totalIndexed,
          });
      })().catch((err) => {
        // se falhar, zera lock para permitir nova tentativa futura
        this.buildLock = null;
        throw err;
      });
    }

    await this.buildLock;
  }

  /** ----------------------- Leitura e tokens ---------------------- */

  /** Lê um módulo por nome (ex.: "IDENTIDADE.txt"). */
  async read(name: string): Promise<string | null> {
    if (!name?.trim()) return null;
    const key = normKey(name);

    const cached = this.cacheModulos.get(key);
    if (cached != null) {
      const source = this.cacheSources.get(key);
      this.logServed(name, source, true);
      if (isDebug())
        log.debug("[ModuleStore.read] cache hit", { name, tokens: this.tokenCountCache.get(key) ?? -1 });
      return cached;
    }

    await this.buildFileIndexOnce();

    // 1) caminho pelo índice
    const indexed = this.fileIndex.get(key);
    if (indexed) {
      try {
        const c = (await fs.readFile(indexed.full, "utf-8")).trim();
        this.cacheModulos.set(key, c);
        this.tokenCountCache.set(key, enc.encode(c).length);
        const root = this.findRootForPath(indexed.full);
        const source = this.captureSource(key, root, indexed.full);
        this.logServed(name, source, false);
        if (isDebug())
          log.debug("[ModuleStore.read] index path", {
            name,
            path: indexed.full,
            tokens: this.tokenCountCache.get(key),
          });
        return c;
      } catch (err) {
        if (isDebug())
          log.debug("[ModuleStore.read] read fail (indexed path)", {
            name,
            path: indexed.full,
            err: String(err),
          });
      }
    }

    // 2) fallback direto (arquivo recém-criado pode não estar no índice)
    for (const base of this.roots) {
      try {
        const full = path.join(base, name);
        const c = (await fs.readFile(full, "utf-8")).trim();
        this.cacheModulos.set(key, c);
        this.tokenCountCache.set(key, enc.encode(c).length);
        const source = this.captureSource(key, base, full);
        this.logServed(name, source, false);
        if (isDebug())
          log.debug("[ModuleStore.read] fallback path", { name, path: full, tokens: this.tokenCountCache.get(key) });
        return c;
      } catch {
        // tenta próximo root
      }
    }

    if (isDebug()) log.debug("[ModuleStore.read] not found", { name });
    return null;
  }

  /**
   * Conta tokens de um módulo (por nome) ou conteúdo inline.
   * - Para inline: chave __INLINE__:name:len
   * - Para módulo: usa nome normalizado
   */
  tokenCountOf(name: string, content?: string): number {
    if (typeof content === "string") {
      const key = `__INLINE__:${normKey(name)}:${content.length}`;
      const cached = this.tokenCountCache.get(key);
      if (cached != null) return cached;
      const n = enc.encode(content).length;
      this.tokenCountCache.set(key, n);
      if (isDebug()) log.debug("[ModuleStore.tokenCountOf] inline", { key, n });
      return n;
    }

    const key = normKey(name);
    const hit = this.tokenCountCache.get(key);
    if (hit != null) return hit;

    const cachedContent = this.cacheModulos.get(key) ?? "";
    const n = enc.encode(cachedContent).length;
    this.tokenCountCache.set(key, n);
    if (isDebug())
      log.debug("[ModuleStore.tokenCountOf] module", {
        name,
        n,
        hadContent: cachedContent.length > 0,
      });
    return n;
  }

  private findRootForPath(fullPath: string): string | null {
    for (const base of this.roots) {
      const relative = path.relative(base, fullPath);
      if (relative === "") return base;
      if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
        return base;
      }
    }
    return null;
  }

  private captureSource(key: string, root: string | null, filePath: string | null) {
    const resolvedRoot = root ? normalizeRoot(root) : null;
    const resolvedPath = filePath ? path.resolve(filePath) : null;
    const source = { root: resolvedRoot, path: resolvedPath };
    this.cacheSources.set(key, source);
    return source;
  }

  private logServed(
    name: string,
    source: { root: string | null; path: string | null } | undefined,
    cached: boolean
  ) {
    if (!source && cached) return;
    if (!source?.root && !source?.path) return;
    const payload: Record<string, unknown> = { name };
    if (source?.root) payload.root = source.root;
    if (source?.path) payload.path = source.path;
    if (cached) payload.cached = true;
    log.info("[ModuleStore.read] served", payload);
  }
}

/** Export default + bootstrap helpers */
export default ModuleStore;

/**
 * Sugerido no start do servidor (ex.: server.ts):
 *   import ModuleStore from "services/promptContext/ModuleStore";
 *   await ModuleStore.bootstrap();
 *
 * Ou defina ECO_PROMPT_ROOTS no Render:
 *   ECO_PROMPT_ROOTS=/opt/render/project/src/dist/assets
 */
