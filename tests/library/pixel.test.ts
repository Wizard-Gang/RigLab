import { describe, expect, it } from "vitest";
import { paletteCss, validatePalette } from "../../src/format/palette";
import { loadLibrary } from "../../src/library/load";
import { pixelProblems } from "../../src/library/pixel";
import { placeholderFiles, withChanges } from "./placeholder";

const part = (...d: string[]) => ({ bone: "head", set: "pixel", paths: d.map((value) => ({ className: "part", d: value })) });
const errorsOf = (changes: Readonly<Record<string, string | null>>): readonly string[] => {
  const result = loadLibrary(withChanges(changes));
  return result.ok ? [] : result.errors;
};
const head = placeholderFiles()["skins/pixel/head.svg"]!;

describe("the pixel contract", () => {
  it("accepts separate 2×2 cells on the even grid, negative ones included", () => {
    expect(pixelProblems(part("M-4 -2h2v2h-2z M0 0h2v2h-2z", "M-24 -46h2v2h-2z"))).toEqual([]);
  });

  it("refuses odd coordinates, merged rectangles, curves and loose spacing, naming the path", () => {
    expect(pixelProblems(part("M0 0h2v2h-2z M1 0h2v2h-2z"))).toEqual(["path 1: cell at (1, 0) is off the even grid"]);
    expect(pixelProblems(part("M0 0h2v2h-2z", "M0 0h4v2h-4z"))).toEqual(["path 2: 'M0 0h4v2h-4z' at 0 is not a 2×2 cell 'M{x} {y}h2v2h-2z'"]);
    expect(pixelProblems(part("M0 0 Q2 2 4 0 Z"))[0]).toMatch(/^path 1: 'M0 0 Q2 2 4 0 Z' at 0 is not a 2×2 cell/);
    expect(pixelProblems(part("M0 0h2v2h-2z  M2 0h2v2h-2z"))).toEqual(["path 1: cells must be separated by one space, at 12"]);
    expect(pixelProblems(part("M0 0h2v2h-2z "))).toEqual(["path 1: cells must be separated by one space, at 12"]);
    expect(pixelProblems(part("M0.5 0h2v2h-2z"))[0]).toMatch(/is not a 2×2 cell/);
  });

  it("holds for the placeholder's pixel skin, and the loader enforces it on pixel skins only", () => {
    const loaded = loadLibrary(placeholderFiles());
    expect(loaded.ok && loaded.value.skins.map((skin) => [skin.name, skin.palette.pixel ?? false])).toEqual([["plain", false], ["block", false], ["pixel", true]]);
    expect(errorsOf({ "skins/pixel/head.svg": head.replace(/d="M(-?\d+) /, 'd="M$1.5 ') })[0]).toMatch(/^skins\/pixel\/head\.svg: path 1: '.*' at 0 is not a 2×2 cell/);
    expect(errorsOf({ "skins/pixel/head.svg": head.replace(/d="M(-?\d+) (-?\d+)h2v2h-2z/, 'd="M$1 $2h4v2h-4z') })[0]).toMatch(/^skins\/pixel\/head\.svg: path 1: 'M-?\d+ -?\d+h4v2h-4z.*' at 0 is not a 2×2 cell/);
    const plainHead = placeholderFiles()["skins/plain/head.svg"]!;
    expect(errorsOf({ "skins/plain/head.svg": plainHead })).toEqual([]);
  });

  it("gives a pixel palette crisp edges and refuses its strokes", () => {
    const palette = { format: "riglab.palette", version: 1, pixel: true, classes: { part: {}, "part--ink": { fill: "#2b2f3a", stroke: "none" } } } as const;
    expect(validatePalette(palette).ok).toBe(true);
    expect(paletteCss("pixel", palette).split("\n")).toEqual([
      ".art-set--pixel { shape-rendering: crispEdges; }",
      ".art-set--pixel .part {  }",
      ".art-set--pixel .part--ink { fill: #2b2f3a; stroke: none; }",
    ]);
    const stroked = validatePalette({ ...palette, classes: { part: { stroke: "#000000", strokeWidth: 1 } } });
    expect(stroked.ok ? [] : stroked.errors).toEqual(["$.classes.part: a pixel palette draws no strokes; outline with cells instead"]);
  });
});
