// The Hexframe consumer adapter: RigLab rigs and animations in the shapes Hexframe already loads.
import { createRig } from "../../vendor/hexframe/src/rig";
import type { Clip, RigContract } from "../../vendor/hexframe/src/rig";
import type { RigLabAnimation } from "../format/animation";
import { UNARMED } from "../format/classes";
import { classProfiles } from "../format/paint";
import type { RigLabRig } from "../format/rig";
import type { RigLabWeapon } from "../format/weapon";
import { engineOf } from "../solve/engine";

export type Adapted<T> =
  | { readonly ok: true; readonly value: T; readonly notes: readonly string[] }
  | { readonly ok: false; readonly error: string };

/** A clip as Hexframe's character files store it: its 13-pose clip plus a key and a note. */
export interface HexframeClipFile extends Clip {
  readonly key: string;
  readonly note: string;
}

/** Hexframe's rig file shape: no format header, limits or chains, and depth profiles required, with `animations`' clip keys mapped. */
export function toHexframeRig(rig: RigLabRig, animations: readonly RigLabAnimation[] = []): Adapted<RigContract> {
  if (!rig.depthProfiles) return { ok: false, error: `Hexframe paints a rig by depth profile, and '${rig.name}' has none` };
  const mapped = classProfiles(rig.depthProfiles.byClip, animations);
  const contract: RigContract = {
    space: { ...rig.space, viewBox: [...rig.space.viewBox] },
    root: rig.root,
    bones: rig.bones.map((bone) => ({
      name: bone.name, parent: bone.parent, offset: [...bone.offset], tip: bone.tip && [...bone.tip], slot: bone.slot, artHeight: bone.artHeight, hand: bone.hand,
    })),
    depthProfiles: { ...structuredClone(rig.depthProfiles), byClip: { ...rig.depthProfiles.byClip, ...mapped } },
  };
  try {
    createRig(contract);
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  const limited = rig.bones.filter((bone) => bone.limits).length;
  const notes = limited || rig.chains.length ? [`Hexframe has no angle limits or IK chains: ${limited} limits and ${rig.chains.length} chains are left out`] : [];
  const count = Object.keys(mapped).length;
  if (count) notes.push(`${count} ${count === 1 ? "clip paints" : "clips paint"} with ${count === 1 ? "its" : "their"} class's depth profile`);
  return { ok: true, value: contract, notes };
}

/**
 * The animation as the clip RigLab's engine playback already plays: its 13 poses over its length in Hexframe ticks,
 * linear between poses, with any held weapon's grips held. Hexframe plays it frame for frame as RigLab previews and
 * bakes it.
 */
export function toHexframeClip(rig: RigLabRig, animation: RigLabAnimation, weapons: readonly RigLabWeapon[] = []): HexframeClipFile {
  const { clip } = engineOf(rig, animation, weapons);
  return {
    key: animation.name,
    loop: clip.loop,
    duration: clip.duration,
    easing: clip.easing ?? "linear",
    note: `Exported by RigLab from the ${animation.kind} animation ${animation.name}.`,
    poses: clip.poses,
  };
}

/** What a Hexframe clip of the animation leaves out: its weapon's transforms, which Hexframe's clip has no channel for. */
export function clipNotes(animation: RigLabAnimation): string[] {
  return animation.class === UNARMED ? [] : [`Hexframe's clip has no weapon channel, so the ${animation.class} transforms are left out; the baked frames carry them`];
}
