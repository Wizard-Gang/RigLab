// riglab-export bundles: a manifest that pins every file by size and SHA-256, the rig with its resolved paint order, its
// animations, the weapons they hold with their holds, and optional baked frames.
import { heldWeapons, weaponRigs } from "../editor/model";
import type { LibraryModel } from "../editor/model";
import { HOLD_FORMAT, HOLD_VERSION } from "../format/hold";
import { withPaintOrder } from "../format/rig";
import type { RigLabRig } from "../format/rig";
import { isFree } from "../format/weapon";
import { bakeAnimation } from "./bake";

export const EXPORT_FORMAT = "riglab.export";
export const EXPORT_VERSION = 2;
export const EXPORT_ROOT = "riglab-export";
export const MANIFEST = "manifest.json";

/** A file in the bundle, pinned by its byte length and SHA-256. */
export interface Pinned {
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface FileEntry extends Pinned {
  readonly name: string;
}

/** A held weapon, with its `riglab.hold` file when it has free bodies; a weapon whose bodies all ride a hand has none. */
export interface WeaponEntry extends FileEntry {
  readonly hold?: Pinned;
}

export interface BakedEntry extends Pinned {
  readonly animation: string;
}

export interface Manifest {
  readonly format: typeof EXPORT_FORMAT;
  readonly version: typeof EXPORT_VERSION;
  readonly generator: string;
  readonly rig: FileEntry;
  readonly animations: readonly FileEntry[];
  /** The weapon rigs the animations hold; omitted when they hold none. */
  readonly weapons?: readonly WeaponEntry[];
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
export const holdFile = (name: string): string => `weapons/${name}.hold.json`;

/** The rig as exported: its paint order's `byClip` also maps each animation to its class's profile, as Hexframe's export does. */
export const exportedRig = (model: LibraryModel): RigLabRig => withPaintOrder(model.rig, model.animations);

/** Build a bundle of the model's rig, its animations and the weapons they hold; paths are relative to its root, with the manifest first. */
export async function buildBundle(model: LibraryModel, options: { readonly baked: boolean; readonly generator: string }): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const add = async (file: string, value: unknown): Promise<Pinned> => {
    const bytes = json(value);
    files.set(file, bytes);
    return { file, sha256: await sha256(bytes), bytes: bytes.length };
  };
  const rig = { name: model.rig.name, ...await add(rigFile(model.rig.name), exportedRig(model)) };
  const animations: FileEntry[] = [];
  for (const animation of model.animations) animations.push({ name: animation.name, ...await add(animationFile(animation.name), animation) });
  const weapons: WeaponEntry[] = [];
  for (const weapon of heldWeapons(model)) {
    const entry = { name: weapon.name, ...await add(weaponFile(weapon.name), weapon) };
    const hold = model.weapons.find((item) => item.weapon.name === weapon.name)!.hold;
    weapons.push(weapon.bodies.some(isFree) ? { ...entry, hold: await add(holdFile(weapon.name), { format: HOLD_FORMAT, version: HOLD_VERSION, ...hold }) } : entry);
  }
  const baked: BakedEntry[] = [];
  if (options.baked) {
    for (const animation of model.animations) {
      const bake = bakeAnimation(model.rig, animation, weaponRigs(model));
      baked.push({ animation: animation.name, ...await add(bakedFile(animation.name), bake) });
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
