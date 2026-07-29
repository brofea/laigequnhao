import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./pagination";

describe("UTF-8 cursor codec", () => {
  it("round-trips Chinese search and sort values as URL-safe text", () => {
    const value = { q: "群聊 搜索", title: "分页 A", n: 2 };
    const cursor = encodeCursor(value);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(decodeCursor(cursor)).toEqual(value);
  });

  it("rejects malformed cursor content", () => {
    expect(() => decodeCursor("not-json")).toThrow();
  });
});
