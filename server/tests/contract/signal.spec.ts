import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

type AnalyticsStub = ReturnType<typeof createAnalyticsStub>;

let analyticsStub: AnalyticsStub;

jest.mock("../../services/supabaseClient", () => ({
  __esModule: true,
  getAnalyticsClient: () => analyticsStub.client,
  analyticsClientMode: "enabled",
  supabase: null,
}));

function createAnalyticsStub() {
  const passiveSignals: any[] = [];
  let insertError: any = null;
  let selectError: any = null;
  const interactions = new Set<string>();

  return {
    passiveSignals,
    setInsertError(error: any) {
      insertError = error;
    },
    setSelectError(error: any) {
      selectError = error;
    },
    ensureInteraction(id: string) {
      interactions.add(id);
    },
    client: {
      from: (table: string) => {
        switch (table) {
          case "eco_passive_signals":
            return {
              insert: async (payload: any[]) => {
                if (insertError) {
                  return { error: insertError };
                }
                passiveSignals.push(...payload);
                return { error: null };
              },
            };
          case "eco_interactions": {
            let queriedId: string | null = null;
            const query = {
              select: () => query,
              eq: (_column: string, value: string) => {
                queriedId = value;
                return query;
              },
              maybeSingle: async () => {
                if (selectError) {
                  return { data: null, error: selectError };
                }

                if (queriedId && interactions.has(queriedId)) {
                  return { data: { id: queriedId }, error: null };
                }

                return { data: null, error: null };
              },
            };
            return query;
          }
          default:
            return {
              insert: async () => ({ error: null }),
              select: async () => ({ data: [], error: null }),
            };
        }
      },
      rpc: async () => ({ error: null }),
    },
  };
}

async function createApp() {
  const { createTestApp } = await import("./utils/app");
  return createTestApp();
}

const guestId = "5f9b4c1d-1234-4abc-9def-1234567890ab";
const sessionId = "session-signal-1";

describe("/api/signal contract", () => {
  beforeEach(() => {
    analyticsStub = createAnalyticsStub();
  });

  it("persists signals with defaults and returns 204", async () => {
    const app = await createApp();
    const agent = request(app);

    const payload = {
      type: "engagement",
      name: "view",
      interaction_id: "123e4567-e89b-42d3-a456-426614174000",
      meta: { percent: 100 },
    };

    analyticsStub.ensureInteraction(payload.interaction_id);

    const response = await agent
      .post("/api/signal")
      .set("X-Eco-Guest-Id", guestId)
      .set("X-Eco-Session-Id", sessionId)
      .send(payload);

    expect(response.status).toBe(204);
    expect(analyticsStub.passiveSignals).toHaveLength(1);
    const [inserted] = analyticsStub.passiveSignals;
    expect(inserted.interaction_id).toBe(payload.interaction_id);
    expect(inserted.signal).toBe("view");
    expect(inserted.meta).toMatchObject({
      type: "engagement",
      percent: 100,
      guest_id_header: guestId,
      session_id_header: sessionId,
    });
    expect(typeof inserted.meta.ts).toBe("string");
  });

  it("rejects requests without interaction id", async () => {
    const app = await createApp();
    const agent = request(app);

    const response = await agent.post("/api/signal").send({ name: "view" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "missing_interaction_id" });
    expect(analyticsStub.passiveSignals).toHaveLength(0);
  });

  it("returns 404 when the interaction is unknown", async () => {
    const app = await createApp();
    const agent = request(app);

    const response = await agent.post("/api/signal").send({
      name: "view",
      interaction_id: "123e4567-e89b-42d3-a456-426614174000",
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "interaction_not_found" });
    expect(analyticsStub.passiveSignals).toHaveLength(0);
  });

  it("logs and returns 500 when persistence fails", async () => {
    const app = await createApp();
    const agent = request(app);

    const error = { message: "boom", code: "500" };
    analyticsStub.setInsertError(error);
    const interactionId = "123e4567-e89b-42d3-a456-426614174000";
    analyticsStub.ensureInteraction(interactionId);

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await agent.post("/api/signal").send({
      name: "view",
      interaction_id: interactionId,
    });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "signal_persist_failed" });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
