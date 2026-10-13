import { hierarchyOrder } from "./rig";
import type { Pose } from "./clip-types";
import type { Rig } from "./types";

export interface Placed {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

export function forwardKinematics(rig: Rig, pose: Pose): Map<string, Placed> {
  const placed = new Map<string, Placed>();
  for (const bone of hierarchyOrder(rig)) {
    const local = pose[bone.name] ?? {};
    const x = bone.offset[0] + (local.x ?? 0);
    const y = bone.offset[1] + (local.y ?? 0);
    const rotation = ((local.rotation ?? 0) * Math.PI) / 180;
    const parent = bone.parent === null ? { x: 0, y: 0, rotation: 0 } : placed.get(bone.parent)!;
    const cos = Math.cos(parent.rotation);
    const sin = Math.sin(parent.rotation);
    placed.set(bone.name, {
      x: parent.x + x * cos - y * sin,
      y: parent.y + x * sin + y * cos,
      rotation: parent.rotation + rotation,
    });
  }
  return placed;
}

export function inBone(placed: Placed, point: readonly [number, number]): { x: number; y: number } {
  const cos = Math.cos(placed.rotation);
  const sin = Math.sin(placed.rotation);
  return {
    x: placed.x + point[0] * cos - point[1] * sin,
    y: placed.y + point[0] * sin + point[1] * cos,
  };
}
