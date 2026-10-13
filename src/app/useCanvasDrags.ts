import { useMemo, useState } from "react";
import type { Dispatch } from "react";
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabRig } from "../format/rig";
import { activeAnimationOf, documentOf } from "../editor/state";
import type { Action, EditorState } from "../editor/state";
import { snapToGrid } from "../editor/view";
import type { Point } from "../editor/view";
import { dragJoint, dragTip, place, solveWithGridSnap } from "../solve";
import type { Solved } from "../solve";
import type { Handle } from "../viewer/RigCanvas";

type Offset = readonly [number, number];

export interface CanvasDrags {
  /** The rig as shown: the document's, with a joint previewed at its drag position in Rig setup. */
  readonly rig: RigLabRig;
  /** The pose as shown: the sampled pose, or the solve previewed while dragging in Pose mode. */
  readonly pose: Pose;
  /** What the solver reports about the drag in progress. */
  readonly message: string | null;
  readonly drag: { readonly tips: boolean; readonly onDrag: (handle: Handle, point: Point, done: boolean) => void } | undefined;
}

/** Six decimals, and never a negative zero, for offsets computed from pointer positions. */
const tidy = (value: number): number => Math.round(value * 1e6) / 1e6 || 0;
const cancelled = (point: Point): boolean => !Number.isFinite(point.x) || !Number.isFinite(point.y);

function withOffset(rig: RigLabRig, bone: string, offset: Offset): RigLabRig {
  return { ...rig, bones: rig.bones.map((candidate) => (candidate.name === bone ? { ...candidate, offset } : candidate)) };
}

/**
 * Rig setup drags joints in rest space and commits the drop as an offset in the parent's frame.
 * Pose mode drags joints and bone ends through the solver and commits the drop as the key at this frame.
 */
export function useCanvasDrags(state: EditorState, dispatch: Dispatch<Action>, sampled: Pose): CanvasDrags {
  const document = documentOf(state);
  const [offsetPreview, setOffsetPreview] = useState<{ readonly bone: string; readonly offset: Offset } | null>(null);
  const [posePreview, setPosePreview] = useState<Solved | null>(null);
  const restPlaced = useMemo(() => place(document.rig, {}), [document.rig]);
  const rig = useMemo(
    () => (offsetPreview ? withOffset(document.rig, offsetPreview.bone, offsetPreview.offset) : document.rig),
    [document.rig, offsetPreview],
  );

  const onSetupDrag = (handle: Handle, point: Point, done: boolean): void => {
    if (cancelled(point) || handle.kind !== "joint") {
      setOffsetPreview(null);
      return;
    }
    const target = state.snap ? snapToGrid(point, state.grid) : point;
    const parentName = document.rig.bones.find((candidate) => candidate.name === handle.bone)?.parent ?? null;
    const parent = parentName === null ? { x: 0, y: 0, rotation: 0 } : restPlaced.get(parentName)!;
    const dx = target.x - parent.x;
    const dy = target.y - parent.y;
    const cos = Math.cos(parent.rotation);
    const sin = Math.sin(parent.rotation);
    const offset: Offset = [tidy(dx * cos + dy * sin), tidy(dy * cos - dx * sin)];
    if (!done) {
      setOffsetPreview({ bone: handle.bone, offset });
      return;
    }
    setOffsetPreview(null);
    const current = document.rig.bones.find((candidate) => candidate.name === handle.bone)?.offset;
    if (current && (current[0] !== offset[0] || current[1] !== offset[1])) {
      dispatch({ type: "rigEdit", edit: { kind: "moveJoint", bone: handle.bone, offset } });
    }
  };

  const onPoseDrag = (handle: Handle, point: Point, done: boolean): void => {
    if (cancelled(point)) {
      setPosePreview(null);
      return;
    }
    const solve = (target: Point): Solved => (handle.kind === "joint"
      ? dragJoint(document.rig, sampled, handle.bone, target, state.rotationSnap)
      : dragTip(document.rig, sampled, handle.bone, target, state.rotationSnap));
    const solved = solveWithGridSnap(solve, point, state.grid, state.snap);
    if (!done) {
      setPosePreview(solved);
      return;
    }
    setPosePreview(null);
    dispatch({ type: "setPose", pose: solved.pose, message: solved.message });
  };

  const posing = state.mode === "pose" && activeAnimationOf(state) !== null;
  return {
    rig,
    pose: posing && posePreview ? posePreview.pose : sampled,
    message: posing ? posePreview?.message ?? null : null,
    drag: state.mode === "setup" ? { tips: false, onDrag: onSetupDrag } : posing ? { tips: true, onDrag: onPoseDrag } : undefined,
  };
}
