import assert from "node:assert/strict";
import {
  DEFAULT_RELATORIO_VIEW,
  extractDistinctId,
  extractRelatorioView,
} from "../server/routes/relatorioEmocionalView";

type RelatorioRequest = Parameters<typeof extractRelatorioView>[0];

type TestCase = { name: string; run: () => Promise<void> | void };

const tests: TestCase[] = [];

function test(name: string, run: () => Promise<void> | void) {
  tests.push({ name, run });
}

function makeRequest(overrides: Partial<RelatorioRequest>): RelatorioRequest {
  return {
    query: {},
    headers: {},
    ...overrides,
  } as RelatorioRequest;
}

test("defaults to mapa when no view provided", () => {
  const req = makeRequest({});
  const view = extractRelatorioView(req);
  assert.equal(view, DEFAULT_RELATORIO_VIEW);
});

test("accepts query parameter for view", () => {
  const req = makeRequest({ query: { view: "linha_do_tempo" } as any });
  const view = extractRelatorioView(req);
  assert.equal(view, "linha_do_tempo");
});

test("accepts header parameter for view and normalizes case", () => {
  const req = makeRequest({ headers: { "x-relatorio-view": "Mapa" } });
  const view = extractRelatorioView(req);
  assert.equal(view, "mapa");
});

test("extractDistinctId inspects query and headers", () => {
  const reqWithQuery = makeRequest({ query: { distinct_id: " 123 " } as any });
  assert.equal(extractDistinctId(reqWithQuery), "123");

  const reqWithHeader = makeRequest({ headers: { "x-mixpanel-distinct-id": "abc" } });
  assert.equal(extractDistinctId(reqWithHeader), "abc");
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
