export { Budgeter } from "./Budgeter";
export { ModuleStore } from "./ModuleStore";
export * from "./Selector";
export * from "./Signals";

import montarContextoEco, { ContextBuilder } from "./ContextBuilder";
import { log, isDebug } from "./logger";

export { ContextBuilder };

// ✅ expõe bootstrap/configureModuleStore do arquivo novo
export { bootstrap, configureModuleStore } from "../../bootstrap/modules";

/**
 * Constrói o contexto e retorna também metadados básicos (placeholder).
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

  const contexto = await ContextBuilder.build(input);
  const textoAtual = typeof input?.texto === "string" ? input.texto : "";
  const prompt = contexto.montarMensagemAtual(textoAtual);

  if (isDebug()) {
    log.debug("[montarContextoEco] concluído", {
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

export default montarContextoEco;
