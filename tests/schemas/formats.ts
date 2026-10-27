// The published schemas by format, and the format of each file export writes: no library is loaded here, so plain Node
// scripts can use them as well as the suite.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compile } from "./evaluate";
import type { Compiled } from "./evaluate";

export const ROOT = join(import.meta.dirname, "../..");
export const SCHEMAS = join(ROOT, "schemas");

/** Every consumer format and its published version. */
export const FORMATS = {
  "riglab.export": 2,
  "riglab.skin": 1,
  "riglab.rig": 2,
  "riglab.anim": 3,
  "riglab.weapon": 1,
  "riglab.hold": 1,
  "riglab.palette": 1,
  "riglab.part": 1,
  "riglab.baked": 1,
} as const;
export type Format = keyof typeof FORMATS;

export const schemaFile = (format: Format): string => `${format}.v${FORMATS[format]}.schema.json`;
export const readSchema = (format: Format): Record<string, any> => JSON.parse(readFileSync(join(SCHEMAS, schemaFile(format)), "utf8"));
export const SCHEMA: Readonly<Record<Format, Compiled>> = Object.fromEntries(
  (Object.keys(FORMATS) as Format[]).map((format) => [format, compile(readSchema(format), format)]),
) as Record<Format, Compiled>;

/** The format of a file export writes, by its path under `riglab-export/` or `riglab-skins/`. */
export function writtenFormat(path: string): Format {
  const rules: readonly (readonly [RegExp, Format])[] = [
    [/^manifest\.json$/, "riglab.export"],
    [/^[^/]+\.rig\.json$/, "riglab.rig"],
    [/^animations\/[^/]+\.anim\.json$/, "riglab.anim"],
    [/^weapons\/[^/]+\.weapon\.json$/, "riglab.weapon"],
    [/^weapons\/[^/]+\.hold\.json$/, "riglab.hold"],
    [/^baked\/[^/]+\.baked\.json$/, "riglab.baked"],
    [/^(?:skins|weapons)\/[^/]+\/manifest\.json$/, "riglab.skin"],
    [/^(?:skins|weapons)\/[^/]+\/palette\.json$/, "riglab.palette"],
    [/^(?:skins|weapons)\/[^/]+\/parts\/[^/]+\.part\.json$/, "riglab.part"],
  ];
  const rule = rules.find(([pattern]) => pattern.test(path));
  if (!rule) throw new Error(`export wrote '${path}', which no schema covers`);
  return rule[1];
}
