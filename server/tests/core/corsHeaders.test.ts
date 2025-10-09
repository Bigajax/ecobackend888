import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { createApp } from "../../core/http/app";

interface TestCase {
  name: string;
  run: () => Promise<void> | void;
}

const tests: TestCase[] = [];

function test(name: string, run: () => Promise<void> | void) {
  tests.push({ name, run });
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

test("OPTIONS /api/ask-eco expõe cabeçalhos de convidado", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address() as AddressInfo | null;
    assert.ok(address && typeof address === "object", "espera socket com porta dinâmica");
    const port = address.port;

    const response = await fetch(`http://127.0.0.1:${port}/api/ask-eco`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, X-Guest-Id, X-Guest-Mode",
      },
    });

    assert.equal(response.status, 204, "preflight deve responder 204");
    const allowHeaders = response.headers.get("access-control-allow-headers") ?? "";
    assert.match(
      allowHeaders,
      /x-guest-id/i,
      "deve expor X-Guest-Id no preflight do modo convidado",
    );
    assert.match(
      allowHeaders,
      /x-guest-mode/i,
      "deve expor X-Guest-Mode no preflight do modo convidado",
    );
  } finally {
    await closeServer(server);
  }
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
