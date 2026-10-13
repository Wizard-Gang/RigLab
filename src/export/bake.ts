// riglab.baked version 1: every frame's solved world transforms, for consumers that only draw.
import type { RigLabAnimation } from "../format/animation";
import type { RigLabRig } from "../format/rig";
import { checkInteger, checkName, closedObject, isFiniteNumber, Issues } from "../format/validate";
import type { Validation } from "../format/validate";
import { engineOf, place, playAt } from "../solve";

export const BAKED_FORMAT = "riglab.baked";
export const BAKED_VERSION = 1;

/** A world transform: x, y and rotation in degrees, in rig space. */
export type Transform = readonly [number, number, number];

export interface BakedProp {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
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
  /** The held prop on each frame, or null; omitted when no frame has one. */
  readonly props?: readonly (BakedProp | null)[];
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6 || 0;

export function frameCount(animation: RigLabAnimation): number {
  return animation.loop ? animation.length : animation.length + 1;
}

/** Bake every Hexframe tick as Hexframe plays it, through the same engine playback the editor previews. */
export function bakeAnimation(rig: RigLabRig, animation: RigLabAnimation): RigLabBaked {
  const bones = rig.bones.map((bone) => bone.name);
  const engine = engineOf(rig, animation);
  const frames: Transform[][] = [];
  const props: (BakedProp | null)[] = [];
  for (let frame = 0; frame < frameCount(animation); frame += 1) {
    const played = playAt(engine, frame);
    const placed = place(rig, played.pose);
    frames.push(bones.map((name) => {
      const at = placed.get(name)!;
      return [round(at.x), round(at.y), round((at.rotation * 180) / Math.PI)];
    }));
    const prop = played.constraints.prop;
    props.push(prop ? { name: prop.name, x: round(prop.x), y: round(prop.y), rotation: round(prop.rotation) } : null);
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
    ...(props.some((prop) => prop !== null) ? { props } : {}),
  };
}

const isTransform = (value: unknown): boolean => Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);

/** Closed structural validation against the rig and the animation it claims to bake. */
export function validateBaked(value: unknown, rig: RigLabRig, animation: RigLabAnimation): Validation<RigLabBaked> {
  const issues = new Issues();
  if (!closedObject(issues, "$", value, ["format", "version", "rig", "animation", "fps", "loop", "bones", "frames"], ["props"])) return issues.result(value);
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
  if (value.props !== undefined) {
    if (!Array.isArray(value.props) || value.props.length !== frameCount(animation)) issues.add("$.props", "must hold one entry per frame");
    else {
      value.props.forEach((prop: unknown, index) => {
        if (prop === null) return;
        const at = `$.props[${index}]`;
        if (!closedObject(issues, at, prop, ["name", "x", "y", "rotation"])) return;
        checkName(issues, `${at}.name`, prop.name);
        if (![prop.x, prop.y, prop.rotation].every(isFiniteNumber)) issues.add(at, "must have finite x, y and rotation");
      });
    }
  }
  return issues.result(value);
}
