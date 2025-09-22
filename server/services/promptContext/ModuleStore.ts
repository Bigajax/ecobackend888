import path from "path";
import fs from "fs/promises";
import { get_encoding } from "@dqbd/tiktoken";

const enc = get_encoding("cl100k_base");

export class ModuleStore {
  private static _i: ModuleStore;
  static get I() { return this._i ??= new ModuleStore(); }

  private roots: string[] = [];
  private fileIndexBuilt = false;
  private fileIndex = new Map<string, string>();
  private cacheModulos = new Map<string, string>();
  private tokenCountCache = new Map<string, number>();

  configure(roots: string[]) {
    this.roots = roots;
    this.fileIndexBuilt = false;
    this.fileIndex.clear();
  }

  private async buildFileIndexOnce() {
    if (this.fileIndexBuilt) return;
    for (const base of this.roots) {
      try {
        const entries = await fs.readdir(base);
        for (const name of entries) {
          if (!this.fileIndex.has(name)) this.fileIndex.set(name, path.join(base, name));
        }
      } catch {}
    }
    this.fileIndexBuilt = true;
  }

  async read(name: string): Promise<string | null> {
    if (!name?.trim()) return null;
    if (this.cacheModulos.has(name)) return this.cacheModulos.get(name)!;
    await this.buildFileIndexOnce();
    const p = this.fileIndex.get(name);
    if (p) {
      const c = (await fs.readFile(p, "utf-8")).trim();
      this.cacheModulos.set(name, c);
      return c;
    }
    for (const base of this.roots) {
      try {
        const c = (await fs.readFile(path.join(base, name), "utf-8")).trim();
        this.cacheModulos.set(name, c);
        return c;
      } catch {}
    }
    return null;
  }

  tokenCountOf(name: string, content?: string): number {
    if (this.tokenCountCache.has(name)) return this.tokenCountCache.get(name)!;
    const n = enc.encode(content ?? this.cacheModulos.get(name) ?? "").length;
    this.tokenCountCache.set(name, n);
    return n;
  }
}
