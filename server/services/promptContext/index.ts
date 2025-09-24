// server/services/promptContext/index.ts
export { Budgeter } from "./Budgeter";
export { ModuleStore } from "./ModuleStore";
export * from "./Selector";
export * from "./Signals";

import { ContextBuilder } from "./ContextBuilder";
import { log, isDebug } from "./logger";

export { ContextBuilder };
export type CtxBuilder = InstanceType<typeof ContextBuilder>;

export async function buildContextWithMeta(input: any) {
  if (isDebug()) {
    log.debug("[montarContextoEco] iniciando build", {
      hasPerfil: !!input?.perfil,
      mems: (input?.mems?.length ?? 0),
      heuristicas: (input?.heuristicas?.length ?? 0),
      aberturaHibrida: !!input?.aberturaHibrida,
    });
  }
  const b = new ContextBuilder();
  const out = await b.build(input);
  if (isDebug()) {
    log.debug("[montarContextoEco] concluído", {
      nivel: out?.meta?.nivel,
      tokens: out?.meta?.tokens,
      usados: out?.meta?.modulos?.incluidos,
      cortados: out?.meta?.modulos?.cortados,
    });
  }
  return out;
}

export async function montarContextoEco(input: any): Promise<string> {
  const out = await buildContextWithMeta(input);
  return out.prompt;
}
