import { loadEcoIdentityModules, type IdentityModule } from "../identityModules";
import {
  ID_ECO_FULL,
  STYLE_HINTS_FULL,
  MEMORY_POLICY_EXPLICIT,
} from "../promptIdentity";

export interface IdentityInjectionResult {
  identityModules: IdentityModule[];
  identitySections: string[];
  staticSections: string[];
}

export function formatIdentityModuleSection(module: IdentityModule): string {
  const body = module.text.trim();
  if (!body) return "";
  const header = `// ${module.name}`;
  return `${header}\n${body}`.trim();
}

export async function loadIdentitySections(): Promise<IdentityInjectionResult> {
  const identityModules = await loadEcoIdentityModules();
  const identitySections = identityModules
    .map((module) => formatIdentityModuleSection(module))
    .filter((section) => section.length > 0);

  const staticSections = [ID_ECO_FULL.trim(), STYLE_HINTS_FULL.trim(), MEMORY_POLICY_EXPLICIT.trim()].filter(
    (section) => section.length > 0
  );

  return { identityModules, identitySections, staticSections };
}
