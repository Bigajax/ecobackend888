import * as path from "path";
import { promises as fs } from "fs";

import { z } from "zod";

import { qualityAnalyticsStore } from "../analytics/analyticsStore";
import { isDebug, log } from "./logger";

const KNOWN_TOP_FIELDS = new Set(["version", "defaults", "families", "modules"]);

const gateSchema = z
  .object({
    signal: z.string().min(1).optional(),
    min_open: z.number().int().nonnegative().optional(),
    min: z.number().min(0).max(1).optional(),
  })
  .partial();

const moduleSchema = z
  .object({
    id: z.string().min(1),
    family: z.string().min(1),
    role: z.enum(["instruction", "context", "toolhint"]),
    size: z.enum(["S", "M", "L"]),
    tokens_avg: z.number().nonnegative(),
    gate: gateSchema.optional(),
    excludes: z.array(z.string()).optional(),
    depends_on: z.array(z.string()).optional(),
    reward_key: z.string().optional(),
    path_hint: z.string().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

const familySchema = z
  .object({
    reward_key: z.string().min(1),
    baseline: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

const defaultsSchema = z
  .object({
    window_days: z.number().int().positive().optional(),
    alpha_prior: z.number().positive().optional(),
    beta_prior: z.number().positive().optional(),
    max_aux_tokens: z.number().int().positive().optional(),
    cold_start_boost: z.number().nonnegative().max(1).optional(),
  })
  .partial();

const manifestSchema = z
  .object({
    version: z.string().min(1),
    defaults: defaultsSchema.optional(),
    families: z.record(familySchema).optional(),
    modules: z.array(moduleSchema).optional(),
  })
  .strict();

export type ManifestGate = z.infer<typeof gateSchema>;
export type ManifestModule = z.infer<typeof moduleSchema> & {
  normalizedId: string;
};
export type ManifestFamily = z.infer<typeof familySchema> & {
  id: string;
};

export interface ManifestDefaults {
  windowDays: number;
  alphaPrior: number;
  betaPrior: number;
  maxAuxTokens: number;
  coldStartBoost: number;
}

interface ManifestSnapshot {
  path: string;
  version: string;
  defaults: ManifestDefaults;
  families: Map<string, ManifestFamily>;
  modulesById: Map<string, ManifestModule>;
  modulesByFamily: Map<string, ManifestModule[]>;
}

function normalizeId(id: string): string {
  return id.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

async function fileExists(candidate: string): Promise<boolean> {
  try {
    const stat = await fs.stat(candidate);
    return stat.isFile();
  } catch {
    return false;
  }
}

function warnUnknownFields(
  scope: string,
  raw: Record<string, unknown>,
  allowed: Set<string>
): void {
  const extras = Object.keys(raw).filter((key) => !allowed.has(key));
  if (extras.length === 0) return;
  log.warn("[ModuleManifest] unknown_fields", { scope, extras });
}

const FALLBACK_DEFAULTS: ManifestDefaults = {
  windowDays: 14,
  alphaPrior: 1.5,
  betaPrior: 1.5,
  maxAuxTokens: 350,
  coldStartBoost: 0.35,
};

class ModuleManifestRegistry {
  private snapshot: ManifestSnapshot | null = null;
  private loading: Promise<void> | null = null;

  async ensureLoaded(): Promise<void> {
    if (this.snapshot) return;
    if (this.loading) return this.loading;
    this.loading = this.load();
    await this.loading;
  }

  private async load(): Promise<void> {
    const candidates = this.resolveCandidates();
    let manifestPath: string | null = null;

    for (const candidate of candidates) {
      if (!candidate) continue;
      // eslint-disable-next-line no-await-in-loop
      if (await fileExists(candidate)) {
        manifestPath = candidate;
        break;
      }
    }

    if (!manifestPath) {
      if (isDebug()) {
        log.debug("[ModuleManifest] manifest not found, continuing without it", {
          candidates,
        });
      }
      qualityAnalyticsStore.configureBandit({
        windowDays: FALLBACK_DEFAULTS.windowDays,
        alphaPrior: FALLBACK_DEFAULTS.alphaPrior,
        betaPrior: FALLBACK_DEFAULTS.betaPrior,
        coldStartBoost: FALLBACK_DEFAULTS.coldStartBoost,
      });
      this.snapshot = null;
      this.loading = null;
      return;
    }

    const rawContent = await fs.readFile(manifestPath, "utf-8");
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawContent);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("[ModuleManifest] parse_failed", { path: manifestPath, message });
      this.snapshot = null;
      this.loading = null;
      return;
    }

    const manifestResult = manifestSchema.safeParse(parsedJson);
    if (!manifestResult.success) {
      log.error("[ModuleManifest] validation_failed", {
        path: manifestPath,
        issues: manifestResult.error.issues,
      });
      this.snapshot = null;
      this.loading = null;
      return;
    }

    const manifest = manifestResult.data;
    warnUnknownFields("manifest", manifest as Record<string, unknown>, KNOWN_TOP_FIELDS);

    const defaultsRaw = manifest.defaults ?? {};
    const defaults: ManifestDefaults = {
      windowDays: defaultsRaw.window_days ?? FALLBACK_DEFAULTS.windowDays,
      alphaPrior: defaultsRaw.alpha_prior ?? FALLBACK_DEFAULTS.alphaPrior,
      betaPrior: defaultsRaw.beta_prior ?? FALLBACK_DEFAULTS.betaPrior,
      maxAuxTokens: defaultsRaw.max_aux_tokens ?? FALLBACK_DEFAULTS.maxAuxTokens,
      coldStartBoost: defaultsRaw.cold_start_boost ?? FALLBACK_DEFAULTS.coldStartBoost,
    };

    const families = new Map<string, ManifestFamily>();
    if (manifest.families) {
      for (const [id, family] of Object.entries(manifest.families)) {
        warnUnknownFields(`families.${id}`, family as Record<string, unknown>, new Set(["reward_key", "baseline", "enabled"]));
        families.set(id, { ...family, id });
      }
    }

    const modulesById = new Map<string, ManifestModule>();
    const modulesByFamily = new Map<string, ManifestModule[]>();

    const modules = manifest.modules ?? [];
    for (const mod of modules) {
      warnUnknownFields(`modules.${mod.id}`, mod as unknown as Record<string, unknown>, new Set([
        "id",
        "family",
        "role",
        "size",
        "tokens_avg",
        "gate",
        "excludes",
        "depends_on",
        "reward_key",
        "path_hint",
        "enabled",
      ]));
      const normalizedId = normalizeId(mod.id);
      const entry: ManifestModule = { ...mod, normalizedId };
      modulesById.set(normalizedId, entry);
      const list = modulesByFamily.get(mod.family) ?? [];
      list.push(entry);
      modulesByFamily.set(mod.family, list);
    }

    this.snapshot = {
      path: manifestPath,
      version: manifest.version,
      defaults,
      families,
      modulesById,
      modulesByFamily,
    };

    qualityAnalyticsStore.configureBandit({
      windowDays: defaults.windowDays,
      alphaPrior: defaults.alphaPrior,
      betaPrior: defaults.betaPrior,
      coldStartBoost: defaults.coldStartBoost,
    });

    if (isDebug()) {
      log.debug("[ModuleManifest] loaded", {
        path: manifestPath,
        families: families.size,
        modules: modulesById.size,
      });
    }

    this.loading = null;
  }

  private resolveCandidates(): string[] {
    const override = process.env.ECO_MODULE_MANIFEST;
    const cwd = process.cwd();
    const candidates: Array<string | undefined> = [
      override,
      path.resolve(cwd, "dist/assets/modules.manifest.json"),
      path.resolve(cwd, "server/dist/assets/modules.manifest.json"),
      path.resolve(__dirname, "../assets/modules.manifest.json"),
      path.resolve(cwd, "server/assets/modules.manifest.json"),
    ];
    const normalized = candidates.filter((candidate): candidate is string => Boolean(candidate));
    return Array.from(new Set(normalized));
  }

  hasManifest(): boolean {
    return this.snapshot != null;
  }

  getDefaults(): ManifestDefaults {
    return this.snapshot?.defaults ?? FALLBACK_DEFAULTS;
  }

  getFamily(id: string): ManifestFamily | null {
    if (!this.snapshot) return null;
    return this.snapshot.families.get(id) ?? null;
  }

  getModule(id: string): ManifestModule | null {
    if (!this.snapshot) return null;
    const normalized = normalizeId(id);
    return this.snapshot.modulesById.get(normalized) ?? null;
  }

  listFamilies(): ManifestFamily[] {
    if (!this.snapshot) return [];
    return Array.from(this.snapshot.families.values());
  }

  listModulesByFamily(familyId: string): ManifestModule[] {
    if (!this.snapshot) return [];
    return this.snapshot.modulesByFamily.get(familyId) ?? [];
  }

  describe(): {
    path: string | null;
    version: string | null;
    families: Array<{
      id: string;
      rewardKey: string;
      baseline: string | null;
      enabled: boolean;
      arms: Array<{ id: string; enabled: boolean; role: string; size: string }>;
    }>;
    defaults: ManifestDefaults;
  } {
    const snapshot = this.snapshot;
    if (!snapshot) {
      return {
        path: null,
        version: null,
        families: [],
        defaults: FALLBACK_DEFAULTS,
      };
    }

    const families = Array.from(snapshot.families.values()).map((family) => {
      const arms = (snapshot.modulesByFamily.get(family.id) ?? []).map((arm) => ({
        id: arm.id,
        enabled: arm.enabled !== false,
        role: arm.role,
        size: arm.size,
      }));
      return {
        id: family.id,
        rewardKey: family.reward_key,
        baseline: family.baseline ?? null,
        enabled: family.enabled !== false,
        arms,
      };
    });

    return {
      path: snapshot.path,
      version: snapshot.version,
      families,
      defaults: snapshot.defaults,
    };
  }
}

export const moduleManifest = new ModuleManifestRegistry();

export async function ensureModuleManifest(): Promise<void> {
  await moduleManifest.ensureLoaded();
}

export function getManifestDefaults(): ManifestDefaults {
  return moduleManifest.getDefaults();
}

export function manifestHasData(): boolean {
  return moduleManifest.hasManifest();
}

export function getManifestModule(id: string): ManifestModule | null {
  return moduleManifest.getModule(id);
}

export function getManifestFamily(id: string): ManifestFamily | null {
  return moduleManifest.getFamily(id);
}

export function listManifestFamilies(): ManifestFamily[] {
  return moduleManifest.listFamilies();
}

export function listManifestModulesByFamily(familyId: string): ManifestModule[] {
  return moduleManifest.listModulesByFamily(familyId);
}

