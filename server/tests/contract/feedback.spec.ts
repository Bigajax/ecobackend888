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
  const feedbackRows: any[] = [];
  const rewardRows: any[] = [];

  // Contrato atual do feedbackController:
  //  eco_interactions:   select().eq("id").maybeSingle()  -> lookup da interação
  //  eco_module_usages:  select().eq().order().limit().maybeSingle() -> inferência de arm
  //  eco_feedback:       insert([...])
  //  bandit_rewards:     insert([...]).select("response_id,arm")
  //  rpc("update_bandit_arm")
  let interactionRow: any = {
    id: "interaction-123",
    message_id: "message-123",
    prompt_hash: "hash-123",
    user_id: null,
    session_id: null,
  };

  return {
    feedbackRows,
    rewardRows,
    setInteraction: (row: any) => {
      interactionRow = row;
    },
    client: {
      from: (table: string) => {
        switch (table) {
          case "eco_interactions":
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: interactionRow, error: null }),
                }),
              }),
            };
          case "eco_module_usages":
            return {
              select: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
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
              insert: (payload: any[]) => ({
                select: async () => {
                  rewardRows.push(...payload);
                  return {
                    data: [{ response_id: "interaction-123", arm: "baseline" }],
                    error: null,
                  };
                },
              }),
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
      arm: "baseline",
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
