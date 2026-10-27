// The published schemas, and the documents they are held to: every library folder's files with the validator verdict
// each gets, and every file export writes for the placeholder library, armed and unarmed.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { libraryModel } from "../../src/editor/model";
import type { LibraryModel } from "../../src/editor/model";
import { buildBundle } from "../../src/export/bundle";
import { buildSkinBundles } from "../../src/export/skin";
import { validateAnimation, validateHold, validatePalette, validatePart, validateRig, validateWeapon } from "../../src/format";
import type { RigLabRig, RigLabWeapon, Validation } from "../../src/format";
import { LIBRARY } from "../../src/library/active";
import { heldAnimation } from "../format/weapon-fixtures";
import { readFolder } from "../library/placeholder";
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

/** Library folders whose documents the schemas must accept: the placeholder, and the conformance library once it exists. */
export const LIBRARIES = ["placeholder-library", "conformance/library"].filter((folder) => existsSync(join(ROOT, folder)));

export interface LibraryDocument {
  readonly path: string;
  readonly format: Format;
  readonly value: unknown;
  readonly verdict: Validation<unknown>;
}

/** A library folder's format documents, each with the verdict of its validator against the folder's own rig and weapons. */
export function libraryDocuments(folder: string): LibraryDocument[] {
  const files = readFolder(join(ROOT, folder));
  const parsed = (path: string): any => JSON.parse(files[path]!);
  const paths = Object.keys(files).sort();
  const rigs = paths.filter((path) => /^rigs\/[^/]+\.rig\.json$/.test(path));
  const rig = parsed(rigs[0]!) as RigLabRig;
  const weaponPaths = paths.filter((path) => /^weapons\/[^/]+\/weapon\.json$/.test(path));
  const weapons = new Map(weaponPaths.map((path) => [path.split("/")[1]!, parsed(path) as RigLabWeapon]));
  const documents: LibraryDocument[] = [];
  const add = (path: string, format: Format, check: (value: unknown) => Validation<unknown>): void => {
    const value = parsed(path);
    documents.push({ path: `${folder}/${path}`, format, value, verdict: check(value) });
  };
  for (const path of rigs) add(path, "riglab.rig", validateRig);
  for (const path of paths) {
    if (/^animations\/[^/]+\.anim\.json$/.test(path)) add(path, "riglab.anim", (value) => validateAnimation(value, rig, [...weapons.values()]));
    else if (weaponPaths.includes(path)) add(path, "riglab.weapon", (value) => validateWeapon(value, rig));
    else if (/^weapons\/[^/]+\/hold\.json$/.test(path)) add(path, "riglab.hold", (value) => validateHold(value, weapons.get(path.split("/")[1]!)!));
    else if (/\/palette\.json$/.test(path)) add(path, "riglab.palette", validatePalette);
    else if (/\.part\.json$/.test(path)) add(path, "riglab.part", validatePart);
  }
  return documents;
}

const held = (name: string) => LIBRARY.weapons.find((item) => item.name === name)!;

/** The placeholder library's model, and the same with a daggers idle (riding bodies) and a sword attack (a free body). */
export function exportModels(): readonly LibraryModel[] {
  const model = libraryModel(LIBRARY);
  const daggers = heldAnimation(LIBRARY.rig, held("daggers").weapon, held("daggers").hold, "idle");
  const sword = heldAnimation(LIBRARY.rig, held("sword").weapon, held("sword").hold, "attack");
  return [model, { ...model, animations: [...model.animations, daggers, sword] }];
}

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

const decoder = new TextDecoder("utf-8", { fatal: true });

/** Every file export writes for one model: its animation bundle, baked, keyed by path under `riglab-export/`. */
export async function exportedFiles(model: LibraryModel): Promise<ReadonlyMap<string, Uint8Array>> {
  return buildBundle(model, { baked: true, generator: "RigLab test" });
}

/** Every pixel skin and weapon bundle, keyed by path under `riglab-skins/`. */
export async function skinFiles(): Promise<ReadonlyMap<string, Uint8Array>> {
  return (await buildSkinBundles(LIBRARY, "RigLab test")).files;
}

export const parse = (bytes: Uint8Array): unknown => JSON.parse(decoder.decode(bytes));

/** The schema files `schemas/` holds. */
export const publishedFiles = (): string[] => readdirSync(SCHEMAS).sort();
