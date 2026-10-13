import { describe, expect, it } from "vitest";
import { paletteCss, validatePalette } from "../../src/format/palette";
import type { RigLabPalette } from "../../src/format/palette";

const palette = (classes: unknown, extra: object = {}) => ({ format: "riglab.palette", version: 1, classes, ...extra });
const errorsOf = (value: unknown): readonly string[] => {
  const result = validatePalette(value);
  return result.ok ? [] : result.errors;
};

describe("riglab.palette", () => {
  it("accepts colors, widths, opacity, caps and the pixel flag", () => {
    expect(errorsOf(palette({ part: { fill: "#5aa0f0", stroke: "#2A1D16", strokeWidth: 1.1 }, "part--blush": { stroke: "none", opacity: 0.65 }, detail: { fill: "none", linecap: "round" } }, { pixel: false }))).toEqual([]);
  });

  it("refuses unknown fields, bad colors, bad tokens and out-of-range numbers by path", () => {
    expect(errorsOf(palette({ part: { fill: "#5aa0f0" } }, { name: "x" }))).toEqual(["$: has unknown field 'name'"]);
    expect(errorsOf(palette({ part: { fill: "red" } }))).toEqual(["$.classes.part.fill: must be '#rrggbb' or 'none'"]);
    expect(errorsOf(palette({ part: { fill: "#5aa0f0;}" } }))).toEqual(["$.classes.part.fill: must be '#rrggbb' or 'none'"]);
    expect(errorsOf(palette({ part: { filter: "blur(2px)" } }))).toEqual(["$.classes.part: has unknown field 'filter'"]);
    expect(errorsOf(palette({ "Part}": {} }))).toEqual(["$.classes: 'Part}' is not a class token"]);
    expect(errorsOf(palette({ part: { opacity: 2, strokeWidth: -1, linecap: "fat" } }))).toEqual([
      "$.classes.part.strokeWidth: must be a number from 0 to 8",
      "$.classes.part.opacity: must be a number from 0 to 1",
      "$.classes.part.linecap: must be one of butt, round, square",
    ]);
    expect(errorsOf(palette({}))).toEqual(["$.classes: must be an object with at least one class token"]);
    expect(errorsOf(palette({ part: {} }, { pixel: "yes" }))).toEqual(["$.pixel: must be true or false"]);
  });

  it("emits CSS scoped to its art set, in cascade order, from validated values only", () => {
    const value: RigLabPalette = { format: "riglab.palette", version: 1, classes: {
      part: { fill: "#5aa0f0", stroke: "#2a1d16", strokeWidth: 1.1 },
      "part--eye": { fill: "#2b2140", stroke: "none" },
      detail: { fill: "none", stroke: "#6b2f26", linecap: "round", opacity: 0.6 },
    } };
    expect(paletteCss("chibi", value).split("\n")).toEqual([
      ".art-set--chibi .part { fill: #5aa0f0; stroke: #2a1d16; stroke-width: 1.1; stroke-linejoin: round; vector-effect: non-scaling-stroke; }",
      ".art-set--chibi .part--eye { fill: #2b2140; stroke: none; }",
      ".art-set--chibi .detail { fill: none; stroke: #6b2f26; stroke-linecap: round; opacity: 0.6; stroke-linejoin: round; vector-effect: non-scaling-stroke; }",
    ]);
    expect(() => paletteCss("x } body {", value)).toThrow("is not an art set name");
  });
});

describe("the library stylesheet", () => {
  it("scopes every skin's and weapon's palette to its own art set, in config order", async () => {
    const { LIBRARY } = await import("../../src/library/active");
    const { libraryCss } = await import("../../src/library/styles");
    const sets = libraryCss(LIBRARY).split("\n").map((rule) => /^\.art-set--([A-Za-z0-9_-]+) /.exec(rule)?.[1]);
    expect([...new Set(sets)]).toEqual(["plain", "block", "pixel", "sword", "spear", "axe", "daggers"]);
  });
});
