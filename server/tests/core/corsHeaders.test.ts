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

test("OPTIONS /api/ask-eco responde 204 com allowlist padrão", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address() as AddressInfo | null;
    assert.ok(address && typeof address === "object", "espera socket com porta dinâmica");
    const port = address.port;

    const response = await fetch(`http://127.0.0.1:${port}/api/ask-eco`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://ecofrontend888.vercel.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, X-Eco-Guest-Id, X-Eco-Session-Id",
      },
    });

    assert.equal(response.status, 204, "preflight deve responder 204");
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "https://ecofrontend888.vercel.app",
      "deve ecoar a origin permitida",
    );
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      "true",
      "preflight deve sinalizar credenciais habilitadas",
    );
    const allowHeaders = response.headers
      .get("access-control-allow-headers")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    assert.deepEqual(
      allowHeaders,
      [
        "content-type",
        "authorization",
        "apikey",
        "x-requested-with",
        "x-client-id",
        "x-trace-id",
      ],
      "deve aplicar a lista padrão de headers",
    );
    assert.equal(
      response.headers.get("access-control-allow-methods"),
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "deve aplicar a lista padrão de métodos",
    );
    assert.equal(
      response.headers.get("access-control-expose-headers"),
      "content-type, x-request-id",
      "deve expor os headers permitidos",
    );
    assert.equal(
      response.headers.get("access-control-max-age"),
      "600",
      "deve aplicar o max-age padrão",
    );
  } finally {
    await closeServer(server);
  }
});

test("GET /api/health responde payload esperado com headers CORS", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address() as AddressInfo | null;
    assert.ok(address && typeof address === "object", "espera socket com porta dinâmica");
    const port = address.port;

    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: "https://ecofrontend888.vercel.app" },
    });

    assert.equal(response.status, 200, "deve responder 200");
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "https://ecofrontend888.vercel.app",
      "deve ecoar a origin permitida",
    );
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      "true",
      "deve permitir credenciais",
    );
    assert.equal(
      response.headers.get("access-control-expose-headers"),
      "content-type, x-request-id",
      "deve expor os headers padrão",
    );

    const payload = (await response.json()) as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(payload).sort(),
      ["ok", "service", "ts"],
      "payload deve conter campos esperados",
    );
    const typedPayload = payload as { ok: boolean; service: string; ts: string };
    assert.equal(typedPayload.ok, true, "ok deve ser true");
    assert.equal(typedPayload.service, "eco-backend", "service deve ser eco-backend");
    const parsedTs = Date.parse(typedPayload.ts);
    assert.ok(Number.isFinite(parsedTs), "ts deve ser ISO date válido");
  } finally {
    await closeServer(server);
  }
});

test("POST /api/ask-eco com payload inválido responde 400 com headers CORS", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address() as AddressInfo | null;
    assert.ok(address && typeof address === "object", "espera socket com porta dinâmica");
    const port = address.port;

    const response = await fetch(`http://127.0.0.1:${port}/api/ask-eco`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ecofrontend888.vercel.app",
      },
      body: JSON.stringify({ qualquer: "coisa" }),
    });

    assert.equal(response.status, 400, "deve responder 400 para payload inválido");
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "https://ecofrontend888.vercel.app",
      "deve ecoar a origin permitida",
    );
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      "true",
      "deve permitir credenciais",
    );
    assert.equal(
      response.headers.get("access-control-expose-headers"),
      "content-type, x-request-id",
      "deve expor os headers padrão",
    );

    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(payload.ok, false, "payload deve sinalizar falha");
  } finally {
    await closeServer(server);
  }
});

test("GET /api/memorias/similares_v2 existe sob /api e aplica headers CORS", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address() as AddressInfo | null;
    assert.ok(address && typeof address === "object", "espera socket com porta dinâmica");
    const port = address.port;

    const response = await fetch(
      `http://127.0.0.1:${port}/api/memorias/similares_v2?usuario_id=00000000-0000-0000-0000-000000000000&texto=teste`,
      {
        headers: { Origin: "https://ecofrontend888.vercel.app" },
      }
    );

    assert.notEqual(response.status, 404, "rota deve existir sob /api/memorias");
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "https://ecofrontend888.vercel.app",
      "deve ecoar a origin permitida",
    );
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      "true",
      "deve permitir credenciais",
    );
    assert.equal(
      response.headers.get("access-control-expose-headers"),
      "content-type, x-request-id",
      "deve expor os headers padrão",
    );

    await response.json();
  } finally {
    await closeServer(server);
  }
});

test("GET /api/rota_inexistente responde 404 com headers CORS", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address() as AddressInfo | null;
    assert.ok(address && typeof address === "object", "espera socket com porta dinâmica");
    const port = address.port;

    const response = await fetch(`http://127.0.0.1:${port}/api/rota_inexistente`, {
      headers: { Origin: "https://ecofrontend888.vercel.app" },
    });

    assert.equal(response.status, 404, "deve responder 404 para rota inexistente");
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "https://ecofrontend888.vercel.app",
      "deve ecoar a origin permitida",
    );
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      "true",
      "deve permitir credenciais",
    );
    assert.equal(
      response.headers.get("access-control-expose-headers"),
      "content-type, x-request-id",
      "deve expor os headers padrão",
    );

    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(payload.error, "Rota não encontrada", "deve indicar rota inexistente");
  } finally {
    await closeServer(server);
  }
});

test("Erros 500 também aplicam headers CORS", async () => {
  const { default: express } = await import("express");
  const app = createApp();
  const router = express.Router();
  router.get("/api/_test-error", (_req, _res, next) => {
    next(new Error("boom"));
  });
  app.use(router);

  const stack = ((app as unknown as { _router?: { stack?: any[] } })._router?.stack ?? []) as any[];
  if (stack.length >= 3) {
    const routerLayer = stack.pop();
    const errorLayer = stack.pop();
    const notFoundLayer = stack.pop();
    stack.push(routerLayer, notFoundLayer, errorLayer);
  }

  const server = app.listen(0);

  try {
    const address = server.address() as AddressInfo | null;
    assert.ok(address && typeof address === "object", "espera socket com porta dinâmica");
    const port = address.port;

    const response = await fetch(`http://127.0.0.1:${port}/api/_test-error`, {
      headers: { Origin: "https://ecofrontend888.vercel.app" },
    });

    assert.equal(response.status, 500, "deve responder 500 para erro não tratado");
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "https://ecofrontend888.vercel.app",
      "deve ecoar a origin permitida",
    );
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      "true",
      "deve permitir credenciais",
    );
    assert.equal(
      response.headers.get("access-control-expose-headers"),
      "content-type, x-request-id",
      "deve expor os headers padrão",
    );

    const payload = (await response.json()) as Record<string, unknown>;
    assert.deepEqual(payload, { ok: false, error: "boom" }, "payload deve refletir erro propagado");
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
