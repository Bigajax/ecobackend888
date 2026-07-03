import { createGateLead } from "../controllers/leadsController";

const mockMaybeSingle = jest.fn();
const mockEqSelect = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEqSelect }));
const mockInsert = jest.fn(() => Promise.resolve({ error: null }));
const mockEqUpdate = jest.fn(() => Promise.resolve({ error: null }));
const mockUpdate = jest.fn(() => ({ eq: mockEqUpdate }));
const mockFrom = jest.fn((..._args: any[]) => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
}));

jest.mock("../lib/supabaseAdmin", () => ({
  ensureSupabaseConfigured: () => ({ from: (...args: any[]) => mockFrom(...args) }),
}));

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMaybeSingle.mockResolvedValue({ data: null, error: null }); // não existe por padrão
});

test("rejeita e-mail inválido com 400", async () => {
  const req: any = { body: { email: "not-an-email" }, headers: {} };
  const res = mockRes();
  await createGateLead(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockInsert).not.toHaveBeenCalled();
});

test("insere lead novo email-only com source/provider/guest_id e status 'new'", async () => {
  const req: any = {
    body: { email: "Ana@Gmail.com", provider: "email", guestId: "guest-1" },
    headers: { "user-agent": "jest" },
  };
  const res = mockRes();
  await createGateLead(req, res);
  expect(mockFrom).toHaveBeenCalledWith("sono_leads");
  expect(mockInsert).toHaveBeenCalledWith(
    expect.objectContaining({
      email: "ana@gmail.com",
      source: "sono_signup_gate",
      provider: "email",
      guest_id: "guest-1",
      status: "new",
    }),
  );
  expect(res.status).toHaveBeenCalledWith(200);
});

// Regressão: domínios de um nível (gmail/hotmail) eram rejeitados pela EMAIL_REGEX
// (exigia 2 pontos) — o que mataria o objetivo do gate de capturar o lead.
test("aceita e-mails reais de um nível (gmail/hotmail)", async () => {
  for (const email of ["ana@gmail.com", "rafael@hotmail.com"]) {
    jest.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = mockRes();
    await createGateLead({ body: { email, provider: "email" }, headers: {} } as any, res);
    expect(mockInsert).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  }
});

test("e-mail já existente: não insere (preserva first-touch) e responde 200", async () => {
  mockMaybeSingle.mockResolvedValueOnce({ data: { id: "lead-1", guest_id: "guest-1" }, error: null });
  const req: any = { body: { email: "ana@gmail.com", provider: "google" }, headers: {} };
  const res = mockRes();
  await createGateLead(req, res);
  expect(mockInsert).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
});

test("e-mail já existente SEM guest_id: vincula o guest_id do gate (recuperação do órfão)", async () => {
  mockMaybeSingle.mockResolvedValueOnce({ data: { id: "lead-1", guest_id: null }, error: null });
  const req: any = {
    body: { email: "ana@gmail.com", provider: "email", guestId: "guest-9" },
    headers: {},
  };
  const res = mockRes();
  await createGateLead(req, res);
  expect(mockInsert).not.toHaveBeenCalled();
  expect(mockUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ provider: "email", guest_id: "guest-9" }),
  );
  expect(res.status).toHaveBeenCalledWith(200);
});

test("e-mail já existente COM guest_id: não sobrescreve o guest_id (first-touch)", async () => {
  mockMaybeSingle.mockResolvedValueOnce({ data: { id: "lead-1", guest_id: "guest-original" }, error: null });
  const req: any = {
    body: { email: "ana@gmail.com", provider: "email", guestId: "guest-novo" },
    headers: {},
  };
  const res = mockRes();
  await createGateLead(req, res);
  // Não deve conter guest_id (não sobrescreve), mas atualiza o provider.
  expect(mockUpdate).toHaveBeenCalledWith(
    expect.not.objectContaining({ guest_id: expect.anything() }),
  );
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ provider: "email" }));
  expect(res.status).toHaveBeenCalledWith(200);
});

test("erro de DB no insert ainda responde 200 (fire-and-forget)", async () => {
  mockInsert.mockResolvedValueOnce({ error: { message: "db down" } });
  const req: any = { body: { email: "ana@gmail.com", provider: "email" }, headers: {} };
  const res = mockRes();
  await createGateLead(req, res);
  expect(res.status).toHaveBeenCalledWith(200);
});
