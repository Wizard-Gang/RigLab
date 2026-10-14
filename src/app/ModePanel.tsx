import type { Dispatch } from "react";
import type { Placed, Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabAnimation } from "../format/animation";
import type { LibraryModel } from "../editor/model";
import type { Action, EditorState } from "../editor/state";
import type { Constraints } from "../solve";
import { BoneSetup } from "./BoneSetup";
import { ExportPanel } from "./ExportPanel";
import { Inspector } from "./Inspector";
import { PoseInspector } from "./PoseInspector";

interface ModePanelProps {
  readonly state: EditorState;
  readonly dispatch: Dispatch<Action>;
  readonly model: LibraryModel;
  readonly animation: RigLabAnimation | null;
  /** The pose and constraints as shown, including a drag in progress. */
  readonly pose: Pose;
  readonly constraints: Constraints;
  readonly placed: ReadonlyMap<string, Placed>;
}

/** The right panel for the mode: export, the selected bone's setup, its pose, or the inspector. */
export function ModePanel({ state, dispatch, model, animation, pose, constraints, placed }: ModePanelProps) {
  const selectedBone = state.selection?.kind === "bone" ? state.selection.name : null;
  const keyed = animation?.keys.some((key) => key.frame === state.frame) ?? false;
  if (state.mode === "export") {
    return <ExportPanel model={model} active={animation} onStatus={(status) => dispatch({ type: "status", status })} />;
  }
  if (state.mode === "setup" && selectedBone) {
    return <BoneSetup rig={model.rig} bone={selectedBone} onEdit={(edit) => dispatch({ type: "rigEdit", edit })} />;
  }
  return state.mode === "pose" && selectedBone && animation ? (
    <PoseInspector
      rig={model.rig}
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
      rig={model.rig}
      selection={state.selection}
      active={animation}
      pose={pose}
      placed={placed}
      animations={model.animations}
    />
  );
}
