import { normalizeServerEvent } from "../web/src/api/ecoStream";

describe("normalizeServerEvent", () => {
  it("preserves leading whitespace for string chunk payloads", () => {
    const events = normalizeServerEvent(" pra", "chunk");

    expect(events).toEqual([
      {
        type: "chunk",
        delta: " pra",
        index: 0,
      },
    ]);
  });

  it("preserves leading whitespace for object chunk payloads", () => {
    const events = normalizeServerEvent(
      {
        type: "chunk",
        delta: " pra",
        index: 3,
      },
      "chunk"
    );

    expect(events).toEqual([
      {
        type: "chunk",
        delta: " pra",
        index: 3,
      },
    ]);
  });

  it("retains whitespace-only chunks", () => {
    const events = normalizeServerEvent(" \n", "chunk");

    expect(events).toEqual([
      {
        type: "chunk",
        delta: " \n",
        index: 0,
      },
    ]);
  });
});
