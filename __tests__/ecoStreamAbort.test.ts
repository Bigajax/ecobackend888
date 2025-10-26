import { startEcoStream } from "../web/src/api/ecoStream";

describe("startEcoStream diagnostics", () => {
  const originalFetch = global.fetch;
  let debugSpy: jest.SpyInstance;

  afterEach(async () => {
    global.fetch = originalFetch;
    debugSpy?.mockRestore();
    jest.restoreAllMocks();
  });

  it("emits a client_abort log when a newer stream supersedes the previous one", async () => {
    const abortRejectors: Array<(error: unknown) => void> = [];

    const fetchMock = jest.fn(async (_input: unknown, init?: { signal?: AbortSignal }) => {
      const signal = init?.signal;

      const reader = {
        read: jest.fn(
          () =>
            new Promise<unknown>((_resolve, reject) => {
              abortRejectors.push(reject);
            })
        ),
        releaseLock: jest.fn(),
      };

      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            while (abortRejectors.length) {
              const reject = abortRejectors.shift();
              reject?.(new Error("aborted"));
            }
          },
          { once: true }
        );
      }

      const response = {
        ok: true,
        headers: {
          get: () => null,
        },
        body: {
          getReader: () => reader,
        },
      } as any;

      return response;
    }) as unknown as typeof fetch;

    global.fetch = fetchMock;

    debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});

    const handle1 = startEcoStream({
      body: { messages: [] },
      token: "token-1",
      onEvent: () => {},
    });
    await Promise.resolve();

    const handle2 = startEcoStream({
      body: { messages: [] },
      token: "token-2",
      onEvent: () => {},
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const abortLogs = debugSpy.mock.calls.filter((call) => call[0] === "[SSE] client_abort");
    const supersededLog = abortLogs.find(([, payload]) => payload?.reason === "superseded_stream");

    expect(supersededLog).toBeDefined();

    await handle1.finished;
    handle2.close();
    await handle2.finished;
  });
});
