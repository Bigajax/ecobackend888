import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

let supabaseStub: ReturnType<typeof createSupabaseStub>;
const prepareQueryEmbeddingMock = jest.fn(async (_input?: unknown) => [1, 0, 0]);

jest.mock("../../lib/supabaseAdmin", () => {
  return {
    __esModule: true,
    getSupabaseAdmin: () => supabaseStub,
    ensureSupabaseConfigured: () => supabaseStub,
    SupabaseConfigError: class extends Error {},
  };
});

jest.mock("../../services/prepareQueryEmbedding", () => ({
  __esModule: true,
  prepareQueryEmbedding: (input: unknown) => prepareQueryEmbeddingMock(input),
}));

jest.mock("../../mw/requireAdmin", () => ({
  __esModule: true,
  default: (_req: any, _res: any, next: any) => next(),
}));

function createSupabaseStub() {
  return {
    rpc: jest.fn(async (_fn: string, _args: any) => ({
      data: [
        {
          memoria_id: "mem-1",
          resumo_eco: "Contexto 1",
          tags: ["tag-1"],
          similarity_score: 0.91,
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
      error: null,
    })),
  };
}

async function createApp() {
  const { createTestApp } = await import("./utils/app");
  return createTestApp();
}

const guestId = "5f9b4c1d-1234-4abc-9def-1234567890ab";
const sessionId = "session-memoria-1";

describe("/api/memorias/similares_v2 contract", () => {
  beforeEach(() => {
    supabaseStub = createSupabaseStub();
    prepareQueryEmbeddingMock.mockClear();
  });

  it("returns similares_v2 results", async () => {
    const app = await createApp();
    const agent = request(app);

    const response = await agent
      .get("/api/memorias/similares_v2")
      .set("X-Eco-Guest-Id", guestId)
      .set("X-Eco-Session-Id", sessionId)
      .query({ usuario_id: "user-1", texto: "hello world", k: 5, threshold: 0.25 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.similares).toHaveLength(1);
    expect(response.body.similares[0]).toMatchObject({
      id: "mem-1",
      resumo_eco: "Contexto 1",
      tags: ["tag-1"],
      created_at: "2024-01-01T00:00:00Z",
      similarity: 0.91,
      distancia: 0.08999999999999997,
    });
    expect(prepareQueryEmbeddingMock).toHaveBeenCalledWith({ texto: "hello world" });
    expect(supabaseStub.rpc).toHaveBeenCalledWith(
      "buscar_memorias_semelhantes_v2_safe",
      expect.arrayContaining([
        expect.any(Array),
        "user-1",
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
      ])
    );
  });

  it("rejects legacy alias", async () => {
    const app = await createApp();
    const agent = request(app);

    const response = await agent
      .get("/api/similares_v2")
      .set("X-Eco-Guest-Id", guestId)
      .set("X-Eco-Session-Id", sessionId)
      .query({ usuario_id: "user-1", texto: "hello" });

    expect(response.status).toBe(404);
  });
});
