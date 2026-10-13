// Part art parsed as data; nothing here ever becomes markup.

export interface PartPath {
  /** Space-separated class tokens, each a lowercase word such as `part`, `part--skin` or `detail`. */
  readonly className: string;
  /** SVG path data: commands, numbers, spaces, commas and signs only. */
  readonly d: string;
}

export interface Part {
  /** The bone the part was drawn for. */
  readonly bone: string;
  /** The art set it belongs to, such as `chibi`; each set has its own palette. */
  readonly set: string;
  readonly paths: readonly PartPath[];
}

const ROOT = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" data-bone="([a-z][a-z0-9-]*)">([\s\S]*)<\/svg>\s*$/;
const PATH = /<path class="([a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*)" d="([MmLlHhVvCcSsQqTtAaZz0-9 .,-]+)"\/>/y;

/**
 * Accept exactly Hexframe's part shape: one svg root naming its bone, holding only `<path class d/>`
 * elements with conservative attribute values. Anything else is refused rather than rendered.
 */
export function parsePart(markup: string, set: string): Part {
  const root = ROOT.exec(markup);
  if (!root) throw new Error("part: expected one <svg> root with only xmlns and data-bone");
  const body = root[2]!;
  const paths: PartPath[] = [];
  PATH.lastIndex = 0;
  while (PATH.lastIndex < body.length) {
    const at = PATH.lastIndex;
    const match = PATH.exec(body);
    if (!match || match.index !== at) throw new Error(`part '${root[1]}': unexpected content at ${at}`);
    paths.push({ className: match[1]!, d: match[2]! });
  }
  if (!paths.length) throw new Error(`part '${root[1]}': has no paths`);
  return { bone: root[1]!, set, paths };
}
