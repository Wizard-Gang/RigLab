import { Fragment } from "react";
import type { ModelWeapon } from "../editor/model";
import type { WeaponEdit } from "../editor/weaponEdits";
import { NumberField } from "./fields";

interface WeaponSetupProps {
  /** The active class's weapon and its hold. */
  readonly held: ModelWeapon;
  readonly body: string;
  /** The grip picked in the hierarchy, if any. */
  readonly grip: string | null;
  /** Grips the hands cannot reach at rest. */
  readonly violations: readonly string[];
  readonly onEdit: (edit: WeaponEdit) => void;
}

/** Rig setup's weapon inspector: a body's hold, its axis, and each grip, the same values the canvas handles drag. */
export function WeaponSetup({ held, body: name, grip: picked, violations, onEdit }: WeaponSetupProps) {
  const body = held.weapon.bodies.find((candidate) => candidate.name === name);
  if (!body) return null;
  const weapon = held.weapon.name;
  const placement = held.hold.bodies.find((candidate) => candidate.body === name);
  const [butt, tip] = body.axis;
  return (
    <div className="setup">
      <dl className="inspector">
        <dt>Weapon</dt><dd><code>{weapon}</code></dd>
        <dt>Body</dt><dd><code>{body.name}</code></dd>
        <dt>Slot</dt><dd><code>{body.slot}</code></dd>
        {placement ? (
          <>
            <dt>Hold x</dt>
            <dd><NumberField label="Hold x" value={placement.x} onCommit={(x) => onEdit({ kind: "setHold", weapon, placement: { ...placement, x } })} /></dd>
            <dt>Hold y</dt>
            <dd><NumberField label="Hold y" value={placement.y} onCommit={(y) => onEdit({ kind: "setHold", weapon, placement: { ...placement, y } })} /></dd>
            <dt>Hold rotation</dt>
            <dd><NumberField label="Hold rotation" value={placement.rotation} onCommit={(rotation) => onEdit({ kind: "setHold", weapon, placement: { ...placement, rotation } })} /></dd>
          </>
        ) : (
          <><dt>Hold</dt><dd>rides its hand</dd></>
        )}
        <dt>Butt x</dt>
        <dd><NumberField label="Butt x" value={butt[0]} onCommit={(x) => onEdit({ kind: "setAxis", weapon, body: name, end: "butt", at: [x, butt[1]] })} /></dd>
        <dt>Butt y</dt>
        <dd><NumberField label="Butt y" value={butt[1]} onCommit={(y) => onEdit({ kind: "setAxis", weapon, body: name, end: "butt", at: [butt[0], y] })} /></dd>
        <dt>Tip x</dt>
        <dd><NumberField label="Tip x" value={tip[0]} onCommit={(x) => onEdit({ kind: "setAxis", weapon, body: name, end: "tip", at: [x, tip[1]] })} /></dd>
        <dt>Tip y</dt>
        <dd><NumberField label="Tip y" value={tip[1]} onCommit={(y) => onEdit({ kind: "setAxis", weapon, body: name, end: "tip", at: [tip[0], y] })} /></dd>
        {body.grips.map((grip) => (
          <Fragment key={grip.name}>
            <dt className={grip.name === picked ? "inspector__picked" : undefined}>Grip</dt>
            <dd className={grip.name === picked ? "inspector__picked" : undefined}><code>{grip.name}</code> · <code>{grip.chain}</code></dd>
            <dt>{grip.name} x</dt>
            <dd><NumberField label={`${grip.name} grip x`} value={grip.at[0]} onCommit={(x) => onEdit({ kind: "setGrip", weapon, body: name, grip: grip.name, at: [x, grip.at[1]] })} /></dd>
            <dt>{grip.name} y</dt>
            <dd><NumberField label={`${grip.name} grip y`} value={grip.at[1]} onCommit={(y) => onEdit({ kind: "setGrip", weapon, body: name, grip: grip.name, at: [grip.at[0], y] })} /></dd>
            {grip.angle !== undefined ? (
              <>
                <dt>{grip.name} angle</dt>
                <dd><NumberField label={`${grip.name} grip angle`} value={grip.angle} onCommit={(angle) => onEdit({ kind: "setGripAngle", weapon, body: name, grip: grip.name, angle })} /></dd>
              </>
            ) : null}
          </Fragment>
        ))}
      </dl>
      <p className="panel__note">
        The hands hold these grips on every {weapon} key, so moving a grip moves the hands throughout the {weapon} class.
        {placement ? ` The hold is where the ${body.name} sits at rest and in the wardrobe, and the editor fills a missing ${weapon} animation's keys from it; existing keys keep theirs.` : ""}
      </p>
      {violations.length ? <p className="panel__note panel__note--error">{violations.join("; ")}</p> : null}
    </div>
  );
}
