export { Budgeter } from "./Budgeter";
export { ModuleStore } from "./ModuleStore";
export * from "./Selector";
export * from "./Signals";

import { ContextBuilder } from "./ContextBuilder";

// função pública usada pelo Orchestrator e pelo preview
export async function buildContextWithMeta(input: any) {
  const b = new ContextBuilder();
  return b.build(input); // { prompt, meta }
}

// compat: montarContextoEco retorna só o prompt
export async function montarContextoEco(input: any): Promise<string> {
  const out = await buildContextWithMeta(input);
  return out.prompt;
}
