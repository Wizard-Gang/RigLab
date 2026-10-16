import type { Dispatch } from "react";
import type { Placed, Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabAnimation } from "../format/animation";
import type { LibraryModel, ModelWeapon } from "../editor/model";
import type { Action, EditorState } from "../editor/state";
import type { Constraints } from "../solve";
import { BoneSetup } from "./BoneSetup";
import { ExportPanel } from "./ExportPanel";
import { Inspector } from "./Inspector";
import { PoseInspector } from "./PoseInspector";
import { WeaponSetup } from "./WeaponSetup";

interface ModePanelProps {
  readonly state: EditorState;
  readonly dispatch: Dispatch<Action>;
  readonly model: LibraryModel;
  readonly animation: RigLabAnimation | null;
  /** The pose and constraints as shown, including a drag in progress. */
  readonly pose: Pose;
  readonly constraints: Constraints;
  readonly placed: ReadonlyMap<string, Placed>;
  /** In Rig setup, the active class's weapon and its hold, and the grips the hands cannot reach at rest. */
  readonly armed: ModelWeapon | null;
  readonly violations: readonly string[];
}

/** The right panel for the mode: export, the selected bone's setup, its pose, or the inspector. */
export function ModePanel({ state, dispatch, model, animation, pose, constraints, placed, armed, violations }: ModePanelProps) {
  const selectedBone = state.selection?.kind === "bone" ? state.selection.name : null;
  const keyed = animation?.keys.some((key) => key.frame === state.frame) ?? false;
  if (state.mode === "export") {
    return <ExportPanel model={model} active={animation} onStatus={(status) => dispatch({ type: "status", status })} />;
  }
  if (state.mode === "setup" && selectedBone) {
    return <BoneSetup rig={model.rig} bone={selectedBone} onEdit={(edit) => dispatch({ type: "rigEdit", edit })} />;
  }
  const part = state.selection?.kind === "body" || state.selection?.kind === "grip" ? state.selection : null;
  if (state.mode === "setup" && armed && part) {
    return (
      <WeaponSetup
        held={armed}
        body={part.body}
        grip={part.kind === "grip" ? part.grip : null}
        violations={violations}
        onEdit={(edit) => dispatch({ type: "weaponEdit", edit })}
      />
    );
  }
  if (state.selection === null) {
    // Each mode's empty panel says what to do next there.
    const weapon = armed ? `, or a part of the ${armed.weapon.name} under the bones to set its hold, grips and axis` : "";
    return state.mode === "setup"
      ? <p className="panel__empty">Select a joint on the canvas or in the hierarchy to set its rest offset, tip, slot and limits{weapon}.</p>
      : <p className="panel__empty">Select a joint on a key to pose it: step to a key on the timeline, then drag the joint, a hand or the pelvis, or type its rotation here.</p>;
  }
  return state.mode === "animate" && selectedBone && animation ? (
    <PoseInspector
      rig={model.rig}
      bone={selectedBone}
      pose={pose}
      constraints={constraints}
      placed={placed}
      frame={state.frame}
      keyed={keyed}
      readOnly={state.playing}
      onPose={(next, held, note, warning) => dispatch({ type: "setPose", pose: next, constraints: held, note, warning })}
      onError={(text) => dispatch({ type: "status", status: { tone: "error", text } })}
    />
  ) : (
    <Inspector
      rig={model.rig}
      selection={state.selection}
      active={animation}
      pose={pose}
      placed={placed}
      animations={model.animations}
    />
  );
}
