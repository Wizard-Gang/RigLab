import type { Placed, Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabRig } from "../format/rig";
import { moveRoot, setRotation } from "../solve";
import type { Solved } from "../solve";
import { fixed } from "./Inspector";
import { NumberField } from "./fields";

interface PoseInspectorProps {
  readonly rig: RigLabRig;
  readonly bone: string;
  readonly pose: Pose;
  readonly placed: ReadonlyMap<string, Placed>;
  readonly frame: number;
  readonly keyed: boolean;
  readonly onPose: (solved: Solved) => void;
}

/** Pose mode's inspector: type a joint's rotation, or the root's position, for the key at this frame. */
export function PoseInspector({ rig, bone: name, pose, placed, frame, keyed, onPose }: PoseInspectorProps) {
  const bone = rig.bones.find((candidate) => candidate.name === name);
  const world = placed.get(name);
  if (!bone || !world) return null;
  const local = pose[name] ?? {};
  const isRoot = bone.parent === null;
  const chain = rig.chains.find((candidate) => candidate.upper === name || candidate.lower === name);
  return (
    <dl className="inspector">
      <dt>Bone</dt><dd><code>{bone.name}</code></dd>
      <dt>Frame</dt><dd>{frame} · {keyed ? "key" : "between keys"}</dd>
      <dt>Rotation</dt>
      <dd><NumberField label="Rotation" value={local.rotation ?? 0} onCommit={(value) => onPose(setRotation(rig, pose, name, value))} /></dd>
      {isRoot ? (
        <>
          <dt>Position x</dt>
          <dd><NumberField label="Root x" value={world.x} onCommit={(value) => onPose(moveRoot(rig, pose, { x: value, y: world.y }))} /></dd>
          <dt>Position y</dt>
          <dd><NumberField label="Root y" value={world.y} onCommit={(value) => onPose(moveRoot(rig, pose, { x: world.x, y: value }))} /></dd>
        </>
      ) : null}
      <dt>Limits</dt><dd>{bone.limits ? `${bone.limits.min}° to ${bone.limits.max}°` : "none"}</dd>
      <dt>Chain</dt><dd>{chain ? `${chain.name} · bend ${chain.bend > 0 ? "+" : "−"}` : "—"}</dd>
      <dt>World position</dt><dd>{fixed(world.x)}, {fixed(world.y)}</dd>
      <dt>World rotation</dt><dd>{fixed((world.rotation * 180) / Math.PI)}°</dd>
    </dl>
  );
}
