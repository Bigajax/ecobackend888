import { solveKnapsack, type Candidato } from "../../src/orchestrator/knapsack";

describe("knapsack optimizer", () => {
  const candidatos: Candidato[] = [
    { id: "mod-a", tokens: 200, priorPeso: 0.9, vptMean: 0.7 },
    { id: "mod-b", tokens: 100, priorPeso: 1.1, vptMean: 0.5 },
    { id: "mod-c", tokens: 400, priorPeso: 0.4, vptMean: 0.8 },
  ];

  it("selects modules within the provided budget", () => {
    const result = solveKnapsack(250, candidatos);
    expect(result.adotados.map((c) => c.id)).toEqual(["mod-a"]);
    expect(result.tokensAdotados).toBeLessThanOrEqual(250);
  });

  it("orders modules by weighted value per token", () => {
    const result = solveKnapsack(600, candidatos);
    expect(result.adotados.map((c) => c.id)).toEqual(["mod-a", "mod-b"]);
    expect(result.marginalGain).toBeCloseTo(0.7 * 0.9 + 0.5 * 1.1, 4);
  });
});
