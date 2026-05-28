import { linkUserToQuizResponse } from "../controllers/quizController";

const mockSelect = jest.fn();
const mockMaybeSingle = jest.fn();
const mockEq = jest.fn();
const mockUpdate = jest.fn();
const mockSelectAfterUpdate = jest.fn();
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
  // Default: SELECT by id retorna response sem user_id
  mockMaybeSingle.mockResolvedValue({ data: { id: "uuid-1", user_id: null }, error: null });
  mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
  mockSelect.mockReturnValue({ eq: mockEq });
  // Default: UPDATE OK
  mockSelectAfterUpdate.mockResolvedValue({ data: [{ id: "uuid-1" }], error: null });
  mockUpdate.mockReturnValue({ eq: () => ({ is: () => ({ select: mockSelectAfterUpdate }) }) });
  mockFrom.mockReturnValue({ select: mockSelect, update: mockUpdate });
});

test("400 se id malformado (não é UUID)", async () => {
  const req: any = { user: { id: "u1" }, params: { id: "not-a-uuid" } };
  const res = mockRes();
  await linkUserToQuizResponse(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

test("401 se sem req.user", async () => {
  const req: any = { user: undefined, params: { id: "00000000-0000-0000-0000-000000000001" } };
  const res = mockRes();
  await linkUserToQuizResponse(req, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

test("404 se response não existe", async () => {
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  const req: any = { user: { id: "u1" }, params: { id: "00000000-0000-0000-0000-000000000001" } };
  const res = mockRes();
  await linkUserToQuizResponse(req, res);
  expect(res.status).toHaveBeenCalledWith(404);
});

test("200 alreadyLinked quando user_id já preenchido", async () => {
  mockMaybeSingle.mockResolvedValue({ data: { id: "uuid-1", user_id: "outro-user" }, error: null });
  const req: any = { user: { id: "u1" }, params: { id: "00000000-0000-0000-0000-000000000001" } };
  const res = mockRes();
  await linkUserToQuizResponse(req, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ success: true, alreadyLinked: true });
  expect(mockUpdate).not.toHaveBeenCalled();
});

test("200 success quando update vincula user_id", async () => {
  const req: any = { user: { id: "u1" }, params: { id: "00000000-0000-0000-0000-000000000001" } };
  const res = mockRes();
  await linkUserToQuizResponse(req, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ success: true });
  expect(mockUpdate).toHaveBeenCalledWith({ user_id: "u1" });
});
