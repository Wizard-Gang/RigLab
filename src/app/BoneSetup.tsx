import type { RigLabRig } from "../format/rig";
import type { RigEdit } from "../editor/rigEdits";
import { NumberField, TextField } from "./fields";

interface BoneSetupProps {
  readonly rig: RigLabRig;
  readonly bone: string;
  readonly onEdit: (edit: RigEdit) => void;
}

const DEFAULT_LIMITS = { min: -90, max: 90 } as const;
const DEFAULT_TIP = [0, 10] as const;

/** Rig setup's editable inspector: the only place a bone's rest data, limits and chains change. */
export function BoneSetup({ rig, bone: name, onEdit }: BoneSetupProps) {
  const bone = rig.bones.find((candidate) => candidate.name === name);
  if (!bone) return null;
  const isRoot = bone.parent === null;
  const chain = rig.chains.find((candidate) => candidate.upper === name || candidate.lower === name);
  const children = rig.bones.filter((candidate) => candidate.parent === name);
  const [x, y] = bone.offset;
  return (
    <div className="setup">
      <dl className="inspector">
        <dt>Bone</dt><dd><TextField label="Bone name" value={bone.name} onCommit={(value) => onEdit({ kind: "renameBone", bone: name, name: value })} /></dd>
        <dt>Parent</dt><dd><code>{bone.parent ?? "—"}</code></dd>
        <dt>{isRoot ? "Position" : "Offset"} x</dt>
        <dd><NumberField label="Offset x" value={x} onCommit={(value) => onEdit({ kind: "moveJoint", bone: name, offset: [value, y] })} /></dd>
        <dt>{isRoot ? "Position" : "Offset"} y</dt>
        <dd><NumberField label="Offset y" value={y} onCommit={(value) => onEdit({ kind: "moveJoint", bone: name, offset: [x, value] })} /></dd>
        {bone.tip ? (
          <>
            <dt>Tip x</dt>
            <dd><NumberField label="Tip x" value={bone.tip[0]} onCommit={(value) => onEdit({ kind: "setTip", bone: name, tip: [value, bone.tip![1]] })} /></dd>
            <dt>Tip y</dt>
            <dd><NumberField label="Tip y" value={bone.tip[1]} onCommit={(value) => onEdit({ kind: "setTip", bone: name, tip: [bone.tip![0], value] })} /></dd>
          </>
        ) : null}
        <dt>Slot</dt><dd><TextField label="Slot" value={bone.slot} onCommit={(value) => onEdit({ kind: "setSlot", bone: name, slot: value })} /></dd>
        <dt>
          <label className="check">
            <input
              type="checkbox"
              aria-label="Limit rotation"
              checked={bone.limits !== null}
              onChange={(event) => onEdit({ kind: "setLimits", bone: name, limits: event.target.checked ? DEFAULT_LIMITS : null })}
            />
            Limits
          </label>
        </dt>
        <dd>{bone.limits ? `${bone.limits.min}° to ${bone.limits.max}°` : "none"}</dd>
        {bone.limits ? (
          <>
            <dt>Minimum</dt>
            <dd><NumberField label="Minimum rotation" value={bone.limits.min} onCommit={(value) => onEdit({ kind: "setLimits", bone: name, limits: { min: value, max: bone.limits!.max } })} /></dd>
            <dt>Maximum</dt>
            <dd><NumberField label="Maximum rotation" value={bone.limits.max} onCommit={(value) => onEdit({ kind: "setLimits", bone: name, limits: { min: bone.limits!.min, max: value } })} /></dd>
          </>
        ) : null}
        <dt>Chain</dt>
        <dd>{chain ? <code title={chain.name}>{chain.name}</code> : "—"}</dd>
        {chain ? (
          <>
            <dt>Bend</dt>
            <dd>
              <span className="setup__chain" role="group" aria-label={`${chain.name} bend side`}>
                <button type="button" className="tool tool--small" aria-label="Bend +" title="Bend +" aria-pressed={chain.bend === 1} onClick={() => onEdit({ kind: "setBend", chain: chain.name, bend: 1 })}>+</button>
                <button type="button" className="tool tool--small" aria-label="Bend −" title="Bend −" aria-pressed={chain.bend === -1} onClick={() => onEdit({ kind: "setBend", chain: chain.name, bend: -1 })}>−</button>
              </span>
            </dd>
          </>
        ) : null}
      </dl>
      <div className="setup__actions">
        <button type="button" className="tool" onClick={() => onEdit({ kind: "addChild", bone: name })}>Add child</button>
        <button type="button" className="tool" onClick={() => onEdit({ kind: "setTip", bone: name, tip: bone.tip ? null : DEFAULT_TIP })}>
          {bone.tip ? "Remove tip" : "Add tip"}
        </button>
        {chain ? (
          <button type="button" className="tool" onClick={() => onEdit({ kind: "removeChain", chain: chain.name })}>Remove chain</button>
        ) : children.length === 1 && !isRoot ? (
          <button type="button" className="tool" onClick={() => onEdit({ kind: "addChain", upper: name })}>Make chain</button>
        ) : null}
        <button type="button" className="tool tool--danger" disabled={isRoot} onClick={() => onEdit({ kind: "deleteBone", bone: name })}>Delete joint</button>
      </div>
    </div>
  );
}
