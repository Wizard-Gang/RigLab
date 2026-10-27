// The published schemas, and the documents they are held to: every library folder's files with the validator verdict
// each gets, and every file export writes for the placeholder library, armed and unarmed.
import { existsSync, readdirSync } from "node:fs";
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
import { ROOT, SCHEMAS } from "./formats";
import type { Format } from "./formats";

export { FORMATS, readSchema, ROOT, SCHEMA, SCHEMAS, schemaFile, writtenFormat } from "./formats";
export type { Format } from "./formats";

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
