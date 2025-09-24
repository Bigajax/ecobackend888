// server/services/promptContext/ModuleStore.ts
/// <reference types="node" />

import * as path from "path";
import * as fs from "fs/promises";

/**
 * Encoder resiliente:
 * - Tenta usar @dqbd/tiktoken (cl100k_base)
 * - Se falhar (tipagem/ambiente), cai para um contador de bytes (TextEncoder)
 */
type Encoder = { encode: (s: string) => number[] };

function makeEncoder(): Encoder {
  try {
    // usar require aqui evita alguns problemas de ESM/typings em builds CJS
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { get_encoding } = require("@dqbd/tiktoken");
    return get_encoding("cl100k_base");
  } catch {
    const te = new TextEncoder();
    return {
      encode: (s: string) => Array.from(te.encode(s)), // conta por bytes como aproximação
    };
  }
}

const enc = makeEncoder();

export class ModuleStore {
  private static _i: ModuleStore;
  static get I() { return (this._i ??= new ModuleStore()); }

  private roots: string[] = [];
  private fileIndexBuilt = false;
  private fileIndex = new Map<string, string>();
  private cacheModulos = new Map<string, string>();
  private tokenCountCache = new Map<string, number>();

  /** Define as pastas onde os módulos vivem e limpa caches/índices. */
  configure(roots: string[]) {
    this.roots = (roots || []).filter(Boolean);
    this.fileIndexBuilt = false;
    this.fileIndex.clear();
    this.cacheModulos.clear();
    this.tokenCountCache.clear();
  }

  private async buildFileIndexOnce() {
    if (this.fileIndexBuilt) return;
    for (const base of this.roots) {
      try {
        const entries = await fs.readdir(base);
        for (const name of entries) {
          // primeiro root na lista vence em caso de nome duplicado
          if (!this.fileIndex.has(name)) {
            this.fileIndex.set(name, path.join(base, name));
          }
        }
      } catch {
        // diretório ausente → ignora
      }
    }
    this.fileIndexBuilt = true;
  }

  /** Lê um módulo por nome (ex.: "PRINCIPIOS_CHAVE.txt"). */
  async read(name: string): Promise<string | null> {
    if (!name?.trim()) return null;

    const cached = this.cacheModulos.get(name);
    if (cached != null) return cached;

    await this.buildFileIndexOnce();

    // 1) caminho já indexado
    const p = this.fileIndex.get(name);
    if (p) {
      const c = (await fs.readFile(p, "utf-8")).trim();
      this.cacheModulos.set(name, c);
      this.tokenCountCache.set(name, enc.encode(c).length); // pré-cache dos tokens
      return c;
    }

    // 2) fallback direto (arquivo recém-criado pode não estar no índice)
    for (const base of this.roots) {
      try {
        const c = (await fs.readFile(path.join(base, name), "utf-8")).trim();
        this.cacheModulos.set(name, c);
        this.tokenCountCache.set(name, enc.encode(c).length);
        return c;
      } catch {
        // tenta próximo root
      }
    }

    return null;
  }

  /**
   * Conta tokens de um módulo (por nome) ou de um conteúdo inline.
   * Para conteúdo inline (ex.: separador), a chave de cache é distinta.
   */
  tokenCountOf(name: string, content?: string): number {
    if (typeof content === "string") {
      const key = `__INLINE__:${name}:${content.length}`;
      const cached = this.tokenCountCache.get(key);
      if (cached != null) return cached;
      const n = enc.encode(content).length;
      this.tokenCountCache.set(key, n);
      return n;
    }

    const hit = this.tokenCountCache.get(name);
    if (hit != null) return hit;

    const cachedContent = this.cacheModulos.get(name) ?? "";
    const n = enc.encode(cachedContent).length;
    this.tokenCountCache.set(name, n);
    return n;
  }
}

export default ModuleStore;
