// server/services/promptContext/index.ts

export { Budgeter } from "./Budgeter";
export { ModuleStore } from "./ModuleStore";
export { ContextBuilder } from "./ContextBuilder";

export * from "./Selector";
export * from "./Signals";

// ------- Tipos derivados (sem Awaited) -------
type CtxBuilder = InstanceType<typeof ContextBuilder>;
type UnwrapPromise<T> = T extends Promise<infer R> ? R : T;

export type BuildInput  = Parameters<CtxBuilder["build"]>[0];
export type BuildOutput = UnwrapPromise<ReturnType<CtxBuilder["build"]>>;

/**
 * Função pública usada pelo Orchestrator e pelo preview.
 * Retorna prompt + meta detalhada.
 */
export async function buildContextWithMeta(input: BuildInput): Promise<BuildOutput> {
  const b = new ContextBuilder();
  return b.build(input); // { prompt, meta }
}

/** Compat: retorna apenas o prompt. */
export async function montarContextoEco(input: BuildInput): Promise<string> {
  const out = await buildContextWithMeta(input);
  return out.prompt;
}
