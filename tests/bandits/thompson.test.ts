import { initBandits, pickArm, updateArm } from "../../src/bandits/thompson";

describe("thompson sampling bandits", () => {
  it("produces different pick sequences for different seeds", () => {
    const stateSeedA = initBandits(42);
    const picksA = Array.from({ length: 5 }, () => pickArm("Linguagem", stateSeedA));

    const stateSeedB = initBandits(7);
    const picksB = Array.from({ length: 5 }, () => pickArm("Linguagem", stateSeedB));

    expect(picksA).not.toEqual(picksB);
  });

  it("updates alpha and beta depending on reward sign", () => {
    const state = initBandits(99);
    const stats = state.Linguagem.full;

    updateArm("Linguagem", "full", 0.4, state);
    expect(stats.alpha).toBeGreaterThan(1);
    expect(stats.beta).toBeCloseTo(1, 5);

    updateArm("Linguagem", "full", -0.3, state);
    expect(stats.beta).toBeGreaterThan(1);
    expect(stats.pulls).toBe(2);
  });
});
