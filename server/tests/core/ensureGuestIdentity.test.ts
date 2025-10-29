import assert from "node:assert/strict";

import { ensureGuestIdentity } from "../../core/http/guestIdentity";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Headers = Record<string, string | undefined>;

const createMockReq = (headers: Headers = {}) => {
  return {
    headers: { ...headers },
    path: "/api/ask-eco",
    method: "POST",
  } as any;
};

const createMockRes = () => {
  const headerStore = new Map<string, string | string[]>();
  const cookieStore: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
  return {
    setHeader(name: string, value: string | string[]) {
      headerStore.set(name.toLowerCase(), value);
    },
    getHeader(name: string) {
      return headerStore.get(name.toLowerCase());
    },
    headers: headerStore,
    cookie(name: string, value: string, options?: Record<string, unknown>) {
      cookieStore.push({ name, value, options });
      headerStore.set("set-cookie", `${name}=${encodeURIComponent(value)}`);
    },
    cookies: cookieStore,
  } as any;
};

type TestCase = { name: string; run: () => void | Promise<void> };
const tests: TestCase[] = [];

const test = (name: string, run: () => void | Promise<void>) => {
  tests.push({ name, run });
};

test("gera guestId quando header ausente", () => {
  const req = createMockReq();
  const res = createMockRes();

  let nextCalled = false;
  ensureGuestIdentity(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true, "middleware deve continuar fluxo");
  assert.ok(req.guestId, "guestId deve ser definido");
  assert.match(req.guestId!, UUID_V4_REGEX);
  assert.equal((req.headers as any)["x-eco-guest-id"], req.guestId);
  assert.equal(res.getHeader("x-eco-guest-id"), req.guestId);

  const cookieHeader = res.getHeader("set-cookie");
  const cookieValue = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  assert.ok(cookieValue && cookieValue.includes(`guest_id=${encodeURIComponent(req.guestId!)}`));
});

test("reutiliza guestId do cookie quando header inválido", () => {
  const existingGuestId = "5e0280ac-5bc3-4f7f-8ca0-281d6bf3b37f";
  const req = createMockReq({
    "x-guest-id": "invalid",
    cookie: `guest_id=${existingGuestId}`,
  });
  const res = createMockRes();

  ensureGuestIdentity(req, res, () => {});

  assert.equal(req.guestId, existingGuestId);
  assert.equal(res.getHeader("x-eco-guest-id"), existingGuestId);
  const cookieHeader = res.getHeader("set-cookie");
  const cookieValue = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  assert.ok(cookieValue && cookieValue.includes(`guest_id=${existingGuestId}`));
});

test("não interfere quando requisição autenticada", () => {
  const req = createMockReq();
  (req as any).user = { id: "user-123" };
  const res = createMockRes();

  let nextCalled = false;
  ensureGuestIdentity(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.guestId, undefined);
  assert.equal(res.getHeader("x-guest-id"), undefined);
  assert.equal(res.getHeader("set-cookie"), undefined);
});

(async () => {
  let failures = 0;
  for (const { name, run } of tests) {
    try {
      await run();
      console.log(`✓ ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    console.error(`${failures} test(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`All ${tests.length} test(s) passed.`);
  }
})();

