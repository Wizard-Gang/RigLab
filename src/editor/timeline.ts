// Timeline edits on one animation. Each returns a valid animation or the reason it was refused.
import { MAX_FPS, MAX_LENGTH, validateAnimation } from "../format/animation";
import type { Interpolation, Key, RigLabAnimation } from "../format/animation";
import type { RigLabRig } from "../format/rig";
import { keyIndexAt } from "../format/sample";
import { constraintsAt, samplePose } from "../solve/constraints";

export type TimelineEdit =
  | { readonly kind: "addKey"; readonly frame: number }
  | { readonly kind: "duplicateKey"; readonly frame: number }
  | { readonly kind: "deleteKey"; readonly frame: number }
  | { readonly kind: "moveKey"; readonly from: number; readonly to: number }
  | { readonly kind: "setInterpolation"; readonly frame: number; readonly interpolation: Interpolation }
  | { readonly kind: "setTiming"; readonly fps?: number; readonly length?: number; readonly loop?: boolean };

export type TimelineResult =
  | { readonly ok: true; readonly animation: RigLabAnimation; readonly message: string; readonly frame?: number }
  | { readonly ok: false; readonly error: string };

const refuse = (error: string): TimelineResult => ({ ok: false, error });

function checked(rig: RigLabRig, animation: RigLabAnimation, message: string, frame?: number): TimelineResult {
  const result = validateAnimation(animation, rig);
  if (!result.ok) return refuse(result.errors[0]!);
  return frame === undefined ? { ok: true, animation: result.value, message } : { ok: true, animation: result.value, message, frame };
}

function sorted(keys: readonly Key[]): Key[] {
  return [...keys].sort((a, b) => a.frame - b.frame);
}

/** The key the frame shows: the one in force, which holds the pose, pins and prop being displayed. */
function capture(rig: RigLabRig, animation: RigLabAnimation, frame: number): Key {
  const constraints = constraintsAt(animation, frame);
  return {
    frame,
    interpolation: animation.keys[keyIndexAt(animation.keys, frame)]!.interpolation,
    pose: samplePose(rig, animation, frame).pose,
    ...(constraints.pins.length ? { pins: constraints.pins } : {}),
    ...(constraints.prop ? { prop: constraints.prop } : {}),
  };
}

export function applyTimelineEdit(rig: RigLabRig, animation: RigLabAnimation, edit: TimelineEdit): TimelineResult {
  const keyAt = (frame: number): Key | undefined => animation.keys.find((key) => key.frame === frame);
  switch (edit.kind) {
    case "addKey": {
      if (keyAt(edit.frame)) return refuse(`Frame ${edit.frame} already has a key`);
      if (edit.frame < 0 || edit.frame > animation.length) return refuse(`Frame ${edit.frame} is outside the animation`);
      return checked(rig, { ...animation, keys: sorted([...animation.keys, capture(rig, animation, edit.frame)]) }, `Added a key at frame ${edit.frame}`);
    }
    case "duplicateKey": {
      const source = animation.keys[keyIndexAt(animation.keys, edit.frame)]!;
      const target = edit.frame + 1;
      if (target > animation.length) return refuse(`There is no frame after ${edit.frame}; lengthen the animation first`);
      if (keyAt(target)) return refuse(`Frame ${target} already has a key`);
      return checked(rig, { ...animation, keys: sorted([...animation.keys, { ...source, frame: target }]) },
        `Duplicated the key at frame ${source.frame} to frame ${target}`, target);
    }
    case "deleteKey": {
      if (!keyAt(edit.frame)) return refuse(`Frame ${edit.frame} has no key`);
      if (edit.frame === 0) return refuse("The first key, at frame 0, cannot be deleted");
      return checked(rig, { ...animation, keys: animation.keys.filter((key) => key.frame !== edit.frame) }, `Deleted the key at frame ${edit.frame}`);
    }
    case "moveKey": {
      const key = keyAt(edit.from);
      if (!key) return refuse(`Frame ${edit.from} has no key`);
      if (edit.from === 0) return refuse("The first key stays at frame 0");
      if (edit.to === edit.from) return refuse("The key is already there");
      if (!Number.isInteger(edit.to) || edit.to < 1 || edit.to > animation.length) return refuse(`Frame ${edit.to} is outside the animation`);
      if (keyAt(edit.to)) return refuse(`Frame ${edit.to} already has a key`);
      const keys = sorted(animation.keys.map((candidate) => (candidate === key ? { ...candidate, frame: edit.to } : candidate)));
      return checked(rig, { ...animation, keys }, `Moved the key from frame ${edit.from} to ${edit.to}`, edit.to);
    }
    case "setInterpolation": {
      const key = keyAt(edit.frame);
      if (!key) return refuse(`Frame ${edit.frame} has no key`);
      const keys = animation.keys.map((candidate) => (candidate === key ? { ...candidate, interpolation: edit.interpolation } : candidate));
      return checked(rig, { ...animation, keys }, `Set the key at frame ${edit.frame} to ${edit.interpolation}`);
    }
    case "setTiming": {
      const fps = edit.fps ?? animation.fps;
      const length = edit.length ?? animation.length;
      const loop = edit.loop ?? animation.loop;
      if (!Number.isInteger(fps) || fps < 1 || fps > MAX_FPS) return refuse(`The frame rate must be a whole number from 1 to ${MAX_FPS}`);
      if (!Number.isInteger(length) || length < 1 || length > MAX_LENGTH) return refuse(`The length must be a whole number from 1 to ${MAX_LENGTH}`);
      const last = animation.keys.at(-1)!.frame;
      if (length < last) return refuse(`The length cannot end before the key at frame ${last}`);
      const changes = [
        fps !== animation.fps ? `${fps} fps` : null,
        length !== animation.length ? `${length} frames` : null,
        loop !== animation.loop ? (loop ? "looping" : "playing once") : null,
      ].filter(Boolean);
      if (!changes.length) return refuse("The timing is unchanged");
      return checked(rig, { ...animation, fps, length, loop }, `${animation.name}: ${changes.join(", ")}`);
    }
    default:
      return refuse("Unknown timeline edit");
  }
}
