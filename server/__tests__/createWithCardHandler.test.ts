import { createWithCardHandler } from "../controllers/subscriptionController";

const mockCreateTrial = jest.fn();
const mockGetStatus = jest.fn();
const mockRecordEvent = jest.fn();

jest.mock("../services/MercadoPagoService", () => ({
  getMercadoPagoService: () => ({ createTrialSubscriptionWithCard: mockCreateTrial }),
}));
jest.mock("../services/SubscriptionService", () => ({
  getSubscriptionService: () => ({ getStatus: mockGetStatus, recordEvent: mockRecordEvent }),
}));

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetStatus.mockResolvedValue({ isPremium: false, subscriptionStatus: "expired" });
  mockCreateTrial.mockResolvedValue({ id: "pre_123", status: "authorized" });
});

test("401 when unauthenticated", async () => {
  const req: any = { user: undefined, body: {} };
  const res = mockRes();
  await createWithCardHandler(req, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

test("400 when card token missing", async () => {
  const req: any = { user: { id: "u1", email: "a@b.com" }, body: {} };
  const res = mockRes();
  await createWithCardHandler(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

test("creates monthly trial by default and returns id + status", async () => {
  const req: any = { user: { id: "u1", email: "a@b.com" }, body: { token: "tok_abc" } };
  const res = mockRes();
  await createWithCardHandler(req, res);
  expect(mockCreateTrial).toHaveBeenCalledWith("u1", "a@b.com", "tok_abc", "monthly");
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ id: "pre_123", status: "authorized" });
});

test("creates annual trial when plan=annual", async () => {
  const req: any = { user: { id: "u1", email: "a@b.com" }, body: { token: "tok_abc", plan: "annual" } };
  const res = mockRes();
  await createWithCardHandler(req, res);
  expect(mockCreateTrial).toHaveBeenCalledWith("u1", "a@b.com", "tok_abc", "annual");
  expect(res.status).toHaveBeenCalledWith(200);
});

test("400 when already subscribed", async () => {
  mockGetStatus.mockResolvedValue({ isPremium: true, subscriptionStatus: "active" });
  const req: any = { user: { id: "u1", email: "a@b.com" }, body: { token: "tok_abc" } };
  const res = mockRes();
  await createWithCardHandler(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
});
