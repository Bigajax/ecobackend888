"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const node_perf_hooks_1 = require("node:perf_hooks");
const ClaudeAdapter_1 = require("../../core/ClaudeAdapter");
const SUCCESS_RESPONSE = {
    choices: [{ message: { content: "fallback-response" } }],
    model: "fallback-model",
    usage: {},
};
(0, node_test_1.default)("usa timeout configurado para acionar fallback rapidamente", async (t) => {
    const originalFetch = global.fetch;
    const originalTimeout = process.env.ECO_CLAUDE_TIMEOUT_MS;
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test";
    const configuredTimeout = 80;
    process.env.ECO_CLAUDE_TIMEOUT_MS = String(configuredTimeout);
    const callMoments = [];
    const start = node_perf_hooks_1.performance.now();
    global.fetch = ((input, init) => {
        const callIndex = callMoments.push(node_perf_hooks_1.performance.now() - start) - 1;
        if (!init?.signal) {
            throw new Error("esperava AbortSignal no fetch");
        }
        if (typeof init.agent !== "function") {
            throw new Error("esperava agent keep-alive configurado");
        }
        if (callIndex === 0) {
            return new Promise((_, reject) => {
                const signal = init.signal;
                if (signal.aborted) {
                    reject(signal.reason ?? Object.assign(new Error("aborted"), { name: "AbortError" }));
                    return;
                }
                const onAbort = () => {
                    signal.removeEventListener("abort", onAbort);
                    const reason = signal.reason ?? Object.assign(new Error("aborted"), { name: "AbortError" });
                    reject(reason);
                };
                signal.addEventListener("abort", onAbort, { once: true });
            });
        }
        return Promise.resolve({
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => SUCCESS_RESPONSE,
        });
    });
    t.after(() => {
        global.fetch = originalFetch;
        if (originalTimeout === undefined) {
            delete process.env.ECO_CLAUDE_TIMEOUT_MS;
        }
        else {
            process.env.ECO_CLAUDE_TIMEOUT_MS = originalTimeout;
        }
        if (originalApiKey === undefined) {
            delete process.env.OPENROUTER_API_KEY;
        }
        else {
            process.env.OPENROUTER_API_KEY = originalApiKey;
        }
    });
    const result = await (0, ClaudeAdapter_1.claudeChatCompletion)({
        messages: [{ role: "user", content: "olá" }],
        model: "main-model",
        fallbackModel: "fallback-model",
    });
    node_assert_1.default.strictEqual(result.model, "fallback-model");
    node_assert_1.default.strictEqual(result.content, "fallback-response");
    node_assert_1.default.strictEqual(callMoments.length, 2, "esperava tentativa original + fallback");
    const fallbackDelay = callMoments[1];
    const acceptableWindow = configuredTimeout + 120;
    node_assert_1.default.ok(fallbackDelay < acceptableWindow, `fallback demorou ${fallbackDelay.toFixed(2)}ms (> ${acceptableWindow}ms)`);
});
//# sourceMappingURL=ClaudeAdapter.test.js.map