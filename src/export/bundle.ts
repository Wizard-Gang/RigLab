// riglab-export bundles: a manifest that pins every file by SHA-256, the rig, its animations and optional baked frames.
import { validateAnimation } from "../format/animation";
import type { RigLabAnimation } from "../format/animation";
import { DOCUMENT_FORMAT, DOCUMENT_VERSION, validateDocument } from "../format/document";
import type { RigLabDocument } from "../format/document";
import { validateRig } from "../format/rig";
import { checkName, closedObject, Issues } from "../format/validate";
import type { Validation } from "../format/validate";
import { bakeAnimation, validateBaked } from "./bake";
import type { Files } from "./zip";

export const EXPORT_FORMAT = "riglab.export";
export const EXPORT_VERSION = 1;
export const EXPORT_ROOT = "riglab-export";
export const MANIFEST = "manifest.json";

export interface FileEntry {
  readonly name: string;
  readonly file: string;
  readonly sha256: string;
}

export interface BakedEntry {
  readonly animation: string;
  readonly file: string;
  readonly sha256: string;
}

export interface Manifest {
  readonly format: typeof EXPORT_FORMAT;
  readonly version: typeof EXPORT_VERSION;
  readonly generator: string;
  readonly rig: FileEntry;
  readonly animations: readonly FileEntry[];
  readonly baked?: readonly BakedEntry[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const json = (value: unknown): Uint8Array => encoder.encode(`${JSON.stringify(value, null, 2)}\n`);

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** File names come from validated rig and animation names, so they are always safe relative paths. */
export const rigFile = (name: string): string => `${name}.rig.json`;
export const animationFile = (name: string): string => `animations/${name}.anim.json`;
export const bakedFile = (name: string): string => `baked/${name}.baked.json`;

/** Build a bundle; paths are relative to its root, with the manifest first. */
export async function buildBundle(document: RigLabDocument, options: { readonly baked: boolean; readonly generator: string }): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const add = async (file: string, value: unknown): Promise<string> => {
    const bytes = json(value);
    files.set(file, bytes);
    return sha256(bytes);
  };
  const rig = { name: document.rig.name, file: rigFile(document.rig.name), sha256: await add(rigFile(document.rig.name), document.rig) };
  const animations: FileEntry[] = [];
  for (const animation of document.animations) {
    animations.push({ name: animation.name, file: animationFile(animation.name), sha256: await add(animationFile(animation.name), animation) });
  }
  const baked: BakedEntry[] = [];
  if (options.baked) {
    for (const animation of document.animations) {
      baked.push({ animation: animation.name, file: bakedFile(animation.name), sha256: await add(bakedFile(animation.name), bakeAnimation(document.rig, animation)) });
    }
  }
  const manifest: Manifest = {
    format: EXPORT_FORMAT, version: EXPORT_VERSION, generator: options.generator, rig, animations, ...(options.baked ? { baked } : {}),
  };
  return new Map([[MANIFEST, json(manifest)], ...files]);
}

/** Accept a bundle read from its root or from one enclosing folder, such as riglab-export/. */
function rooted(files: Files): Files {
  if (files.has(MANIFEST)) return files;
  const tops = new Set([...files.keys()].map((path) => path.split("/")[0]));
  const [top] = tops;
  if (tops.size !== 1 || !files.has(`${top}/${MANIFEST}`)) return files;
  return new Map([...files].map(([path, bytes]) => [path.slice(top!.length + 1), bytes]));
}

function validateManifest(issues: Issues, value: unknown): value is Manifest {
  const at = MANIFEST;
  if (!closedObject(issues, `${at} $`, value, ["format", "version", "generator", "rig", "animations"], ["baked"])) return false;
  if (value.format !== EXPORT_FORMAT) issues.add(`${at} $.format`, `must be '${EXPORT_FORMAT}'`);
  if (value.version !== EXPORT_VERSION) issues.add(`${at} $.version`, `must be ${EXPORT_VERSION}`);
  if (typeof value.generator !== "string" || !value.generator) issues.add(`${at} $.generator`, "must name the exporting program");
  const entry = (path: string, item: unknown, nameKey: "name" | "animation", file: (name: string) => string): void => {
    if (!closedObject(issues, path, item, [nameKey, "file", "sha256"])) return;
    if (!checkName(issues, `${path}.${nameKey}`, item[nameKey])) return;
    if (item.file !== file(item[nameKey] as string)) issues.add(`${path}.file`, `must be '${file(item[nameKey] as string)}'`);
    if (typeof item.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(item.sha256)) issues.add(`${path}.sha256`, "must be a lowercase SHA-256");
  };
  entry(`${at} $.rig`, value.rig, "name", rigFile);
  if (!Array.isArray(value.animations)) issues.add(`${at} $.animations`, "must be an array");
  else value.animations.forEach((item: unknown, index) => entry(`${at} $.animations[${index}]`, item, "name", animationFile));
  if (value.baked !== undefined) {
    if (!Array.isArray(value.baked)) issues.add(`${at} $.baked`, "must be an array");
    else value.baked.forEach((item: unknown, index) => entry(`${at} $.baked[${index}]`, item, "animation", bakedFile));
  }
  return issues.errors.length === 0;
}

function parse(issues: Issues, files: Files, file: string, where: string): unknown {
  const bytes = files.get(file);
  if (!bytes) {
    issues.add(where, `names missing file ${file}`);
    return undefined;
  }
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch (error) {
    issues.add(file, `is not valid UTF-8 JSON (${(error as Error).message})`);
    return undefined;
  }
}

/** Verify a bundle completely, then return the document it describes; nothing is trusted before its hash. */
export async function readBundle(input: Files): Promise<Validation<RigLabDocument>> {
  const files = rooted(input);
  const issues = new Issues();
  const manifest = parse(issues, files, MANIFEST, "bundle");
  if (manifest === undefined || !validateManifest(issues, manifest)) return issues.result(manifest);
  const entries: [string, FileEntry | BakedEntry][] = [
    [`${MANIFEST} $.rig`, manifest.rig],
    ...manifest.animations.map((entry, index): [string, FileEntry] => [`${MANIFEST} $.animations[${index}]`, entry]),
    ...(manifest.baked ?? []).map((entry, index): [string, BakedEntry] => [`${MANIFEST} $.baked[${index}]`, entry]),
  ];
  for (const [path, entry] of entries) {
    const bytes = files.get(entry.file);
    if (!bytes) issues.add(`${path}.file`, `names missing file ${entry.file}`);
    else if ((await sha256(bytes)) !== entry.sha256) issues.add(`${path}.sha256`, `does not match ${entry.file}`);
  }
  if (issues.errors.length) return issues.result(manifest);
  const nested = (file: string, errors: readonly string[]): void => {
    for (const error of errors) issues.errors.push(`${file} ${error}`);
  };
  const rig = validateRig(parse(issues, files, manifest.rig.file, `${MANIFEST} $.rig`));
  if (!rig.ok) {
    nested(manifest.rig.file, rig.errors);
    return issues.result(manifest);
  }
  if (rig.value.name !== manifest.rig.name) issues.add(`${manifest.rig.file} $.name`, `must be '${manifest.rig.name}' as the manifest says`);
  const animations: RigLabAnimation[] = [];
  for (const entry of manifest.animations) {
    const result = validateAnimation(parse(issues, files, entry.file, MANIFEST), rig.value);
    if (!result.ok) nested(entry.file, result.errors);
    else if (result.value.name !== entry.name) issues.add(`${entry.file} $.name`, `must be '${entry.name}' as the manifest says`);
    else animations.push(result.value);
  }
  for (const [index, entry] of (manifest.baked ?? []).entries()) {
    const animation = animations.find((candidate) => candidate.name === entry.animation);
    if (!animation) issues.add(`${MANIFEST} $.baked[${index}].animation`, `names no animation in the bundle`);
    else {
      const result = validateBaked(parse(issues, files, entry.file, MANIFEST), rig.value, animation);
      if (!result.ok) nested(entry.file, result.errors);
    }
  }
  if (issues.errors.length) return issues.result(manifest);
  const document = validateDocument({ format: DOCUMENT_FORMAT, version: DOCUMENT_VERSION, rig: rig.value, animations });
  if (!document.ok) nested("bundle", document.errors);
  return document.ok ? document : issues.result(manifest);
}
