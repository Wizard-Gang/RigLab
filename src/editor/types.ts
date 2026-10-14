// The editor's state, actions and the small accessors every part of the editor shares.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabAnimation } from "../format/animation";
import type { Constraints } from "../solve/constraints";
import type { History } from "./history";
import type { LibraryModel } from "./model";
import type { RigEdit } from "./rigEdits";
import type { TimelineEdit } from "./timeline";
import type { WeaponEdit } from "./weaponEdits";
import type { View } from "./view";

export type Mode = "setup" | "pose" | "animate" | "export";
export const MODES: readonly { readonly id: Mode; readonly label: string }[] = [
  { id: "setup", label: "Rig setup" },
  { id: "pose", label: "Pose" },
  { id: "animate", label: "Animation" },
  { id: "export", label: "Export" },
];

export type Selection =
  | { readonly kind: "bone"; readonly name: string }
  | { readonly kind: "animation"; readonly name: string }
  | { readonly kind: "key"; readonly frame: number }
  /** A body of the active class's weapon, or one of its grips. */
  | { readonly kind: "body"; readonly weapon: string; readonly body: string }
  | { readonly kind: "grip"; readonly weapon: string; readonly body: string; readonly grip: string }
  | null;

export interface Status {
  readonly tone: "info" | "error";
  readonly text: string;
}

export interface EditorState {
  readonly history: History<LibraryModel>;
  /** The library folder's model as last loaded or saved; any other present model is unsaved. */
  readonly saved: LibraryModel;
  readonly mode: Mode;
  readonly selection: Selection;
  readonly activeAnimation: string | null;
  readonly frame: number;
  readonly view: View;
  readonly grid: number;
  readonly snap: boolean;
  /** Rotation-snap increment in degrees for rotating joints; 0 is off. */
  readonly rotationSnap: number;
  /** Show the previous and next keys as faint skeletons. */
  readonly onion: boolean;
  /** Draw the bound part art under the skeleton. */
  readonly art: boolean;
  readonly status: Status | null;
}

export type Action =
  /** The library folder now holds `model`; `note` says what was written. */
  | { readonly type: "saved"; readonly model: LibraryModel; readonly note: string }
  | { readonly type: "status"; readonly status: Status | null }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "deleteSelection" }
  | { readonly type: "rigEdit"; readonly edit: RigEdit }
  | { readonly type: "weaponEdit"; readonly edit: WeaponEdit }
  | { readonly type: "timeline"; readonly edit: TimelineEdit }
  | {
    readonly type: "setPose";
    readonly pose: Pose;
    readonly constraints?: Constraints;
    /** What the edit did, such as pinning a foot. */
    readonly note?: string | null;
    /** What the solver could not do, such as reach a target. */
    readonly warning?: string | null;
  }
  | { readonly type: "select"; readonly selection: Selection }
  | { readonly type: "activateAnimation"; readonly name: string }
  /** Switch to the class's animation of the active kind. */
  | { readonly type: "setClass"; readonly animationClass: string }
  | { readonly type: "setMode"; readonly mode: Mode }
  | { readonly type: "setFrame"; readonly frame: number }
  | { readonly type: "stepKey"; readonly direction: -1 | 1 }
  | { readonly type: "setView"; readonly view: View }
  | { readonly type: "setGrid"; readonly spacing: number }
  | { readonly type: "setSnap"; readonly snap: boolean }
  | { readonly type: "setRotationSnap"; readonly degrees: number }
  | { readonly type: "setOnion"; readonly onion: boolean }
  | { readonly type: "setArt"; readonly art: boolean };

export const modelOf = (state: EditorState): LibraryModel => state.history.present;
export const isDirty = (state: EditorState): boolean => state.history.present !== state.saved;

export function activeAnimationOf(state: EditorState): RigLabAnimation | null {
  return modelOf(state).animations.find((animation) => animation.name === state.activeAnimation) ?? null;
}

export const info = (text: string): Status => ({ tone: "info", text });
export const error = (text: string): Status => ({ tone: "error", text });
