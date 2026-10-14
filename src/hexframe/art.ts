// Where art draws: each bone's part at that bone's FK transform, in Hexframe's paint order when the rig has one.
import { depthProfileName, visualPaintOrder } from "../../vendor/hexframe/src/rig";
import type { Placed, Rig } from "../../vendor/hexframe/src/rig";
import type { RigLabRig } from "../format/rig";
import type { RigLabWeapon } from "../format/weapon";
import type { BodyTransform } from "../solve/weapons";
import type { Part } from "./parts";

export interface ArtPlacement {
  /** The bone the part draws on, or the weapon body it draws. */
  readonly bone: string;
  readonly x: number;
  readonly y: number;
  /** Degrees, clockwise, as the SVG rotate() transform takes it. */
  readonly rotation: number;
  readonly part: Part;
}

/**
 * Paint order: Hexframe's depth profile for facing right when it fits the rig, otherwise the bone list order. Hexframe's
 * `depthProfileName` picks the profile: the animation's `byClip` entry, else its class's, else the default.
 */
export function paintOrder(rig: RigLabRig, runtime: Rig, animation: string | null, animationClass: string | null): readonly string[] {
  if (rig.depthProfiles) {
    try {
      return visualPaintOrder(runtime, 1, depthProfileName(runtime, animation ?? "", animationClass));
    } catch {
      // A depth profile that no longer names every bone (after rig setup edits) falls back to bone order.
    }
  }
  return rig.bones.map((bone) => bone.name);
}

/** The bones' art in the animation's paint order, by its name and class; `withWeaponArt` adds a held weapon. */
export function artPlacements(
  rig: RigLabRig,
  runtime: Rig,
  placed: ReadonlyMap<string, Placed>,
  parts: Readonly<Record<string, Part>>,
  animation: string | null,
  animationClass: string | null = null,
): ArtPlacement[] {
  return paintOrder(rig, runtime, animation, animationClass).flatMap((name) => {
    const bone = rig.bones.find((candidate) => candidate.name === name);
    const at = placed.get(name);
    const part = bone ? parts[bone.slot] : undefined;
    return bone && at && part ? [{ bone: name, x: at.x, y: at.y, rotation: (at.rotation * 180) / Math.PI, part }] : [];
  });
}

/**
 * Interleave a held weapon's art with the rig's, in the paint order for the animation and that weapon's class: each body
 * paints just under the last-painted lower bone of the chains that grip it, so the hand that holds it covers its grip
 * and anything painted before that hand stays under it.
 */
export function withWeaponArt(
  rig: RigLabRig,
  runtime: Rig,
  placements: readonly ArtPlacement[],
  bodies: readonly BodyTransform[],
  weapon: RigLabWeapon,
  parts: Readonly<Record<string, Part>>,
  animation: string | null,
): ArtPlacement[] {
  const order = paintOrder(rig, runtime, animation, weapon.name);
  const under = new Map<string, ArtPlacement[]>();
  for (const body of weapon.bodies) {
    const transform = bodies.find((candidate) => candidate.body === body.name);
    const part = parts[body.slot];
    const hands = body.grips.flatMap((grip) => rig.chains.filter((chain) => chain.name === grip.chain).map((chain) => chain.lower));
    const top = hands.sort((a, b) => order.indexOf(b) - order.indexOf(a))[0];
    if (!transform || !part || top === undefined) continue;
    under.set(top, [...(under.get(top) ?? []), { bone: body.name, x: transform.x, y: transform.y, rotation: transform.rotation, part }]);
  }
  return order.flatMap((bone) => [...(under.get(bone) ?? []), ...placements.filter((item) => item.bone === bone)]);
}
