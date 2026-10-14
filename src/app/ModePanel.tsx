import type { Dispatch } from "react";
import type { Placed, Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabAnimation } from "../format/animation";
import type { RigLabDocument } from "../format/document";
import type { Action, EditorState } from "../editor/state";
import type { Constraints } from "../solve";
import { BoneSetup } from "./BoneSetup";
import { ExportPanel } from "./ExportPanel";
import { Inspector } from "./Inspector";
import { PoseInspector } from "./PoseInspector";
import { WeaponPicker } from "./WeaponPicker";

interface ModePanelProps {
  readonly state: EditorState;
  readonly dispatch: Dispatch<Action>;
  readonly document: RigLabDocument;
  readonly animation: RigLabAnimation | null;
  /** The pose and constraints as shown, including a drag in progress. */
  readonly pose: Pose;
  readonly constraints: Constraints;
  readonly placed: ReadonlyMap<string, Placed>;
}

/** The right panel for the mode: export, the selected bone's setup, pose with the weapon picker, or the inspector. */
export function ModePanel({ state, dispatch, document, animation, pose, constraints, placed }: ModePanelProps) {
  const selectedBone = state.selection?.kind === "bone" ? state.selection.name : null;
  const keyed = animation?.keys.some((key) => key.frame === state.frame) ?? false;
  if (state.mode === "export") {
    return <ExportPanel document={document} active={animation} onStatus={(status) => dispatch({ type: "status", status })} />;
  }
  if (state.mode === "setup" && selectedBone) {
    return <BoneSetup rig={document.rig} bone={selectedBone} onEdit={(edit) => dispatch({ type: "rigEdit", edit })} />;
  }
  const inspector = state.mode === "pose" && selectedBone && animation ? (
    <PoseInspector
      rig={document.rig}
      bone={selectedBone}
      pose={pose}
      constraints={constraints}
      placed={placed}
      frame={state.frame}
      keyed={keyed}
      onPose={(next, held, note, warning) => dispatch({ type: "setPose", pose: next, constraints: held, note, warning })}
      onError={(text) => dispatch({ type: "status", status: { tone: "error", text } })}
    />
  ) : (
    <Inspector
      rig={document.rig}
      selection={state.selection}
      active={animation}
      pose={pose}
      placed={placed}
      animations={document.animations}
      onRename={(from, to) => dispatch({ type: "renameAnimation", from, to })}
    />
  );
  if (state.mode !== "pose" || !animation) return inspector;
  return (
    <div className="setup">
      {inspector}
      <WeaponPicker held={constraints.weapon?.weapon.name ?? null} frame={state.frame} keyed={keyed} onPick={(name) => dispatch({ type: "holdWeapon", name })} />
    </div>
  );
}
