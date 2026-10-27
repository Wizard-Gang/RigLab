import { describe, expect, it } from "vitest";
import { paletteCss, validatePalette } from "../../src/format/palette";
import { serializePart, validatePart } from "../../src/format/part";
import type { RigLabPart } from "../../src/format/part";
import { parsePart } from "../../src/hexframe/parts";
import { convertPixelParts } from "../../src/library/convert";
import { loadLibrary } from "../../src/library/load";
import { cellsToGrid, gridPart, pixelProblems } from "../../src/library/pixel";
import { placeholderFiles, withChanges } from "./placeholder";

const grid: RigLabPart = {
  format: "riglab.part", version: 1, bone: "head", origin: [-2, -1], size: [4, 3],
  rows: ["iiii", "if.i", "iiii"], keys: { i: "part part--ink", f: "part part--fill" },
};
const errorsOf = (value: unknown): readonly string[] => {
  const result = validatePart(value);
  return result.ok ? [] : result.errors;
};
const loadErrors = (changes: Readonly<Record<string, string | null>>): readonly string[] => {
  const result = loadLibrary(withChanges(changes));
  return result.ok ? [] : result.errors;
};
const svg = (...paths: [string, string][]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" data-bone="head">${paths.map(([className, d]) => `<path class="${className}" d="${d}"/>`).join("")}</svg>`;

describe("riglab.part", () => {
  it("accepts a closed grid and places each pixel as a 2×2 cell from its origin", () => {
    expect(errorsOf(grid)).toEqual([]);
    expect(gridPart(grid, "pixel").paths).toEqual([
      { className: "part part--ink", d: "M-4 -2h2v2h-2z M-2 -2h2v2h-2z M0 -2h2v2h-2z M2 -2h2v2h-2z M-4 0h2v2h-2z M2 0h2v2h-2z M-4 2h2v2h-2z M-2 2h2v2h-2z M0 2h2v2h-2z M2 2h2v2h-2z" },
      { className: "part part--fill", d: "M-2 0h2v2h-2z" },
    ]);
  });

  it("refuses rows that disagree with the size, unknown or unused keys, and bad class lists, at their paths", () => {
    expect(errorsOf({ ...grid, rows: ["iiii", "if.i"] })).toEqual(["$.rows: must hold 3 rows, as size[1] says; found 2"]);
    expect(errorsOf({ ...grid, rows: ["iiii", "if.", "iiii"] })).toEqual(["$.rows[1]: must be 4 characters, as size[0] says; found 3"]);
    expect(errorsOf({ ...grid, rows: ["iiii", "ifxi", "iiii"] })).toEqual(["$.rows[1]: pixel 2 'x' is not '.' or a key"]);
    expect(errorsOf({ ...grid, keys: { ...grid.keys, g: "part" } })).toEqual(["$.keys['g']: is never used"]);
    expect(errorsOf({ ...grid, keys: { ...grid.keys, f: "part  part--fill" } })[0]).toMatch(/^\$\.keys\['f'\]: must be distinct class tokens/);
    expect(errorsOf({ ...grid, keys: { ".": "part", ...grid.keys } })[0]).toMatch(/^\$\.keys: key '\.' must be one printable character/);
    expect(errorsOf({ ...grid, rows: ["....", "....", "...."], keys: {} })).toEqual(["$.rows: must draw at least one pixel"]);
    expect(errorsOf({ ...grid, origin: [0.5, 0] })).toEqual(["$.origin[0]: must be an integer from -1024 to 1024"]);
    expect(errorsOf({ ...grid, size: [0, 3] })).toContain("$.size[0]: must be an integer from 1 to 256");
    expect(errorsOf({ ...grid, d: "M0 0" })).toEqual(["$: has unknown field 'd'"]);
  });

  it("writes one canonical text that reads back to the same grid", () => {
    const text = serializePart(grid);
    expect(text.split("\n").slice(4, 6)).toEqual(['  "origin": [-2, -1],', '  "size": [4, 3],']);
    expect(JSON.parse(text)).toEqual(grid);
  });
});

describe("converting SVG cell art", () => {
  it("keeps each pixel's visible class, later paths painting over earlier ones, and names its keys readably", () => {
    const part = parsePart(svg(["part part--ink", "M-4 -2h2v2h-2z M-2 -2h2v2h-2z"], ["part part--fill", "M-2 -2h2v2h-2z"]), "pixel");
    expect(cellsToGrid(part)).toEqual({ format: "riglab.part", version: 1, bone: "head", origin: [-2, -1], size: [2, 1], rows: ["if"], keys: { i: "part part--ink", f: "part part--fill" } });
    const hidden = parsePart(svg(["part part--ink", "M0 0h2v2h-2z"], ["part part--fill", "M0 0h2v2h-2z"]), "pixel");
    expect(cellsToGrid(hidden).keys).toEqual({ f: "part part--fill" });
  });

  it("refuses cell art that breaks the old contract, so no grid is ever approximate", () => {
    const part = parsePart(svg(["part", "M0 0h2v2h-2z M1 0h2v2h-2z"]), "pixel");
    expect(pixelProblems(part)).toEqual(["path 1: cell at (1, 0) is off the even grid"]);
    expect(() => cellsToGrid(part)).toThrow("part 'head': path 1: cell at (1, 0) is off the even grid");
    expect(pixelProblems(parsePart(svg(["part", "M0 0h4v2h-4z"]), "pixel"))[0]).toMatch(/is not a 2×2 cell/);
  });

  it("converts only a pixel set's SVG parts, and refuses to overwrite a grid", () => {
    const head = "skins/pixel/head";
    const files = withChanges({ [`${head}.part.json`]: null, [`${head}.svg`]: svg(["part part--ink", "M0 0h2v2h-2z"]) });
    const conversion = convertPixelParts(files);
    expect(conversion.errors).toEqual([]);
    expect(conversion.removes).toEqual([`${head}.svg`]);
    expect(JSON.parse(conversion.writes[`${head}.part.json`]!).rows).toEqual(["i"]);
    expect(convertPixelParts(withChanges({ [`${head}.svg`]: svg(["part", "M0 0h2v2h-2z"]) })).errors)
      .toEqual([`${head}.part.json: already exists; remove it or ${head}.svg before converting`]);
    expect(convertPixelParts(placeholderFiles())).toEqual({ writes: {}, removes: [], errors: [] });
  });
});

describe("the loader", () => {
  const head = placeholderFiles()["skins/pixel/head.part.json"]!;

  it("reads the placeholder's pixel skin and weapons as grids, and its other skins as SVG", () => {
    const loaded = loadLibrary(placeholderFiles());
    expect(loaded.ok && loaded.value.skins.map((skin) => [skin.name, skin.palette.pixel ?? false])).toEqual([["plain", false], ["block", false], ["pixel", true]]);
    expect(loaded.ok && loaded.value.weapons.every((weapon) => weapon.palette.pixel)).toBe(true);
    expect(loaded.ok && pixelProblems(loaded.value.skins[2]!.parts["chibi_head"]!)).toEqual([]);
  });

  it("names the converter for SVG cell art in a pixel set, and refuses a grid in a vector set", () => {
    expect(loadErrors({ "skins/pixel/head.part.json": null, "skins/pixel/head.svg": svg(["part", "M0 0h2v2h-2z"]) })).toEqual([
      "skins/pixel/head.svg: is SVG cell art, but a pixel set's parts are riglab.part grids; convert it with 'npm run convert:parts -- <library-folder>'",
    ]);
    expect(loadErrors({ "skins/plain/head.part.json": head })).toEqual(["skins/plain/head.part.json: is a pixel part, but skins/plain/palette.json is not a pixel palette"]);
  });

  it("refuses a malformed grid, another bone and an undefined class, by file and path", () => {
    const edit = (change: object) => ({ "skins/pixel/head.part.json": JSON.stringify({ ...JSON.parse(head), ...change }) });
    expect(loadErrors(edit({ size: [1, 1] }))[0]).toMatch(/^skins\/pixel\/head\.part\.json: \$\.rows: must hold 1 rows/);
    expect(loadErrors(edit({ bone: "torso" }))).toEqual(["skins/pixel/head.part.json: bone 'torso' must be 'head'"]);
    const keys = JSON.parse(head).keys as Record<string, string>;
    const [first] = Object.keys(keys);
    expect(loadErrors(edit({ keys: { ...keys, [first!]: "part part--gold" } }))).toEqual(["skins/pixel/head.part.json: class 'part--gold' is not defined in skins/pixel/palette.json"]);
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
