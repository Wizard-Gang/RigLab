import { useEffect, useState } from "react";
import { POSE_INTERVALS } from "../../vendor/hexframe/src/rig";
import type { Placed, Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabAnimation } from "../format/animation";
import type { RigLabRig } from "../format/rig";
import { KINDS } from "../format/timing";
import type { Selection } from "../editor/state";

interface InspectorProps {
  readonly rig: RigLabRig;
  readonly selection: Selection;
  /** The active animation, whose keys a key selection names. */
  readonly active: RigLabAnimation | null;
  readonly pose: Pose;
  readonly placed: ReadonlyMap<string, Placed>;
  readonly animations: readonly RigLabAnimation[];
  readonly onRename: (from: string, to: string) => void;
}

/** Two decimals, without printing a rounded negative zero. */
export const fixed = (value: number): string => (Math.abs(value) < 0.005 ? 0 : value).toFixed(2);

function AnimationName({ name, onRename }: { readonly name: string; readonly onRename: (from: string, to: string) => void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = (): void => {
    if (draft !== name) onRename(name, draft);
  };
  return (
    <input
      className="field"
      aria-label="Animation name"
      value={draft}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setDraft(name);
      }}
    />
  );
}

export function Inspector({ rig, selection, active, pose, placed, animations, onRename }: InspectorProps) {
  if (selection?.kind === "animation") {
    const animation = animations.find((candidate) => candidate.name === selection.name);
    if (!animation) return null;
    return (
      <dl className="inspector">
        <dt>Animation</dt><dd><AnimationName name={animation.name} onRename={onRename} /></dd>
        <dt>Rig</dt><dd><code>{animation.rig}</code></dd>
        <dt>Kind</dt><dd>{KINDS[animation.kind].label}</dd>
        <dt>Frame rate</dt><dd>{animation.fps} fps, Hexframe's clock</dd>
        <dt>Length</dt><dd>{animation.length} frames · {fixed(animation.length / animation.fps)} s</dd>
        <dt>Playback</dt><dd>{animation.loop ? "Loop" : "Once"}</dd>
        <dt>Keys</dt><dd>{animation.keys.map((key) => key.frame).join(", ")}</dd>
        <dt>Hexframe poses</dt><dd>13, every {animation.length / POSE_INTERVALS} frames</dd>
      </dl>
    );
  }
  if (selection?.kind === "key") {
    const key = active?.keys.find((candidate) => candidate.frame === selection.frame);
    if (!active || !key) return null;
    const next = active.keys.find((candidate) => candidate.frame > key.frame);
    return (
      <dl className="inspector">
        <dt>Key</dt><dd>frame {key.frame} of <code>{active.name}</code></dd>
        <dt>Time</dt><dd>{fixed(key.frame / active.fps)} s</dd>
        <dt>To next key</dt><dd>{key.interpolation}{next ? ` over ${next.frame - key.frame} frames` : active.loop ? " back to frame 0" : " (last key holds)"}</dd>
        <dt>Pins</dt><dd>{key.pins?.length ? key.pins.map((pin) => pin.chain).join(", ") : "none"}</dd>
        <dt>Prop</dt><dd>{key.prop ? `${key.prop.name} held by ${key.prop.grips.map((grip) => grip.chain).join(", ")}` : "none"}</dd>
      </dl>
    );
  }
  if (selection?.kind === "bone") {
    const bone = rig.bones.find((candidate) => candidate.name === selection.name);
    const world = placed.get(selection.name);
    if (!bone || !world) return null;
    const local = pose[bone.name] ?? {};
    const chain = rig.chains.find((candidate) => candidate.upper === bone.name || candidate.lower === bone.name);
    return (
      <dl className="inspector">
        <dt>Bone</dt><dd><code>{bone.name}</code></dd>
        <dt>Parent</dt><dd><code>{bone.parent ?? "—"}</code></dd>
        <dt>Rest offset</dt><dd>{bone.offset.join(", ")}</dd>
        <dt>Tip</dt><dd>{bone.tip ? bone.tip.join(", ") : "—"}</dd>
        <dt>Slot</dt><dd><code>{bone.slot}</code></dd>
        <dt>Limits</dt><dd>{bone.limits ? `${bone.limits.min}° to ${bone.limits.max}°` : "none"}</dd>
        <dt>Chain</dt><dd>{chain ? `${chain.name} · bend ${chain.bend > 0 ? "+" : "−"}` : "—"}</dd>
        <dt>Local rotation</dt><dd>{fixed(local.rotation ?? 0)}°</dd>
        <dt>Local translation</dt><dd>{fixed(local.x ?? 0)}, {fixed(local.y ?? 0)}</dd>
        <dt>World position</dt><dd>{fixed(world.x)}, {fixed(world.y)}</dd>
        <dt>World rotation</dt><dd>{fixed((world.rotation * 180) / Math.PI)}°</dd>
      </dl>
    );
  }
  return <p className="panel__empty">Select a joint on the canvas or in the hierarchy, an animation in the list, or a key on the timeline.</p>;
}
