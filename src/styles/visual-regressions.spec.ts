import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const frontendStyles = readFileSync(resolve(process.cwd(), "src/styles/index.css"), "utf8");
const frontendShell = readFileSync(
  resolve(process.cwd(), "src/components/VisualShell.vue"),
  "utf8",
);
const prototypeStyles = readFileSync(resolve(process.cwd(), "prototype/styles/index.css"), "utf8");
const prototypeShell = readFileSync(resolve(process.cwd(), "prototype/App.vue"), "utf8");

function rule(styles: string, selector: string) {
  return styles.slice(styles.indexOf(selector), styles.indexOf("}", styles.indexOf(selector)) + 1);
}

describe("视觉回归：Dialog footer 与空板块 hint", () => {
  it("keeps form footers in normal flow instead of overlaying dialog content", () => {
    const footerRule = rule(frontendStyles, ".admin-edit-form__footer");

    expect(footerRule).not.toContain("position: sticky");
    expect(footerRule).not.toContain("bottom: 0");
    expect(footerRule).not.toContain("z-index: 1");
  });

  it("removes empty-board hint offsets and their obsolete hooks in both visual surfaces", () => {
    expect(frontendStyles).not.toContain(".app-section--empty-board");
    expect(frontendShell).not.toContain("app-section--empty-board");
    expect(prototypeStyles).not.toContain(".proto-section--empty-board");
    expect(prototypeShell).not.toContain("proto-section--empty-board");
  });
});
