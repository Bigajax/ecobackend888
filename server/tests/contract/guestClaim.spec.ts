import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

const resetGuestInteractionMock = jest.fn();
const blockGuestIdMock = jest.fn();
const trackGuestClaimedMock = jest.fn();

let supabaseStub: ReturnType<typeof createSupabaseStub> | null = null;

jest.mock("../../lib/supabaseAdmin", () => ({
  __esModule: true,
  getSupabaseAdmin: () => supabaseStub,
  ensureSupabaseConfigured: () => supabaseStub,
  SupabaseConfigError: class extends Error {},
}));

jest.mock("../../core/http/middlewares/guestSession", () => ({
  __esModule: true,
  guestSessionMiddleware: (_req: any, _res: any, next: any) => next(),
  resetGuestInteraction: (...args: unknown[]) => resetGuestInteractionMock(...args),
  blockGuestId: (...args: unknown[]) => blockGuestIdMock(...args),
}));

jest.mock("../../analytics/events/mixpanelEvents", () => ({
  __esModule: true,
  trackGuestClaimed: (...args: unknown[]) => trackGuestClaimedMock(...args),
}));

function createSupabaseStub() {
  const updateMock = jest.fn(() => ({
    in: jest.fn(() => ({
      select: jest.fn(async () => ({ data: [{ id: "ref-1" }], error: null })),
    })),
  }));

  return {
    auth: {
      getUser: jest.fn(async (_token: string) => ({ data: { user: { id: "user-789" } }, error: null })),
    },
    from: jest.fn((table: string) => {
      if (table === "referencias_temporarias") {
        return {
          update: updateMock,
        };
      }
      return {
        update: jest.fn(() => ({
          select: jest.fn(async () => ({ data: [], error: null })),
        })),
      };
    }),
  };
}

async function createApp() {
  const { createTestApp } = await import("./utils/app");
  return createTestApp();
}

const guestId = "5f9b4c1d-1234-4abc-9def-1234567890ab";
const sessionId = "session-guest-1";

describe("/api/guest/claim contract", () => {
  beforeEach(() => {
    supabaseStub = createSupabaseStub();
    resetGuestInteractionMock.mockReset();
    blockGuestIdMock.mockReset();
    trackGuestClaimedMock.mockReset();
  });

  it("requires authentication", async () => {
    const app = await createApp();
    const agent = request(app);

    const response = await agent
      .post("/api/guest/claim")
      .set("X-Eco-Guest-Id", guestId)
      .set("X-Eco-Session-Id", sessionId)
      .send({ guestId: `guest_${guestId}` });

    expect(response.status).toBe(401);
  });

  it("claims guest ids with 204 and echoes headers", async () => {
    const app = await createApp();
    const agent = request(app);

    const response = await agent
      .post("/api/guest/claim")
      .set("Authorization", "Bearer token-123")
      .set("X-Eco-Guest-Id", guestId)
      .set("X-Eco-Session-Id", sessionId)
      .send({ guestId: `guest_${guestId}` });

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(response.headers["x-eco-guest-id"]).toBe(guestId);
    expect(response.headers["x-eco-session-id"]).toBe(sessionId);
    expect(resetGuestInteractionMock).toHaveBeenCalledWith(`guest_${guestId}`);
    expect(blockGuestIdMock).toHaveBeenCalledWith(`guest_${guestId}`);
    expect(trackGuestClaimedMock).toHaveBeenCalledWith({ guestId: `guest_${guestId}`, userId: "user-789" });
  });
});
