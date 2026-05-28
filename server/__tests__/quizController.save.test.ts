import { saveQuizResponse } from "../controllers/quizController";

const mockInsert = jest.fn();
const mockSelect = jest.fn();
const mockSingle = jest.fn();
const mockFrom = jest.fn();

jest.mock("../lib/supabaseAdmin", () => ({
  ensureSupabaseConfigured: () => ({
    from: (...args: any[]) => mockFrom(...args),
  }),
}));

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSingle.mockResolvedValue({ data: { id: "uuid-1" }, error: null });
  mockSelect.mockReturnValue({ single: mockSingle });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockFrom.mockReturnValue({ insert: mockInsert });
});

test("rejeita answers vazio quando skipped !== true", async () => {
  const req: any = { body: { answers: [] }, headers: {} };
  const res = mockRes();
  await saveQuizResponse(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

test("aceita answers vazio quando skipped === true", async () => {
  const req: any = {
    body: { answers: [], skipped: true, quiz_source: "onboarding_objetivos" },
    headers: { "x-eco-guest-id": "guest-abc" },
  };
  const res = mockRes();
  await saveQuizResponse(req, res);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(mockInsert).toHaveBeenCalledWith(
    expect.objectContaining({ skipped: true, guest_id: "guest-abc", quiz_source: "onboarding_objetivos" }),
  );
});

test("grava guest_id do header e skipped default false", async () => {
  const req: any = {
    body: { answers: [{ question: "objetivos", answer: ["sono"] }], quiz_source: "onboarding_objetivos" },
    headers: { "x-eco-guest-id": "guest-xyz" },
  };
  const res = mockRes();
  await saveQuizResponse(req, res);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(mockInsert).toHaveBeenCalledWith(
    expect.objectContaining({ guest_id: "guest-xyz", skipped: false }),
  );
});

test("guest_id null quando header ausente", async () => {
  const req: any = {
    body: { answers: [{ question: "q", answer: "a" }] },
    headers: {},
  };
  const res = mockRes();
  await saveQuizResponse(req, res);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ guest_id: null }));
});
