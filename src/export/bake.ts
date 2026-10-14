// riglab.baked version 1: every frame's solved world transforms, for consumers that only draw.
import type { RigLabAnimation } from "../format/animation";
import type { RigLabRig } from "../format/rig";
import { checkInteger, checkName, closedObject, isFiniteNumber, isObject, Issues } from "../format/validate";
import type { Validation } from "../format/validate";
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

const isTransform = (value: unknown): boolean => Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);

function validateBakedWeapons(issues: Issues, value: unknown, count: number, weapons: readonly RigLabWeapon[]): void {
  if (!Array.isArray(value) || value.length !== count) {
    issues.add("$.weapons", "must hold one entry per frame");
    return;
  }
  value.forEach((entry: unknown, index) => {
    if (entry === null) return;
    const at = `$.weapons[${index}]`;
    if (!closedObject(issues, at, entry, ["name", "bodies"]) || !checkName(issues, `${at}.name`, entry.name)) return;
    const weapon = weapons.find((candidate) => candidate.name === entry.name);
    if (!weapon) issues.add(`${at}.name`, "must name one of the bundle's weapons");
    else if (!isObject(entry.bodies) || Object.keys(entry.bodies).join("\n") !== weapon.bodies.map((body) => body.name).join("\n")) {
      issues.add(`${at}.bodies`, `must give each body of '${weapon.name}' in order`);
    } else if (!Object.values(entry.bodies).every(isTransform)) issues.add(`${at}.bodies`, "must hold one [x, y, rotation] per body");
  });
}

/** Closed structural validation against the rig, the weapons and the animation it claims to bake. */
export function validateBaked(value: unknown, rig: RigLabRig, animation: RigLabAnimation, weapons: readonly RigLabWeapon[] = []): Validation<RigLabBaked> {
  const issues = new Issues();
  const fields = ["format", "version", "rig", "animation", "fps", "loop", "bones", "frames"];
  if (!closedObject(issues, "$", value, fields, ["weapons"])) return issues.result(value);
  if (value.format !== BAKED_FORMAT) issues.add("$.format", `must be '${BAKED_FORMAT}'`);
  if (value.version !== BAKED_VERSION) issues.add("$.version", `must be ${BAKED_VERSION}`);
  if (value.rig !== rig.name) issues.add("$.rig", `must name rig '${rig.name}'`);
  if (value.animation !== animation.name) issues.add("$.animation", `must name animation '${animation.name}'`);
  checkInteger(issues, "$.fps", value.fps, 1, 720);
  if (value.fps !== animation.fps || value.loop !== animation.loop) issues.add("$", "must match the animation's rate and looping");
  const bones = rig.bones.map((bone) => bone.name);
  if (!Array.isArray(value.bones) || value.bones.join("\n") !== bones.join("\n")) issues.add("$.bones", "must list the rig's bones in order");
  const frames = value.frames;
  if (!Array.isArray(frames) || frames.length !== frameCount(animation)) {
    issues.add("$.frames", `must hold ${frameCount(animation)} frames`);
  } else {
    frames.forEach((frame: unknown, index) => {
      if (!Array.isArray(frame) || frame.length !== bones.length || !frame.every(isTransform)) issues.add(`$.frames[${index}]`, "must hold one [x, y, rotation] per bone");
    });
  }
  if (value.weapons !== undefined) validateBakedWeapons(issues, value.weapons, frameCount(animation), weapons);
  return issues.result(value);
}
