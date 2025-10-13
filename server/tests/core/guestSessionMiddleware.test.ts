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

const createMockReq = (headers: Record<string, string | undefined>) => {
  return {
    headers: { ...headers },
    ip: "127.0.0.1",
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

const GUEST_UUID_REGEX =
  /^guest_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("gera guestId automaticamente quando ausente", async () => {
  const req = createMockReq({ "x-guest-mode": "1" });
  const { res, headers } = createMockRes();

  await new Promise<void>((resolve, reject) => {
    try {
      guestSessionMiddleware(req, res, () => resolve());
    } catch (error) {
      reject(error);
    }
  });

  assert.ok(req.guest, "espera metadados guest preenchidos");
  assert.ok(req.guest?.id, "espera guestId gerado");
  assert.match(req.guest!.id, GUEST_UUID_REGEX, "guestId deve ser um UUID com prefixo guest_");
  assert.equal(headers.get("x-guest-id"), req.guest!.id, "header x-guest-id deve ser enviado");
  assert.equal(req.headers["x-guest-id"], req.guest!.id, "req.headers deve refletir guestId gerado");
});

test("gera guestId quando header inválido", async () => {
  const req = createMockReq({ "x-guest-mode": "1", "x-guest-id": "invalid" });
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

  assert.equal(nextCalled, true, "middleware deve seguir o fluxo mesmo com header inválido");
  assert.ok(req.guest?.id, "espera guestId gerado");
  assert.match(req.guest!.id, GUEST_UUID_REGEX);
  assert.equal(ctx.headers.get("x-guest-id"), req.guest!.id);
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

