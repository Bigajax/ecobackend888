// server/services/promptContext/ModuleStore.ts
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

  /**
   * Define as pastas onde os módulos vivem.
   * Limpa índices e caches (evita conteúdo/tokenCount obsoletos).
   */
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
          // 1º diretório na ordem vence em caso de nomes duplicados
          if (!this.fileIndex.has(name)) {
            this.fileIndex.set(name, path.join(base, name));
          }
        }
      } catch {
        // ignora diretórios ausentes
      }
    }
    this.fileIndexBuilt = true;
  }

  /**
   * Lê um módulo por nome (ex.: "PRINCIPIOS_CHAVE.txt").
   * Retorna null se não encontrado em nenhum root.
   */
  async read(name: string): Promise<string | null> {
    if (!name?.trim()) return null;

    if (this.cacheModulos.has(name)) {
      return this.cacheModulos.get(name)!;
    }

    await this.buildFileIndexOnce();

    // 1) caminho indexado
    const p = this.fileIndex.get(name);
    if (p) {
      const c = (await fs.readFile(p, "utf-8")).trim();
      this.cacheModulos.set(name, c);
      this.tokenCountCache.set(name, enc.encode(c).length); // pré-cache tokens
      return c;
    }

    // 2) fallback direto (caso arquivo novo não esteja no índice)
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
   * Conta tokens de um módulo por nome (usa cache), ou de um conteúdo inline.
   * Quando `content` é fornecido (ex.: separador do Budgeter), a contagem é
   * feita sobre o texto recebido e cacheada com uma chave interna separada.
   */
  tokenCountOf(name: string, content?: string): number {
    if (typeof content === "string") {
      // chave separada para conteúdo inline (não conflita com nome de módulo)
      const key = `__INLINE__:${name}:${content.length}`;
      const cached = this.tokenCountCache.get(key);
      if (cached != null) return cached;
      const n = enc.encode(content).length;
      this.tokenCountCache.set(key, n);
      return n;
    }

    if (this.tokenCountCache.has(name)) {
      return this.tokenCountCache.get(name)!;
    }

    const cachedContent = this.cacheModulos.get(name) ?? "";
    const n = enc.encode(cachedContent).length;
    this.tokenCountCache.set(name, n);
    return n;
  }
}

export default ModuleStore;
