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
    auth: {
      getUser: jest.fn(async (_token: string) => ({
        data: { user: { id: usuarioId } },
        error: null,
      })),
    },
  };
}

async function createApp() {
  const { createTestApp } = await import("./utils/app");
  return createTestApp();
}

const guestId = "5f9b4c1d-1234-4abc-9def-1234567890ab";
const sessionId = "session-memoria-1";
const usuarioId = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

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
      .query({ usuario_id: usuarioId, texto: "hello world", k: 5, threshold: 0.25 });

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
      "buscar_memorias_semelhantes_v2",
      expect.objectContaining({
        query_embedding: expect.any(Array),
        user_id_input: usuarioId,
        match_count: expect.any(Number),
        match_threshold: expect.any(Number),
        days_back: expect.any(Number),
      })
    );
  });

  it("returns similares_v2 results via alias", async () => {
    const app = await createApp();
    const agent = request(app);

    const response = await agent
      .get("/api/similares_v2")
      .set("X-Eco-Guest-Id", guestId)
      .set("X-Eco-Session-Id", sessionId)
      .query({
        usuario_id: usuarioId,
        texto: "hello world",
        k: 5,
        threshold: 0.25,
      });

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
      "buscar_memorias_semelhantes_v2",
      expect.objectContaining({
        query_embedding: expect.any(Array),
        user_id_input: usuarioId,
        match_count: expect.any(Number),
        match_threshold: expect.any(Number),
        days_back: expect.any(Number),
      })
    );
  });

  it("supports POST alias for similares_v2", async () => {
    const app = await createApp();
    const agent = request(app);

    const response = await agent
      .post("/api/similares_v2")
      .set("X-Eco-Guest-Id", guestId)
      .set("X-Eco-Session-Id", sessionId)
      .set("Authorization", "Bearer valid-token")
      .send({ texto: "hello world", limite: 3, threshold: 0.25 });

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
    expect(supabaseStub.rpc).toHaveBeenCalled();
    expect(supabaseStub.auth.getUser).toHaveBeenCalledWith("valid-token");
  });

  it("requires texto e usuario_id", async () => {
    const app = await createApp();
    const agent = request(app);

    const response = await agent
      .get("/api/memorias/similares_v2")
      .set("X-Eco-Guest-Id", guestId)
      .set("X-Eco-Session-Id", sessionId)
      .query({ usuario_id: usuarioId });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: "usuario_id e texto são obrigatórios",
    });
  });
});
