// riglab.baked version 1: every frame's solved world transforms, for consumers that only draw.
import type { RigLabAnimation } from "../format/animation";
import type { RigLabRig } from "../format/rig";
import type { RigLabWeapon } from "../format/weapon";
import { bodyTransforms, engineOf, place, playAt } from "../solve";

export const BAKED_FORMAT = "riglab.baked";
export const BAKED_VERSION = 1;

/** A world transform: x, y and rotation in degrees, in rig space. */
export type Transform = readonly [number, number, number];

/** The held weapon on a frame: each of its bodies' world transforms by body name, riding bodies included. */
export interface BakedWeapon {
  readonly name: string;
  readonly bodies: Readonly<Record<string, Transform>>;
}

export interface RigLabBaked {
  readonly format: typeof BAKED_FORMAT;
  readonly version: typeof BAKED_VERSION;
  readonly rig: string;
  readonly animation: string;
  readonly fps: number;
  readonly loop: boolean;
  /** Bone order of every frame's transforms. */
  readonly bones: readonly string[];
  /** One entry per output frame: 0..length-1 when looping, 0..length otherwise. */
  readonly frames: readonly (readonly Transform[])[];
  /** The held weapon on each frame, or null; omitted when no frame holds one. */
  readonly weapons?: readonly (BakedWeapon | null)[];
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6 || 0;

export function frameCount(animation: RigLabAnimation): number {
  return animation.loop ? animation.length : animation.length + 1;
}

/** Bake every Hexframe tick as Hexframe plays it, through the same engine playback the editor previews. */
export function bakeAnimation(rig: RigLabRig, animation: RigLabAnimation, weapons: readonly RigLabWeapon[] = []): RigLabBaked {
  const bones = rig.bones.map((bone) => bone.name);
  const engine = engineOf(rig, animation, weapons);
  const frames: Transform[][] = [];
  const held: (BakedWeapon | null)[] = [];
  for (let frame = 0; frame < frameCount(animation); frame += 1) {
    const played = playAt(engine, frame);
    const placed = place(rig, played.pose);
    frames.push(bones.map((name) => {
      const at = placed.get(name)!;
      return [round(at.x), round(at.y), round((at.rotation * 180) / Math.PI)];
    }));
    const wielded = played.constraints.weapon;
    held.push(wielded ? {
      name: wielded.weapon.name,
      bodies: Object.fromEntries(bodyTransforms(rig, played.pose, wielded).map((body) => [body.body, [round(body.x), round(body.y), round(body.rotation)] as const])),
    } : null);
  }
  return {
    format: BAKED_FORMAT,
    version: BAKED_VERSION,
    rig: rig.name,
    animation: animation.name,
    fps: animation.fps,
    loop: animation.loop,
    bones,
    frames,
    ...(held.some((weapon) => weapon !== null) ? { weapons: held } : {}),
  };
}
