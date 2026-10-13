// The pixel-art contract (docs/SVGPIXELART.md): a pixel set's paths are only separate 2×2-unit cells on an even grid.
import type { Part } from "../hexframe/parts";

/** One cell: `M{x} {y}h2v2h-2z`, with integer `x` and `y`. Cells are joined by single spaces. */
const CELL = /M(-?\d+) (-?\d+)h2v2h-2z/y;

/** Every way a part breaks the contract, each naming the path (1-based) and where its data goes wrong. */
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
