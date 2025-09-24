export { Budgeter } from "./Budgeter";
export { ModuleStore } from "./ModuleStore";
export * from "./Selector";
export * from "./Signals";

import { ContextBuilder } from "./ContextBuilder";
export { ContextBuilder }; // também exportado para uso externo

export type CtxBuilder = InstanceType<typeof ContextBuilder>;

/** Monta prompt+meta para a EcO (usado pelo Orchestrator e pelo preview). */
export async function buildContextWithMeta(input: any) {
  const b = new ContextBuilder();
  return b.build(input); // { prompt, meta }
}

/** Compat: retorna apenas o prompt. */
export async function montarContextoEco(input: any): Promise<string> {
  const out = await buildContextWithMeta(input);
  return out.prompt;
}
