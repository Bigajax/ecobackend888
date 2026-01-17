import { formatKeywordList } from "./textUtils";

describe("formatKeywordList", () => {
  it("should return an empty string for an empty array", () => {
    expect(formatKeywordList([])).toBe("");
  });

  it("should return the single keyword for a single-element array", () => {
    expect(formatKeywordList(["a"])).toBe("a");
  });

  it("should format a two-element array with 'e'", () => {
    expect(formatKeywordList(["a", "b"])).toBe("a e b");
  });

  it("should format a three-element array with commas and 'e'", () => {
    expect(formatKeywordList(["a", "b", "c"])).toBe("a, b e c");
  });

  it("should format a four-element array with commas and 'e'", () => {
    expect(formatKeywordList(["a", "b", "c", "d"])).toBe("a, b, c e d");
  });
});
