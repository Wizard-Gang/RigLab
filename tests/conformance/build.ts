// The conformance fixtures: a fresh export of conformance/library, and invalid cases, each one defect in a committed
// file with the `{jsonPath, reason}` a reader must report. `npm run export:conformance` writes both and the index; the
// suite holds what is committed to them. No library is loaded through Vite here, so a plain Node script can run it.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { libraryModel } from "../../src/editor/model";
import { buildBundle, EXPORT_ROOT, MANIFEST } from "../../src/export/bundle";
import { buildSkinBundles, SKINS_ROOT } from "../../src/export/skin";
import { validateAnimation, validateHold, validatePalette, validatePart, validateRig, validateWeapon } from "../../src/format";
import type { Validation } from "../../src/format";
import { readLibraryFolder } from "../../src/library/folder";
import { loadLibrary } from "../../src/library/load";
import type { Library } from "../../src/library/load";
import { validate } from "../schemas/evaluate";
import { ROOT, SCHEMA, writtenFormat } from "../schemas/formats";
import type { Format } from "../schemas/formats";

export const CONFORMANCE = join(ROOT, "conformance");
export const LIBRARY_DIR = join(CONFORMANCE, "library");
export const EXPORT_DIR = join(CONFORMANCE, "export");
export const INVALID_DIR = join(CONFORMANCE, "invalid");
export const CASES = join(CONFORMANCE, "cases.json");
export const GENERATOR = "RigLab conformance";

/** What a reader reports: a JSON path and a reason, a schema keyword, `bytes` or `sha256` for a pin that disagrees with
 * the file it names, `file` for a pin naming no file, or `reference` for a name the bundle's own documents do not hold. */
export interface Defect {
  readonly jsonPath: string;
  readonly reason: string;
}

export interface Entry {
  /** Repository-relative, like MapLab's. */
  readonly file: string;
  readonly sha256: string;
  /** Absent only for the library's `config.txt`. */
  readonly format?: Format;
  /** A manifest's bundle directory, repository-relative: the files its pins name. */
  readonly bundle?: string;
  readonly expect: { readonly valid: true } | Defect;
}

const encoder = new TextEncoder();
export const digest = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const repo = (path: string): string => relative(ROOT, path).split(sep).join("/");

/** The conformance library, read and loaded as `check:library` does. */
export function loadConformanceLibrary(): Library {
  const read = readLibraryFolder(LIBRARY_DIR);
  const loaded = read.errors.length ? null : loadLibrary(read.files);
  if (!loaded?.ok) throw new Error(`conformance/library did not load:\n${(loaded && !loaded.ok ? loaded.errors : read.errors).join("\n")}`);
  return loaded.value;
}

/** Both bundles as export writes them, baked, keyed by path under `conformance/export/`; every set must be pixel art. */
export async function freshExport(library: Library): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  for (const [path, bytes] of await buildBundle(libraryModel(library), { baked: true, generator: GENERATOR })) files.set(`${EXPORT_ROOT}/${path}`, bytes);
  const skins = await buildSkinBundles(library, GENERATOR);
  if (skins.refused.length) throw new Error(skins.refused.join("\n"));
  for (const [path, bytes] of skins.files) files.set(`${SKINS_ROOT}/${path}`, bytes);
  return files;
}

/** Every file under `dir`, keyed by its `/`-separated path relative to it. */
export function readTree(dir: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) files.set(relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"), readFileSync(join(entry.parentPath, entry.name)));
  }
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Each pin of an export or skin manifest, by its JSON path. */
function pins(manifest: any): [string, any][] {
  if (manifest.format === "riglab.skin") return [["$.palette", manifest.palette], ...manifest.parts.map((part: any, i: number) => [`$.parts[${i}]`, part])];
  return [
    ["$.rig", manifest.rig],
    ...manifest.animations.map((entry: any, i: number) => [`$.animations[${i}]`, entry]),
    ...(manifest.weapons ?? []).flatMap((entry: any, i: number) => [[`$.weapons[${i}]`, entry], ...(entry.hold ? [[`$.weapons[${i}].hold`, entry.hold]] : [])]),
    ...(manifest.baked ?? []).map((entry: any, i: number) => [`$.baked[${i}]`, entry]),
  ];
}

/** Every pin of a manifest that disagrees with the bundle's own file. */
export function pinDefects(manifest: unknown, bundle: ReadonlyMap<string, Uint8Array>): Defect[] {
  return pins(manifest).flatMap(([path, pin]): Defect[] => {
    const bytes = bundle.get(pin.file);
    if (!bytes) return [{ jsonPath: `${path}.file`, reason: "file" }];
    return [
      ...(bytes.length === pin.bytes ? [] : [{ jsonPath: `${path}.bytes`, reason: "bytes" }]),
      ...(digest(bytes) === pin.sha256 ? [] : [{ jsonPath: `${path}.sha256`, reason: "sha256" }]),
    ];
  });
}

/** The validator of a library format, against the conformance library's rig and weapons; the writer formats have none. */
export function validatorOf(format: Format, library: Library): ((value: any) => Validation<unknown>) | undefined {
  const weapons = library.weapons.map((item) => item.weapon);
  const weapon = (name: unknown) => weapons.find((item) => item.name === name) ?? weapons[0]!;
  return {
    "riglab.rig": validateRig,
    "riglab.anim": (value: unknown) => validateAnimation(value, library.rig, weapons),
    "riglab.weapon": (value: unknown) => validateWeapon(value, library.rig),
    "riglab.hold": (value: any) => validateHold(value, weapon(value?.name)),
    "riglab.palette": validatePalette,
    "riglab.part": validatePart,
  }[format as string];
}

/** An error's JSON path: validator messages read `<path>: <message>`. */
export const errorPath = (error: string): string => error.slice(0, error.indexOf(": "));

/**
 * What a reader finds wrong with a document: its schema violations; else, for a manifest, every pin that disagrees with
 * its bundle; else, for a library format, every path its validator refuses, as a `reference`.
 */
export function defects(format: Format, value: unknown, library: Library, bundle?: ReadonlyMap<string, Uint8Array>): Defect[] {
  const schema = validate(SCHEMA[format], value).map((violation) => ({ jsonPath: violation.path, reason: violation.keyword }));
  if (schema.length) return schema;
  if (bundle) return pinDefects(value, bundle);
  const verdict = validatorOf(format, library)?.(value);
  return verdict && !verdict.ok ? verdict.errors.map((error) => ({ jsonPath: errorPath(error), reason: "reference" })) : [];
}

/** One defect in a committed file: its base under `conformance/`, the change, and what a reader must report. */
export interface InvalidCase {
  readonly name: string;
  readonly format: Format;
  readonly base: string;
  /** For a pin defect: the bundle directory under `conformance/` its manifest pins. */
  readonly bundle?: string;
  readonly change: (value: any) => void;
  readonly expect: Defect;
}

const EXPORTED = "export/riglab-export";
const SKIN = "export/riglab-skins/skins/pixel";
const at = (jsonPath: string, reason: string): Defect => ({ jsonPath, reason });

export const INVALID: readonly InvalidCase[] = [
  { name: "export-version", format: "riglab.export", base: `${EXPORTED}/manifest.json`, change: (v) => { v.version = 1; }, expect: at("$.version", "const") },
  { name: "export-unknown-member", format: "riglab.export", base: `${EXPORTED}/manifest.json`, change: (v) => { v.extra = true; }, expect: at("$.extra", "additionalProperties") },
  { name: "export-rig-sha256", format: "riglab.export", base: `${EXPORTED}/manifest.json`, bundle: EXPORTED, change: (v) => { v.rig.sha256 = "0".repeat(64); }, expect: at("$.rig.sha256", "sha256") },
  { name: "export-animation-bytes", format: "riglab.export", base: `${EXPORTED}/manifest.json`, bundle: EXPORTED, change: (v) => { v.animations[0].bytes += 1; }, expect: at("$.animations[0].bytes", "bytes") },
  { name: "export-hold-file", format: "riglab.export", base: `${EXPORTED}/manifest.json`, bundle: EXPORTED, change: (v) => { v.weapons[0].hold.file = "weapons/spear.hold.json"; }, expect: at("$.weapons[0].hold.file", "file") },
  { name: "skin-palette-pin-member", format: "riglab.skin", base: `${SKIN}/manifest.json`, change: (v) => { delete v.palette.bytes; }, expect: at("$.palette.bytes", "required") },
  { name: "skin-part-sha256", format: "riglab.skin", base: `${SKIN}/manifest.json`, bundle: SKIN, change: (v) => { v.parts[0].sha256 = "f".repeat(64); }, expect: at("$.parts[0].sha256", "sha256") },
  { name: "rig-bone-slot", format: "riglab.rig", base: `${EXPORTED}/chibi.rig.json`, change: (v) => { delete v.bones[0].slot; }, expect: at("$.bones[0].slot", "required") },
  { name: "anim-fps", format: "riglab.anim", base: `${EXPORTED}/animations/unarmed-walk.anim.json`, change: (v) => { v.fps = 30; }, expect: at("$.fps", "const") },
  { name: "anim-key-unknown-member", format: "riglab.anim", base: `${EXPORTED}/animations/unarmed-walk.anim.json`, change: (v) => { v.keys[1].weight = 1; }, expect: at("$.keys[1].weight", "additionalProperties") },
  { name: "anim-interpolation", format: "riglab.anim", base: `${EXPORTED}/animations/unarmed-walk.anim.json`, change: (v) => { v.keys[0].interpolation = "cubic"; }, expect: at("$.keys[0].interpolation", "enum") },
  { name: "anim-unknown-bone", format: "riglab.anim", base: `${EXPORTED}/animations/unarmed-walk.anim.json`, change: (v) => { v.keys[0].pose.tail = { rotation: 0 }; }, expect: at("$.keys[0].pose", "reference") },
  { name: "anim-pin-member", format: "riglab.anim", base: `${EXPORTED}/animations/unarmed-attack.anim.json`, change: (v) => { delete v.keys[0].pins[0].y; }, expect: at("$.keys[0].pins[0].y", "required") },
  { name: "anim-pin-gripped-chain", format: "riglab.anim", base: `${EXPORTED}/animations/sword-attack.anim.json`, change: (v) => { v.keys[0].pins = [{ chain: "arm-front", x: 0, y: 0 }]; }, expect: at("$.keys[0].pins[0].chain", "reference") },
  { name: "anim-free-body-missing", format: "riglab.anim", base: `${EXPORTED}/animations/sword-attack.anim.json`, change: (v) => { v.keys[2].bodies = []; }, expect: at("$.keys[2].bodies", "reference") },
  { name: "anim-riding-body-placed", format: "riglab.anim", base: `${EXPORTED}/animations/daggers-idle.anim.json`, change: (v) => { v.keys[0].bodies = [{ body: "dagger-front", x: 0, y: 0, rotation: 0 }]; }, expect: at("$.keys[0].bodies", "reference") },
  { name: "weapon-grip-chain", format: "riglab.weapon", base: `${EXPORTED}/weapons/sword.weapon.json`, change: (v) => { v.bodies[0].grips[0].chain = "tail"; }, expect: at("$.bodies[0].grips[0].chain", "reference") },
  { name: "weapon-name-pattern", format: "riglab.weapon", base: `${EXPORTED}/weapons/sword.weapon.json`, change: (v) => { v.name = "9sword"; }, expect: at("$.name", "pattern") },
  { name: "hold-rotation-type", format: "riglab.hold", base: `${EXPORTED}/weapons/sword.hold.json`, change: (v) => { v.bodies[0].rotation = "55"; }, expect: at("$.bodies[0].rotation", "type") },
  { name: "baked-transform", format: "riglab.baked", base: `${EXPORTED}/baked/unarmed-walk.baked.json`, change: (v) => { v.frames[0][0] = [0, 0]; }, expect: at("$.frames[0][0]", "minItems") },
  { name: "palette-format", format: "riglab.palette", base: `${SKIN}/palette.json`, change: (v) => { v.format = "riglab.colors"; }, expect: at("$.format", "const") },
  { name: "part-version", format: "riglab.part", base: `${SKIN}/parts/head.part.json`, change: (v) => { v.version = 2; }, expect: at("$.version", "const") },
];

const json = (value: unknown): Uint8Array => encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
export const invalidFile = (name: string): string => join(INVALID_DIR, `${name}.json`);
const parseFile = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

/** Every fixture under `conformance/` but this index and the README, in path order, with its digest and expectation. */
export function indexEntries(): Entry[] {
  const invalid = new Map(INVALID.map((item) => [repo(invalidFile(item.name)), item]));
  return [...readTree(CONFORMANCE)].filter(([path]) => path !== "cases.json" && path !== "README.md").map(([path, bytes]): Entry => {
    const file = `conformance/${path}`;
    const item = invalid.get(file);
    if (item) return { file, sha256: digest(bytes), format: item.format, ...(item.bundle ? { bundle: `conformance/${item.bundle}` } : {}), expect: item.expect };
    const exported = /^export\/(riglab-export|riglab-skins)\/(.+)$/.exec(path);
    const format = exported ? writtenFormat(exported[2]!) : libraryFormat(path);
    const bundle = format === "riglab.export" || format === "riglab.skin" ? { bundle: dirname(file) } : {};
    return { file, sha256: digest(bytes), ...(format ? { format } : {}), ...bundle, expect: { valid: true } };
  });
}

/** A library file's format, by its path under `conformance/`; `config.txt` has none. */
function libraryFormat(path: string): Format | undefined {
  if (path === "library/config.txt") return undefined;
  const rules: readonly (readonly [RegExp, Format])[] = [
    [/^library\/rigs\/[^/]+\.rig\.json$/, "riglab.rig"],
    [/^library\/animations\/[^/]+\.anim\.json$/, "riglab.anim"],
    [/^library\/weapons\/[^/]+\/weapon\.json$/, "riglab.weapon"],
    [/^library\/weapons\/[^/]+\/hold\.json$/, "riglab.hold"],
    [/^library\/(?:skins|weapons)\/[^/]+\/palette\.json$/, "riglab.palette"],
    [/^library\/(?:skins|weapons)\/[^/]+\/[^/]+\.part\.json$/, "riglab.part"],
  ];
  const rule = rules.find(([pattern]) => pattern.test(path));
  if (!rule) throw new Error(`conformance/${path} is no fixture`);
  return rule[1];
}

/** Rewrite `conformance/export/`, `conformance/invalid/` and the index; throws, writing no case, when any case finds other than its one defect. */
export async function writeConformance(): Promise<string[]> {
  const library = loadConformanceLibrary();
  rmSync(EXPORT_DIR, { recursive: true, force: true });
  for (const [path, bytes] of await freshExport(library)) {
    mkdirSync(dirname(join(EXPORT_DIR, path)), { recursive: true });
    writeFileSync(join(EXPORT_DIR, path), bytes);
  }
  const built = INVALID.map((item) => {
    const value = parseFile(join(CONFORMANCE, item.base)) as any;
    item.change(value);
    const found = defects(item.format, value, library, item.bundle ? readTree(join(CONFORMANCE, item.bundle)) : undefined);
    return { item, value, found };
  });
  const wrong = built.filter(({ item, found }) => JSON.stringify(found) !== JSON.stringify([item.expect]));
  if (wrong.length) throw new Error(wrong.map(({ item, found }) => `${item.name}: found ${JSON.stringify(found)}`).join("\n"));
  rmSync(INVALID_DIR, { recursive: true, force: true });
  mkdirSync(INVALID_DIR, { recursive: true });
  for (const { item, value } of built) writeFileSync(invalidFile(item.name), json(value));
  const cases = indexEntries();
  const description = "RL-064 conformance fixtures. library/ is a RigLab library; export/ is its riglab-export bundle and riglab.skin bundles, "
    + "as export writes them; each invalid/ file is one committed file with exactly one defect, and the {jsonPath, reason} a reader must report.";
  writeFileSync(CASES, json({ description, generator: GENERATOR, cases }));
  return [`wrote ${cases.length} fixtures: ${cases.filter((entry) => "valid" in entry.expect).length} valid, ${INVALID.length} invalid`];
}
