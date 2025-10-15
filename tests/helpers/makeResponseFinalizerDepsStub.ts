import type { ResponseFinalizer } from "../../server/services/conversation/responseFinalizer";

export type ResponseFinalizerDeps = NonNullable<
  ConstructorParameters<typeof ResponseFinalizer>[0]
>;

const noopAsync = async (..._args: any[]) => {};
const noopSync = (..._args: any[]) => {};

export function makeResponseFinalizerDepsStub(
  overrides: Partial<ResponseFinalizerDeps> = {}
): ResponseFinalizerDeps {
  const base: ResponseFinalizerDeps = {
    gerarBlocoTecnicoComCache: async () => null,
    saveMemoryOrReference: noopAsync,
    trackMensagemEnviada: noopSync,
    trackEcoDemorou: noopSync,
    trackBlocoTecnico: noopSync,
    trackSessaoEntrouChat: noopSync,
    identifyUsuario: noopSync,
    trackRespostaQ: noopSync,
    trackKnapsackDecision: noopSync,
    trackBanditArmUpdate: ({ distinctId, userId, pilar, arm, recompensa }) => {
      void distinctId;
      void userId;
      void pilar;
      void arm;
      void recompensa;
    },
  };

  return { ...base, ...overrides };
}
