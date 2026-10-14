// riglab-export bundles: a manifest that pins every file by SHA-256, the rig, its animations, the weapons they hold and
// optional baked frames.
import type { RigLabDocument } from "../format/document";
import { bakeAnimation } from "./bake";

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
  /** The weapon rigs the animations hold; omitted when they hold none. */
  readonly weapons?: readonly FileEntry[];
  readonly baked?: readonly BakedEntry[];
}

const encoder = new TextEncoder();
const json = (value: unknown): Uint8Array => encoder.encode(`${JSON.stringify(value, null, 2)}\n`);

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** File names come from validated rig and animation names, so they are always safe relative paths. */
export const rigFile = (name: string): string => `${name}.rig.json`;
export const animationFile = (name: string): string => `animations/${name}.anim.json`;
export const bakedFile = (name: string): string => `baked/${name}.baked.json`;
export const weaponFile = (name: string): string => `weapons/${name}.weapon.json`;

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
  const weapons: FileEntry[] = [];
  for (const weapon of document.weapons ?? []) {
    weapons.push({ name: weapon.name, file: weaponFile(weapon.name), sha256: await add(weaponFile(weapon.name), weapon) });
  }
  const baked: BakedEntry[] = [];
  if (options.baked) {
    for (const animation of document.animations) {
      const bake = bakeAnimation(document.rig, animation, document.weapons);
      baked.push({ animation: animation.name, file: bakedFile(animation.name), sha256: await add(bakedFile(animation.name), bake) });
    }
  }
  const manifest: Manifest = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    generator: options.generator,
    rig,
    animations,
    ...(weapons.length ? { weapons } : {}),
    ...(options.baked ? { baked } : {}),
  };
  return new Map([[MANIFEST, json(manifest)], ...files]);
}
