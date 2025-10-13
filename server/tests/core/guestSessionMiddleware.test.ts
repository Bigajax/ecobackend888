import assert from "node:assert/strict";

import { guestSessionMiddleware } from "../../core/http/middlewares/guestSession";

interface TestCase {
  name: string;
  run: () => Promise<void> | void;
}

const tests: TestCase[] = [];

function test(name: string, run: () => Promise<void> | void) {
  tests.push({ name, run });
}

const createMockReq = (headers: Record<string, string | undefined>, guestId?: string) => {
  return {
    headers: { ...headers },
    ip: "127.0.0.1",
    guestId,
  } as any;
};

const createMockRes = () => {
  let statusCode = 200;
  let jsonPayload: unknown;
  const headerStore = new Map<string, string>();

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      jsonPayload = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      headerStore.set(name.toLowerCase(), value);
    },
    getHeader(name: string) {
      return headerStore.get(name.toLowerCase());
    },
  } as any;

  return {
    res,
    get statusCode() {
      return statusCode;
    },
    get jsonPayload() {
      return jsonPayload;
    },
    headers: headerStore,
  };
};

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
test("propaga metadados quando guestId presente", async () => {
  const guestId = "5e0280ac-5bc3-4f7f-8ca0-281d6bf3b37f";
  const req = createMockReq({ "x-guest-mode": "1", "x-guest-id": guestId }, guestId);
  const { res, headers } = createMockRes();

  await new Promise<void>((resolve, reject) => {
    try {
      guestSessionMiddleware(req, res, () => resolve());
    } catch (error) {
      reject(error);
    }
  });

  assert.ok(req.guest, "espera metadados guest preenchidos");
  assert.equal(req.guest?.id, guestId);
  assert.match(req.guest!.id, UUID_V4_REGEX);
  assert.equal(headers.get("x-guest-id"), guestId);
});

test("continua fluxo quando guestId ausente", async () => {
  const req = createMockReq({ "x-guest-mode": "1" });
  const ctx = createMockRes();

  let nextCalled = false;

  await new Promise<void>((resolve, reject) => {
    try {
      guestSessionMiddleware(req, ctx.res, () => {
        nextCalled = true;
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });

  assert.equal(nextCalled, true, "middleware deve seguir fluxo sem guestId");
  assert.equal(req.guest, undefined);
  assert.equal(ctx.headers.get("x-guest-id"), undefined);
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

