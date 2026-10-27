// Pixel art (docs/PIXELART.md): a pixel set's parts are riglab.part grids, drawn as one 2×2 cell per pixel.
import { PART_FORMAT, PART_VERSION, partPixels, PIXEL_UNITS, TRANSPARENT } from "../format/part";
import type { RigLabPart } from "../format/part";
import type { Part, PartPath } from "../hexframe/parts";

const cell = (x: number, y: number): string => `M${x} ${y}h${PIXEL_UNITS}v${PIXEL_UNITS}h-${PIXEL_UNITS}z`;

/** A grid as the part the art layer draws: one path per key, in key order, holding that key's separate cells. */
export function gridPart(grid: RigLabPart, set: string): Part {
  const cells = new Map(Object.keys(grid.keys).map((key) => [key, [] as string[]]));
  for (const pixel of partPixels(grid)) cells.get(pixel.key)!.push(cell(pixel.x, pixel.y));
  const paths: PartPath[] = [...cells].map(([key, list]) => ({ className: grid.keys[key]!, d: list.join(" ") }));
  return { bone: grid.bone, set, paths };
}

/** One cell of the SVG cell art that grids replaced: `M{x} {y}h2v2h-2z`, with integer `x` and `y`. */
const CELL = /M(-?\d+) (-?\d+)h2v2h-2z/y;

/** Every way SVG cell art breaks the old pixel contract, each naming the path (1-based) and where its data goes wrong. */
export function pixelProblems(part: Part): readonly string[] {
  return part.paths.flatMap((path, index) => {
    const at = `path ${index + 1}`;
    const problems: string[] = [];
    const { d } = path;
    CELL.lastIndex = 0;
    while (CELL.lastIndex < d.length) {
      const from = CELL.lastIndex;
      const match = CELL.exec(d);
      if (!match) return [...problems, `${at}: '${d.slice(from, from + 24)}' at ${from} is not a 2×2 cell 'M{x} {y}h2v2h-2z'`];
      const [x, y] = [Number(match[1]), Number(match[2])];
      if (x % 2 !== 0 || y % 2 !== 0) problems.push(`${at}: cell at (${x}, ${y}) is off the even grid`);
      const next = CELL.lastIndex;
      if (next === d.length) break;
      if (d[next] !== " " || d[next + 1] !== "M") return [...problems, `${at}: cells must be separated by one space, at ${next}`];
      CELL.lastIndex = next + 1;
    }
    return problems;
  });
}

const FALLBACK_KEYS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** A readable key for a class list: a letter of its last token's name (`part--ink` → `i`), else the first free one. */
function keyFor(classes: string, taken: ReadonlySet<string>): string {
  const last = classes.split(" ").at(-1)!;
  const name = last.slice(last.lastIndexOf("-") + 1).toLowerCase();
  const free = [...name, ...name.toUpperCase(), ...FALLBACK_KEYS].find((char) => /[a-zA-Z0-9]/.test(char) && !taken.has(char));
  if (!free) throw new Error("part: more classes than grid keys");
  return free;
}

/**
 * SVG cell art as a grid, losslessly: later paths paint over earlier ones, as SVG draws them, so each pixel keeps the
 * class it showed. A class every pixel of which was painted over is dropped, as it never showed. Throws on cell art
 * that breaks the old contract, since such a part has no exact grid.
 */
export function cellsToGrid(part: Part): RigLabPart {
  const problems = pixelProblems(part);
  if (problems.length) throw new Error(`part '${part.bone}': ${problems.join("; ")}`);
  const shown = new Map<string, string>();
  for (const path of part.paths) {
    for (const [, x, y] of path.d.matchAll(/M(-?\d+) (-?\d+)/g)) shown.set(`${Number(x) / PIXEL_UNITS},${Number(y) / PIXEL_UNITS}`, path.className);
  }
  const pixels = [...shown].map(([at, classes]) => ({ at: at.split(",").map(Number) as [number, number], classes }));
  const xs = pixels.map(({ at }) => at[0]);
  const ys = pixels.map(({ at }) => at[1]);
  const [left, top] = [Math.min(...xs), Math.min(...ys)];
  const size: [number, number] = [Math.max(...xs) - left + 1, Math.max(...ys) - top + 1];
  const keys: Record<string, string> = {};
  const byClasses = new Map<string, string>();
  for (const path of part.paths) {
    if (byClasses.has(path.className) || !pixels.some((pixel) => pixel.classes === path.className)) continue;
    const key = keyFor(path.className, new Set(byClasses.values()));
    byClasses.set(path.className, key);
    keys[key] = path.className;
  }
  const rows = Array.from({ length: size[1] }, () => Array<string>(size[0]).fill(TRANSPARENT));
  for (const { at, classes } of pixels) rows[at[1] - top]![at[0] - left] = byClasses.get(classes)!;
  return { format: PART_FORMAT, version: PART_VERSION, bone: part.bone, origin: [left, top], size, rows: rows.map((row) => row.join("")), keys };
}
