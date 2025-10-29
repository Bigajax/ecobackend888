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

test("GET /api/_eco-contract returns contract summary", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address() as AddressInfo | null;
    assert.ok(address && typeof address === "object", "espera socket com porta dinâmica");
    const port = address.port;

    const response = await fetch(`http://127.0.0.1:${port}/api/_eco-contract`, {
      headers: { Accept: "application/json" },
    });

    assert.equal(response.status, 200, "espera status 200");
    const contentType = response.headers.get("content-type") ?? "";
    assert.ok(
      contentType.includes("application/json"),
      `content-type deve sinalizar json. Recebido: ${contentType}`,
    );

    const payload = (await response.json()) as Record<string, any>;

    assert.equal(payload.service, "ecobackend", "service deve identificar o backend");
    assert.ok(typeof payload.version === "string" && payload.version.length > 0, "version deve ser string");
    assert.ok(typeof payload.base_url === "string" && payload.base_url.length > 0, "base_url deve ser string");

    assert.ok(Array.isArray(payload.cors?.allowlist_patterns), "cors.allowlist_patterns deve ser array");
    assert.ok(Array.isArray(payload.cors?.allow_methods), "cors.allow_methods deve ser array");
    assert.ok(Array.isArray(payload.cors?.allow_headers), "cors.allow_headers deve ser array");

    assert.equal(
      payload.identity?.query_params?.guest_id,
      "required",
      "guest_id deve ser requerido",
    );
    assert.equal(
      payload.identity?.headers?.["X-Eco-Guest-Id"],
      "required",
      "header X-Eco-Guest-Id deve ser requerido",
    );

    assert.equal(payload.ask_eco?.path, "/api/ask-eco", "ask_eco.path deve apontar para /api/ask-eco");
    assert.ok(payload.ask_eco?.sse, "ask_eco.sse deve estar presente");
    assert.ok(payload.ask_eco?.json_fallback, "ask_eco.json_fallback deve estar presente");
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
