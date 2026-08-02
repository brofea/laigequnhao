import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_MAX_WIDTH,
  TITLE_MAX_WIDTH,
  measureDisplayWidth,
  validateDisplayWidth,
} from "./display-width";

describe("measureDisplayWidth", () => {
  it("counts ASCII characters as 1 unit each", () => {
    expect(measureDisplayWidth("")).toBe(0);
    expect(measureDisplayWidth("abc")).toBe(3);
    expect(measureDisplayWidth("Hello, World!")).toBe(13);
  });

  it("counts half-width Latin letters as 1 unit", () => {
    expect(measureDisplayWidth("café")).toBe(4);
  });

  it("counts accented Latin composed and decomposed forms identically", () => {
    expect(measureDisplayWidth("é")).toBe(1);
    expect(measureDisplayWidth("e\u0301")).toBe(1);
    expect(measureDisplayWidth("Été")).toBe(3);
  });

  it("counts CJK and full-width characters as 2 units each", () => {
    expect(measureDisplayWidth("中文")).toBe(4);
    expect(measureDisplayWidth("测试群")).toBe(6);
    expect(measureDisplayWidth("ＡＢ")).toBe(4);
    expect(measureDisplayWidth("abc中文")).toBe(7);
    expect(measureDisplayWidth("日本語")).toBe(6);
    expect(measureDisplayWidth("한국어")).toBe(6);
  });

  it("counts a single emoji grapheme as 2 units", () => {
    expect(measureDisplayWidth("😀")).toBe(2);
    expect(measureDisplayWidth("🎮")).toBe(2);
  });

  it("counts combined emoji as a single grapheme of 2 units", () => {
    expect(measureDisplayWidth("\u{1f44d}\u{1f3fd}")).toBe(2); // 👍🏽
    expect(
      measureDisplayWidth("\u{1f468}\u{200d}\u{1f469}\u{200d}\u{1f467}\u{200d}\u{1f466}"),
    ).toBe(2); // 👨👩👧👦
    expect(measureDisplayWidth("\u2764\u{fe0f}")).toBe(2); // ❤️
    expect(measureDisplayWidth("\u{1f1e8}\u{1f1f3}")).toBe(2); // 🇨🇳
  });

  it("counts newlines as 2 units each", () => {
    expect(measureDisplayWidth("a\nb")).toBe(4);
    expect(measureDisplayWidth("x\n\n\ny")).toBe(8);
  });

  it("counts leading/trailing spaces literally (caller trims before validation)", () => {
    expect(measureDisplayWidth("  a  ")).toBe(5);
    expect(measureDisplayWidth("ab cd")).toBe(5);
  });
});

describe("validateDisplayWidth", () => {
  it("passes exactly at the title limit and fails one unit over", () => {
    const atLimit = "a".repeat(TITLE_MAX_WIDTH);
    expect(validateDisplayWidth(atLimit, TITLE_MAX_WIDTH)).toEqual({ ok: true });
    const over = `${"a".repeat(TITLE_MAX_WIDTH - 1)}中`;
    expect(validateDisplayWidth(over, TITLE_MAX_WIDTH)).toEqual({
      ok: false,
      width: TITLE_MAX_WIDTH + 1,
      maxWidth: TITLE_MAX_WIDTH,
    });
  });

  it("passes exactly at the description limit and fails one unit over", () => {
    expect(validateDisplayWidth("a".repeat(DESCRIPTION_MAX_WIDTH), DESCRIPTION_MAX_WIDTH)).toEqual({
      ok: true,
    });
    expect(
      validateDisplayWidth("a".repeat(DESCRIPTION_MAX_WIDTH + 1), DESCRIPTION_MAX_WIDTH),
    ).toEqual({
      ok: false,
      width: DESCRIPTION_MAX_WIDTH + 1,
      maxWidth: DESCRIPTION_MAX_WIDTH,
    });
  });

  it("passes an empty string", () => {
    expect(validateDisplayWidth("", TITLE_MAX_WIDTH)).toEqual({ ok: true });
  });
});
