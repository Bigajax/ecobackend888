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
  const feedbackRows: any[] = [];

  const ecoModuleSelect = {
    eq: () => ecoModuleOrder,
  };
  const ecoModuleOrder = {
    order: () => ecoModuleLimit,
  };
  const ecoModuleLimit = {
    limit: () => ecoModuleMaybeSingle,
  };
  const ecoModuleMaybeSingle = {
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };

  return {
    feedbackRows,
    passiveSignals,
    client: {
      from: (table: string) => {
        switch (table) {
          case "eco_module_usages":
            return {
              select: () => ecoModuleSelect,
            };
          case "eco_feedback":
            return {
              insert: async (payload: any[]) => {
                feedbackRows.push(...payload);
                return { error: null };
              },
            };
          case "bandit_rewards":
            return {
              upsert: () => ({
                select: async () => ({
                  data: [{ response_id: "interaction-123", arm: "baseline" }],
                  error: null,
                }),
              }),
            };
          case "eco_passive_signals":
            return {
              insert: async (payload: any[]) => {
                passiveSignals.push(...payload);
                return { error: null };
              },
            };
          default:
            return {
              insert: async () => ({ error: null }),
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
const sessionId = "session-feedback-1";

describe("/api/feedback contract", () => {
  beforeEach(() => {
    analyticsStub = createAnalyticsStub();
  });

  it("accepts positive feedback with 204", async () => {
    const app = await createApp();
    const agent = request(app);

    const payload = {
      interaction_id: "interaction-123",
      vote: "up",
      reason: "insightful",
      source: "chat",
    };

    const response = await agent
      .post("/api/feedback")
      .set("X-Eco-Guest-Id", guestId)
      .set("X-Eco-Session-Id", sessionId)
      .send(payload);

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(analyticsStub.feedbackRows).toHaveLength(1);
    expect(analyticsStub.feedbackRows[0]).toMatchObject({
      interaction_id: "interaction-123",
      vote: "up",
      source: "api",
    });
  });

  it("rejects missing interaction id", async () => {
    const app = await createApp();
    const agent = request(app);

    const response = await agent
      .post("/api/feedback")
      .set("X-Eco-Guest-Id", guestId)
      .set("X-Eco-Session-Id", sessionId)
      .send({ vote: "up", reason: "insightful", source: "chat" });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).not.toBe(204);
    expect(response.body).toMatchObject({ message: expect.any(String), status: expect.any(Number) });
  });
});
