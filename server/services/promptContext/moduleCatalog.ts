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
    const uniqueNames = Array.from(new Set(names));
    const candidates = await Promise.all(
      uniqueNames.map(async (name) => {
        const text = await this.require(name);
        const tokens = ModuleStore.tokenCountOf(name, text);
        return { name, text, tokens } as ModuleCandidate;
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
