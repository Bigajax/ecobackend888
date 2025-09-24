// server/services/promptContext/index.ts

export { Budgeter } from "./Budgeter";
export { ModuleStore } from "./ModuleStore";
export * from "./Selector";
export * from "./Signals";

import montarContextoEco, { ContextBuilder } from "./ContextBuilder";
import { log, isDebug } from "./logger";

export { ContextBuilder };

/**
 * Constrói o contexto e retorna também metadados básicos (placeholder).
 * Hoje só retornamos { prompt } porque o builder não calcula 'meta'.
 * Se no futuro quiser meta (nível, tokens, módulos), adicionar cálculo aqui.
 */
export async function buildContextWithMeta(input: any): Promise<{ prompt: string }> {
  if (isDebug()) {
    log.debug("[montarContextoEco] iniciando build", {
      hasPerfil: !!input?.perfil,
      mems: input?.mems?.length ?? 0,
      heuristicas: input?.heuristicas?.length ?? 0,
      aberturaHibrida: !!input?.aberturaHibrida,
    });
  }

  // ContextBuilder é um objeto com método build (não é classe).
  const prompt = await ContextBuilder.build(input);

  if (isDebug()) {
    log.debug("[montarContextoEco] concluído", {
      // meta futura pode ser calculada aqui
      promptLen: typeof prompt === "string" ? prompt.length : -1,
    });
  }

  return { prompt };
}

/** Compat: função direta que retorna apenas o prompt (string) */
export async function montarContextoEcoCompat(input: any): Promise<string> {
  const { prompt } = await buildContextWithMeta(input);
  return prompt;
}

// Export default compatível com import padrão em outros pontos do projeto
export default montarContextoEco;
