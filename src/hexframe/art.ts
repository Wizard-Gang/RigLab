// Where art draws: each bone's part at that bone's FK transform, in Hexframe's paint order when the rig has one.
import { depthProfileName, visualPaintOrder } from "../../vendor/hexframe/src/rig";
import type { Placed, Rig } from "../../vendor/hexframe/src/rig";
import type { RigLabRig } from "../format/rig";
import type { Part } from "./parts";

export interface ArtPlacement {
  readonly bone: string;
  readonly x: number;
  readonly y: number;
  /** Degrees, clockwise, as the SVG rotate() transform takes it. */
  readonly rotation: number;
  readonly part: Part;
}

/** Paint order: Hexframe's depth profile for facing right when it fits the rig, otherwise the bone list order. */
export function paintOrder(rig: RigLabRig, runtime: Rig, animation: string | null): readonly string[] {
  if (rig.depthProfiles) {
    try {
      return visualPaintOrder(runtime, 1, depthProfileName(runtime, animation ?? "", animation));
    } catch {
      // A depth profile that no longer names every bone (after rig setup edits) falls back to bone order.
    }
  }
  return rig.bones.map((bone) => bone.name);
}

export function artPlacements(
  rig: RigLabRig,
  runtime: Rig,
  placed: ReadonlyMap<string, Placed>,
  parts: Readonly<Record<string, Part>>,
  animation: string | null,
): ArtPlacement[] {
  return paintOrder(rig, runtime, animation).flatMap((name) => {
    const bone = rig.bones.find((candidate) => candidate.name === name);
    const at = placed.get(name);
    const part = bone ? parts[bone.slot] : undefined;
    return bone && at && part ? [{ bone: name, x: at.x, y: at.y, rotation: (at.rotation * 180) / Math.PI, part }] : [];
  });
}
