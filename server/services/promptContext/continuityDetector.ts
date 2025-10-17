export type ContinuityRef = {
  id: string;
  emocao_principal?: string;
  dias_desde?: number;
  similarity: number;
};

export async function detectarContinuidade(
  userId: string,
  inputText: string,
  deps: {
    buscarMemoriasSemelhantesV2: (userId: string, q: string) => Promise<Array<any>>;
    threshold?: number;
    janelaDias?: number;
  }
): Promise<{ hasContinuity: boolean; memoryRef?: ContinuityRef }>
{
  const { buscarMemoriasSemelhantesV2, threshold = 0.75, janelaDias = 30 } = deps;
  const mems = await buscarMemoriasSemelhantesV2(userId, inputText);
  if (!mems?.length) return { hasContinuity: false };

  const top = mems[0];
  const okScore = typeof top.similarity === "number" && top.similarity >= threshold;
  const okTempo =
    typeof top.dias_desde === "number"
      ? top.dias_desde <= janelaDias
      : true;

  if (okScore && okTempo) {
    return {
      hasContinuity: true,
      memoryRef: {
        id: String(top.id),
        emocao_principal: top.emocao_principal ?? undefined,
        dias_desde: top.dias_desde ?? undefined,
        similarity: top.similarity,
      },
    };
  }
  return { hasContinuity: false };
}
