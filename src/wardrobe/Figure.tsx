import { useMemo } from "react";
import { restPose } from "../editor/animations";
import { fitView, viewBoxFor } from "../editor/view";
import type { RigLabAnimation } from "../format/animation";
import { artPlacements, withWeaponArt } from "../hexframe/art";
import type { Part } from "../hexframe/parts";
import type { Library, LibraryWeapon } from "../library/load";
import { bodyTransforms, engineOf, holdConstraints, place, playAt, runtimeRig } from "../solve";
import { ArtLayer } from "../viewer/ArtLayer";

interface FigureProps {
  readonly library: Library;
  readonly parts: Readonly<Record<string, Part>>;
  /** The class weapon, held at its hold when the figure is at rest; a motion holds it as its keys place it. */
  readonly weapon: LibraryWeapon | null;
  readonly motion: RigLabAnimation | null;
  readonly frame: number;
}

/** The rig drawn in the outfit's parts, read-only: at `frame` of the motion, or at rest with the class weapon at its hold. */
export function Figure({ library, parts, weapon, motion, frame }: FigureProps) {
  const { rig } = library;
  const runtime = useMemo(() => runtimeRig(rig), [rig]);
  const engine = useMemo(() => (motion ? engineOf(rig, motion, library.weapons.map((item) => item.weapon)) : null), [rig, motion, library.weapons]);
  const placements = useMemo(() => {
    const played = engine ? playAt(engine, frame) : null;
    const atRest = weapon ? { weapon: weapon.weapon, bodies: weapon.hold.bodies } : null;
    const wielded = played ? played.constraints.weapon ?? null : atRest;
    const pose = played ? played.pose : atRest ? holdConstraints(rig, restPose(rig), { pins: [], weapon: atRest }).pose : restPose(rig);
    const art = artPlacements(rig, runtime, place(rig, pose), parts, motion?.name ?? null, motion?.class ?? weapon?.name ?? null);
    return wielded ? withWeaponArt(rig, runtime, art, bodyTransforms(rig, pose, wielded), wielded.weapon, parts, motion?.name ?? null) : art;
  }, [rig, runtime, engine, frame, weapon, parts, motion]);
  const [x, y, width, height] = viewBoxFor(rig.space, fitView(rig.space));
  return (
    <svg className="wardrobe__figure" viewBox={`${x} ${y} ${width} ${height}`} role="img" aria-label="The rig in the chosen outfit">
      <ArtLayer placements={placements} />
    </svg>
  );
}
