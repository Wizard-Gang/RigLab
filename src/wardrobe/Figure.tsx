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
  readonly weapon: LibraryWeapon | null;
  readonly motion: RigLabAnimation | null;
  readonly frame: number;
}

/** The rig drawn in the outfit's parts, read-only: at rest or at `frame` of the motion, holding the weapon if any. */
export function Figure({ library, parts, weapon, motion, frame }: FigureProps) {
  const { rig } = library;
  const runtime = useMemo(() => runtimeRig(rig), [rig]);
  const engine = useMemo(() => (motion ? engineOf(rig, motion, library.weapons.map((item) => item.weapon)) : null), [rig, motion, library.weapons]);
  const placements = useMemo(() => {
    const played = engine ? playAt(engine, frame) : null;
    const base = played?.pose ?? restPose(rig);
    const own = played?.constraints.weapon ?? null;
    const wielded = weapon ? { weapon: weapon.weapon, bodies: weapon.hold.bodies } : own;
    const pose = weapon ? holdConstraints(rig, base, { pins: played?.constraints.pins ?? [], weapon: wielded }).pose : base;
    const art = artPlacements(rig, runtime, place(rig, pose), parts, motion?.name ?? null, wielded?.weapon.name ?? motion?.class ?? null);
    return wielded ? withWeaponArt(rig, runtime, art, bodyTransforms(rig, pose, wielded), wielded.weapon, parts, motion?.name ?? null) : art;
  }, [rig, runtime, engine, frame, weapon, parts, motion]);
  const [x, y, width, height] = viewBoxFor(rig.space, fitView(rig.space));
  return (
    <svg className="wardrobe__figure" viewBox={`${x} ${y} ${width} ${height}`} role="img" aria-label="The rig in the chosen outfit">
      <ArtLayer placements={placements} />
    </svg>
  );
}
