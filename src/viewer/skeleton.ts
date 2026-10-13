// Skeleton geometry for a placed rig: the same bones and tips Hexframe's skeleton overlay draws.
import { forwardKinematics, inBone } from "../../vendor/hexframe/src/rig";
import type { Placed, Pose, Rig } from "../../vendor/hexframe/src/rig";

export interface Joint {
  readonly bone: string;
  readonly x: number;
  readonly y: number;
  readonly root: boolean;
}

export interface Segment {
  readonly bone: string;
  /** "parent" joins the bone's joint to its parent's joint; "tip" runs from the joint to the bone's end. */
  readonly kind: "parent" | "tip";
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
}

export interface Skeleton {
  readonly placed: ReadonlyMap<string, Placed>;
  readonly joints: readonly Joint[];
  readonly segments: readonly Segment[];
}

export function skeletonFor(rig: Rig, pose: Pose): Skeleton {
  const placed = forwardKinematics(rig, pose);
  const joints: Joint[] = [];
  const segments: Segment[] = [];
  for (const bone of rig.bones) {
    const at = placed.get(bone.name);
    if (!at) throw new Error(`skeleton: no placement for '${bone.name}'`);
    joints.push({ bone: bone.name, x: at.x, y: at.y, root: bone.parent === null });
    if (bone.parent !== null) {
      const parent = placed.get(bone.parent);
      if (!parent) throw new Error(`skeleton: no placement for parent '${bone.parent}'`);
      segments.push({ bone: bone.name, kind: "parent", from: { x: parent.x, y: parent.y }, to: { x: at.x, y: at.y } });
    }
    if (bone.tip !== null) {
      segments.push({ bone: bone.name, kind: "tip", from: { x: at.x, y: at.y }, to: inBone(at, bone.tip) });
    }
  }
  return { placed, joints, segments };
}

export function segmentLength(segment: Segment): number {
  return Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
}
