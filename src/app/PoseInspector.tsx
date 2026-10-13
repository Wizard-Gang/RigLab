import type { Placed, Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabRig } from "../format/rig";
import { holdConstraints, moveRoot, setRotation, toggleGrip, togglePin } from "../solve";
import type { Constraints, HoldResult, Solved } from "../solve";
import { NAME } from "../format/validate";
import { fixed } from "./Inspector";
import { NumberField, TextField } from "./fields";

interface PoseInspectorProps {
  readonly rig: RigLabRig;
  readonly bone: string;
  readonly pose: Pose;
  readonly constraints: Constraints;
  readonly placed: ReadonlyMap<string, Placed>;
  readonly frame: number;
  readonly keyed: boolean;
  /** Commit a pose and the constraints it holds as the key at this frame. */
  readonly onPose: (pose: Pose, constraints: Constraints, note: string | null, warning: string | null) => void;
  readonly onError: (message: string) => void;
}

/** Pose mode's inspector: rotation, root position, pins and the prop for the key at this frame. */
export function PoseInspector({ rig, bone: name, pose, constraints, placed, frame, keyed, onPose, onError }: PoseInspectorProps) {
  const bone = rig.bones.find((candidate) => candidate.name === name);
  const world = placed.get(name);
  if (!bone || !world) return null;
  const local = pose[name] ?? {};
  const isRoot = bone.parent === null;
  const chain = rig.chains.find((candidate) => candidate.upper === name || candidate.lower === name);
  const prop = constraints.prop;
  const pinned = chain !== undefined && constraints.pins.some((pin) => pin.chain === chain.name);
  const gripped = chain !== undefined && prop !== null && prop.grips.some((grip) => grip.chain === chain.name);

  /** Re-hold every pin and grip after a change, then commit; anything the solver could not do is a warning. */
  const commit = (next: Pose, note: string | null, warning: string | null, held: Constraints = constraints): void => {
    const result = holdConstraints(rig, next, held);
    const warnings = [warning, ...result.violations].filter(Boolean).join("; ");
    onPose(result.pose, held, note, warnings || null);
  };
  const solved = (result: Solved): void => commit(result.pose, null, result.message);
  const holds = (result: HoldResult): void => (result.ok ? commit(pose, result.message, null, result.constraints) : onError(result.error));

  return (
    <div className="setup">
      <dl className="inspector">
        <dt>Bone</dt><dd><code>{bone.name}</code></dd>
        <dt>Frame</dt><dd>{frame} · {keyed ? "key" : "between keys"}</dd>
        <dt>Rotation</dt>
        <dd><NumberField label="Rotation" value={local.rotation ?? 0} onCommit={(value) => solved(setRotation(rig, pose, name, value))} /></dd>
        {isRoot ? (
          <>
            <dt>Position x</dt>
            <dd><NumberField label="Root x" value={world.x} onCommit={(value) => solved(moveRoot(rig, pose, { x: value, y: world.y }))} /></dd>
            <dt>Position y</dt>
            <dd><NumberField label="Root y" value={world.y} onCommit={(value) => solved(moveRoot(rig, pose, { x: world.x, y: value }))} /></dd>
          </>
        ) : null}
        <dt>Limits</dt><dd>{bone.limits ? `${bone.limits.min}° to ${bone.limits.max}°` : "none"}</dd>
        <dt>Chain</dt><dd>{chain ? `${chain.name} · bend ${chain.bend > 0 ? "+" : "−"}${pinned ? " · pinned" : ""}${gripped ? " · on prop" : ""}` : "—"}</dd>
        <dt>World position</dt><dd>{fixed(world.x)}, {fixed(world.y)}</dd>
        <dt>World rotation</dt><dd>{fixed((world.rotation * 180) / Math.PI)}°</dd>
      </dl>
      {chain ? (
        <div className="setup__actions">
          <button type="button" className="tool" aria-pressed={pinned} onClick={() => holds(togglePin(rig, pose, constraints, chain.name))}>
            {pinned ? "Unpin end" : "Pin end"}
          </button>
          <button type="button" className="tool" aria-pressed={gripped} onClick={() => holds(toggleGrip(rig, pose, constraints, chain.name))}>
            {gripped ? "Let go of prop" : prop ? "Grip prop" : "Hold a prop"}
          </button>
        </div>
      ) : null}
      {prop ? (
        <dl className="inspector">
          <dt>Prop</dt>
          <dd>
            <TextField
              label="Prop name"
              value={prop.name}
              onCommit={(value) => (NAME.test(value) ? commit(pose, `Renamed the prop to ${value}`, null, { ...constraints, prop: { ...prop, name: value } }) : onError(`'${value}' is not a valid prop name`))}
            />
          </dd>
          <dt>Turn</dt>
          <dd><NumberField label="Prop rotation" value={prop.rotation} onCommit={(value) => commit(pose, `Turned ${prop.name} to ${value}°`, null, { ...constraints, prop: { ...prop, rotation: value } })} /></dd>
          <dt>Held by</dt><dd>{prop.grips.map((grip) => grip.chain).join(", ")}</dd>
        </dl>
      ) : null}
    </div>
  );
}
