import { loadEcoIdentityModules, type IdentityModule } from "../identityModules";
import { ID_ECO_FULL } from "../promptIdentity";

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

  // ID_ECO_FULL já inclui ECO_VOICE (LINGUAGEM E TOM) e MEMORY_PROTOCOL (MEMÓRIA E
  // CONTINUIDADE). Incluir STYLE_HINTS_FULL e MEMORY_POLICY_EXPLICIT duplicava ~2k tokens
  // verbatim no prompt. Mantemos apenas a versão completa única.
  const staticSections = [ID_ECO_FULL.trim()].filter((section) => section.length > 0);

  return { identityModules, identitySections, staticSections };
}
