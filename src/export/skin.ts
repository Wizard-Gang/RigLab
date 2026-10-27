// riglab.skin bundles: one pixel art set, a skin or a weapon's art, as a manifest naming the rig it fits and pinning its
// palette and one riglab.part per slot (or per weapon body) by size and SHA-256. Vector sets are editor-only.
import { PALETTE_FILE } from "../format/palette";
import { PART_EXTENSION, serializePart } from "../format/part";
import type { ArtSet } from "../library/art";
import type { Library } from "../library/load";
import { slotStem } from "../library/files";
import { MANIFEST, sha256 } from "./bundle";
import type { Pinned } from "./bundle";

export const SKIN_FORMAT = "riglab.skin";
export const SKIN_VERSION = 1;
/** The folder every skin bundle is written into, beside `riglab-export/`: one bundle per directory under it. */
export const SKINS_ROOT = "riglab-skins";

export type SkinKind = "skin" | "weapon";

/** A skin's part on one rig slot. */
export interface SkinPart extends Pinned {
  readonly slot: string;
}

/** A weapon body's part; bodies that share a slot, as the daggers do, share its file. */
export interface WeaponPart extends SkinPart {
  readonly body: string;
}

export interface SkinManifest {
  readonly format: typeof SKIN_FORMAT;
  readonly version: typeof SKIN_VERSION;
  readonly generator: string;
  /** The rig whose slots the parts draw. */
  readonly rig: string;
  readonly kind: SkinKind;
  /** The art set: the skin's or the weapon's config name. */
  readonly name: string;
  readonly palette: Pinned;
  /** A skin's parts in rig bone order, or a weapon's in body order. */
  readonly parts: readonly (SkinPart | WeaponPart)[];
}

/** The skin bundles a library exports, by path under `riglab-skins/`, and why each vector set is left out. */
export interface SkinBundles {
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly refused: readonly string[];
}

const encoder = new TextEncoder();
const json = (value: unknown): Uint8Array => encoder.encode(`${JSON.stringify(value, null, 2)}\n`);

/** Bundle directories come from validated config names, so they are always safe relative paths. */
export const skinDir = (kind: SkinKind, name: string): string => `${kind}s/${name}`;
export const skinPartFile = (slot: string): string => `parts/${slotStem(slot)}${PART_EXTENSION}`;

/** Why a vector set cannot export, naming it. */
export const vectorRefusal = (kind: SkinKind, name: string): string =>
  `${kind} '${name}' is vector art, which stays in the editor; only pixel sets export as riglab.skin`;

/** Build one pixel set's bundle, paths relative to its own root with the manifest first; a vector set throws its refusal. */
export async function buildSkinBundle(library: Library, kind: SkinKind, name: string, generator: string): Promise<Map<string, Uint8Array>> {
  const weapon = kind === "weapon" ? library.weapons.find((item) => item.name === name) : undefined;
  const set: ArtSet | undefined = kind === "skin" ? library.skins.find((item) => item.name === name) : weapon;
  if (!set) throw new Error(`the library has no ${kind} '${name}'`);
  const grids = set.grids;
  if (!grids) throw new Error(vectorRefusal(kind, name));
  const files = new Map<string, Uint8Array>();
  const add = async (file: string, bytes: Uint8Array): Promise<Pinned> => {
    if (!files.has(file)) files.set(file, bytes);
    return { file, sha256: await sha256(bytes), bytes: bytes.length };
  };
  const palette = await add(PALETTE_FILE, json(set.palette));
  const part = (slot: string): Promise<Pinned> => add(skinPartFile(slot), encoder.encode(serializePart(grids[slot]!)));
  const parts: (SkinPart | WeaponPart)[] = [];
  if (weapon) {
    for (const body of weapon.weapon.bodies) parts.push({ body: body.name, slot: body.slot, ...await part(body.slot) });
  } else {
    for (const bone of library.rig.bones) parts.push({ slot: bone.slot, ...await part(bone.slot) });
  }
  const manifest: SkinManifest = { format: SKIN_FORMAT, version: SKIN_VERSION, generator, rig: library.rig.name, kind, name, palette, parts };
  return new Map([[MANIFEST, json(manifest)], ...files]);
}

/** Every pixel skin, then every pixel weapon, in config order, each under its own directory; vector sets are refused by name. */
export async function buildSkinBundles(library: Library, generator: string): Promise<SkinBundles> {
  const files = new Map<string, Uint8Array>();
  const refused: string[] = [];
  const sets = [...library.skins.map((set) => ["skin", set] as const), ...library.weapons.map((set) => ["weapon", set] as const)];
  for (const [kind, set] of sets) {
    if (!set.grids) {
      refused.push(vectorRefusal(kind, set.name));
      continue;
    }
    const dir = skinDir(kind, set.name);
    for (const [path, bytes] of await buildSkinBundle(library, kind, set.name, generator)) files.set(`${dir}/${path}`, bytes);
  }
  return { files, refused };
}
