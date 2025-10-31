const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const express = require("express");

require("ts-node").register({ transpileOnly: true });

const { createApp } = require("../../core/http/app");

const ALLOWED_ORIGIN = "http://localhost:3000";

test("OPTIONS /api/ask-eco responds with 204 and CORS headers", async () => {
  globalThis.mensagemRoutes = express.Router();

  try {
    const app = createApp();

    const response = await supertest(app)
      .options("/api/ask-eco")
      .set("Origin", ALLOWED_ORIGIN)
      .set("Access-Control-Request-Method", "POST");

    assert.equal(response.status, 204);
    assert.equal(response.text, "");
    assert.equal(response.headers["access-control-allow-origin"], ALLOWED_ORIGIN);
    assert.equal(response.headers["access-control-allow-credentials"], "true");
    assert.equal(
      response.headers["access-control-allow-methods"],
      "GET,POST,OPTIONS,HEAD"
    );
    assert.equal(
      response.headers["access-control-allow-headers"],
      "Content-Type, Accept"
    );
    assert.equal(response.headers["access-control-max-age"], "86400");

    const varyHeader = response.headers["vary"];
    assert.ok(typeof varyHeader === "string" && varyHeader.includes("Origin"));
  } finally {
    delete globalThis.mensagemRoutes;
  }
});
