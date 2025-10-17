import montarContextoEco from "../server/services/promptContext/ContextBuilder";

async function main() {
  const continuityRef = {
    id: "m1",
    emocao_principal: "ansiedade",
    dias_desde: 5,
    similarity: 0.82,
  };

  const ctx = await montarContextoEco({
    userId: "demo-user",
    texto: "Sinto a mesma ansiedade de quando comecei.",
    contextFlags: { HAS_CONTINUITY: true },
    contextMeta: { continuityRef },
  });

  console.log("HAS_CONTINUITY:", true);
  console.log("continuityRef:", continuityRef);
  console.log("basePreview:", ctx.base.slice(0, 400));
}

main().catch((error) => {
  console.error("testContinuity failed", error);
});
