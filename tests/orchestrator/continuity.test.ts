import { decideContinuity } from "../../server/services/conversation/continuity";

describe("decideContinuity", () => {
  it("marks continuity for recent, similar memory", () => {
    const now = Date.parse("2024-06-01T00:00:00Z");
    const mems = [
      {
        id: "mem-1",
        created_at: "2024-05-20T00:00:00Z",
        similarity: 0.82,
        emocao_principal: "esperança",
        tags: ["ansiedade", "respiro"],
      },
    ];

    const result = decideContinuity(mems as any, { now });
    expect(result.hasContinuity).toBe(true);
    expect(result.memoryRef?.id).toBe("mem-1");
    expect(result.memoryRef?.similarity).toBeCloseTo(0.82);
    expect(result.memoryRef?.dias_desde).toBe(12);
  });

  it("returns false when similarity below threshold", () => {
    const now = Date.parse("2024-06-01T00:00:00Z");
    const mems = [
      {
        id: "mem-2",
        created_at: "2024-05-20T00:00:00Z",
        similarity: 0.5,
        emocao_principal: "tristeza",
      },
    ];

    const result = decideContinuity(mems as any, { now });
    expect(result.hasContinuity).toBe(false);
    expect(result.memoryRef).toBeNull();
  });
});
