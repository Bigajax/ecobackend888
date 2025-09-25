/// <reference types="node" />

import * as path from "path";
import { promises as fs, Dirent } from "fs";
import { log, isDebug } from "./logger";

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

export class ModuleStore {
  private static _i: ModuleStore;
  static get I() { return (this._i ??= new ModuleStore()); }

  private roots: string[] = [];
  private fileIndexBuilt = false;
  private fileIndex = new Map<string, string>(); // key(norm) -> fullPath
  private cacheModulos = new Map<string, string>(); // key(norm) -> content
  private tokenCountCache = new Map<string, number>(); // key -> tokens
  private buildLock: Promise<void> | null = null;

  /** --------------------- Configuração & util --------------------- */

  /** Define pastas e limpa caches/índices. */
  configure(roots: string[]) {
    this.roots = (roots || []).filter(Boolean);
    this.fileIndexBuilt = false;
    this.fileIndex.clear();
    this.cacheModulos.clear();
    this.tokenCountCache.clear();
    if (isDebug()) log.debug("[ModuleStore.configure]", { roots: this.roots });
  }

  /** Estatísticas rápidas (para debug endpoints). */
  stats() {
    return {
      roots: [...this.roots],
      indexedCount: this.fileIndex.size,
      cachedCount: this.cacheModulos.size,
      built: this.fileIndexBuilt,
    };
  }

  /** Lista até N nomes indexados (sem caminhos), útil para debug. */
  listIndexed(limit = 50) {
    return Array.from(this.fileIndex.keys()).slice(0, limit);
  }

  /** Invalida caches (tudo ou só um módulo). */
  invalidate(name?: string) {
    if (!name) {
      this.cacheModulos.clear();
      this.tokenCountCache.clear();
      return;
    }
    const k = normKey(name);
    this.cacheModulos.delete(k);
    this.tokenCountCache.delete(k);
    // inline caches usam chaves __INLINE__: não dá para invalidar seletivo sem parâmetro extra
  }

  /** Registra um módulo “inline” (fallback em memória) com esse nome. */
  registerInline(name: string, content: string) {
    const k = normKey(name);
    const c = (content ?? "").trim();
    this.cacheModulos.set(k, c);
    this.tokenCountCache.set(k, enc.encode(c).length);
    // NÃO grava no fileIndex; é somente cache em memória.
    if (isDebug()) log.debug("[ModuleStore.registerInline] registrado", { name, tokens: this.tokenCountCache.get(k) });
  }

  // ------- Wrappers estáticos (compat) -------
  static async buildFileIndexOnce(): Promise<void> { return this.I.buildFileIndexOnce(); }
  static configure(roots: string[]) { this.I.configure(roots); }
  static async read(name: string): Promise<string | null> { return this.I.read(name); }
  static tokenCountOf(name: string, content?: string): number { return this.I.tokenCountOf(name, content); }
  static stats() { return this.I.stats(); }
  static listIndexed(limit?: number) { return this.I.listIndexed(limit); }
  static invalidate(name?: string) { return this.I.invalidate(name); }
  static registerInline(name: string, content: string) { return this.I.registerInline(name, content); }
  // -------------------------------------------

  /** -------------------- Indexação de arquivos ------------------- */

  /** Varre diretórios recursivamente e retorna arquivos suportados. */
  private async walkDir(base: string): Promise<Array<{ name: string; full: string }>> {
    const out: Array<{ name: string; full: string }> = [];
    try {
      const entries: Dirent[] = await fs.readdir(base, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(base, ent.name);
        if (ent.isDirectory()) {
          const nested = await this.walkDir(full);
          out.push(...nested);
        } else {
          const ext = path.extname(ent.name).toLowerCase();
          if (ALLOWED_EXT.has(ext)) {
            out.push({ name: ent.name, full });
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

    // lock para evitar corrida em ambientes com boot concorrente
    if (!this.buildLock) {
      this.buildLock = (async () => {
        let totalIndexed = 0;
        for (const base of this.roots) {
          const files = await this.walkDir(base);
          for (const f of files) {
            const key = normKey(f.name);
            // primeiro root na lista vence em duplicado
            if (!this.fileIndex.has(key)) {
              this.fileIndex.set(key, f.full);
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
      if (isDebug())
        log.debug("[ModuleStore.read] cache hit", { name, tokens: this.tokenCountCache.get(key) ?? -1 });
      return cached;
    }

    await this.buildFileIndexOnce();

    // 1) caminho pelo índice
    const p = this.fileIndex.get(key);
    if (p) {
      try {
        const c = (await fs.readFile(p, "utf-8")).trim();
        this.cacheModulos.set(key, c);
        this.tokenCountCache.set(key, enc.encode(c).length);
        if (isDebug())
          log.debug("[ModuleStore.read] index path", { name, path: p, tokens: this.tokenCountCache.get(key) });
        return c;
      } catch (err) {
        if (isDebug())
          log.debug("[ModuleStore.read] read fail (indexed path)", { name, path: p, err: String(err) });
      }
    }

    // 2) fallback direto (arquivo recém-criado pode não estar no índice)
    for (const base of this.roots) {
      try {
        const full = path.join(base, name);
        const c = (await fs.readFile(full, "utf-8")).trim();
        this.cacheModulos.set(key, c);
        this.tokenCountCache.set(key, enc.encode(c).length);
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
}

export default ModuleStore;
