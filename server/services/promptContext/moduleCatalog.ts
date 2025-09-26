import { ModuleStore } from "./ModuleStore";
import { isDebug, log } from "./logger";

export type ModuleCandidate = { name: string; text: string; tokens: number };

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
    const out: ModuleCandidate[] = [];
    for (const name of names) {
      const text = await this.require(name);
      const tokens = ModuleStore.tokenCountOf(name, text);
      out.push({ name, text, tokens });
    }
    return out;
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
