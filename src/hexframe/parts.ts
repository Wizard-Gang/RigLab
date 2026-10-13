// Hexframe's eleven machine-generated part SVGs, parsed as data. Nothing here ever becomes markup.
import armLowerL from "../../vendor/hexframe/characters/fighter/parts/arm_lower_l.svg?raw";
import armLowerR from "../../vendor/hexframe/characters/fighter/parts/arm_lower_r.svg?raw";
import armUpperL from "../../vendor/hexframe/characters/fighter/parts/arm_upper_l.svg?raw";
import armUpperR from "../../vendor/hexframe/characters/fighter/parts/arm_upper_r.svg?raw";
import head from "../../vendor/hexframe/characters/fighter/parts/head.svg?raw";
import legLowerL from "../../vendor/hexframe/characters/fighter/parts/leg_lower_l.svg?raw";
import legLowerR from "../../vendor/hexframe/characters/fighter/parts/leg_lower_r.svg?raw";
import legUpperL from "../../vendor/hexframe/characters/fighter/parts/leg_upper_l.svg?raw";
import legUpperR from "../../vendor/hexframe/characters/fighter/parts/leg_upper_r.svg?raw";
import pelvis from "../../vendor/hexframe/characters/fighter/parts/pelvis.svg?raw";
import torso from "../../vendor/hexframe/characters/fighter/parts/torso.svg?raw";

export interface PartPath {
  /** Space-separated class tokens, each a lowercase word such as `part`, `part--skin` or `detail`. */
  readonly className: string;
  /** SVG path data: commands, numbers, spaces, commas and signs only. */
  readonly d: string;
}

export interface Part {
  /** The bone Hexframe drew this part on. */
  readonly bone: string;
  readonly paths: readonly PartPath[];
}

const ROOT = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" data-bone="([a-z][a-z0-9-]*)">([\s\S]*)<\/svg>\s*$/;
const PATH = /<path class="([a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*)" d="([MmLlHhVvCcSsQqTtAaZz0-9 .,-]+)"\/>/y;

/**
 * Accept exactly Hexframe's part shape: one svg root naming its bone, holding only `<path class d/>`
 * elements with conservative attribute values. Anything else is refused rather than rendered.
 */
export function parsePart(markup: string): Part {
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
  return { bone: root[1]!, paths };
}

/** Parts keyed by art slot: a rig binds art through each bone's `slot`, not its name. */
export const HEXFRAME_PARTS: Readonly<Record<string, Part>> = Object.freeze(Object.fromEntries(Object.entries({
  arm_lower_l: armLowerL,
  arm_lower_r: armLowerR,
  arm_upper_l: armUpperL,
  arm_upper_r: armUpperR,
  head,
  leg_lower_l: legLowerL,
  leg_lower_r: legLowerR,
  leg_upper_l: legUpperL,
  leg_upper_r: legUpperR,
  pelvis,
  torso,
}).map(([slot, markup]) => [slot, parsePart(markup)])));
