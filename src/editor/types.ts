// The editor's state, actions and the small accessors every part of the editor shares.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabAnimation } from "../format/animation";
import type { RigLabDocument } from "../format/document";
import type { AnimationKind } from "../format/timing";
import type { Constraints } from "../solve/constraints";
import type { History } from "./history";
import type { RigEdit } from "./rigEdits";
import type { TimelineEdit } from "./timeline";
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
  | null;

export interface Status {
  readonly tone: "info" | "error";
  readonly text: string;
}

export interface EditorState {
  readonly history: History<RigLabDocument>;
  /** The library folder's rig and animations as last loaded or saved; any other present document is unsaved. */
  readonly saved: RigLabDocument;
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
  /** The library folder now holds `document`; `note` says what was written. */
  | { readonly type: "saved"; readonly document: RigLabDocument; readonly note: string }
  | { readonly type: "imported"; readonly document: RigLabDocument; readonly source: string }
  | { readonly type: "status"; readonly status: Status | null }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "addAnimation"; readonly kind: AnimationKind }
  | { readonly type: "duplicateAnimation"; readonly name: string }
  | { readonly type: "renameAnimation"; readonly from: string; readonly to: string }
  | { readonly type: "deleteSelection" }
  | { readonly type: "rigEdit"; readonly edit: RigEdit }
  | { readonly type: "timeline"; readonly edit: TimelineEdit }
  /** Hold a weapon by name on the key at the current frame, or let go of it with null. */
  | { readonly type: "holdWeapon"; readonly name: string | null }
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
  | { readonly type: "setMode"; readonly mode: Mode }
  | { readonly type: "setFrame"; readonly frame: number }
  | { readonly type: "stepKey"; readonly direction: -1 | 1 }
  | { readonly type: "setView"; readonly view: View }
  | { readonly type: "setGrid"; readonly spacing: number }
  | { readonly type: "setSnap"; readonly snap: boolean }
  | { readonly type: "setRotationSnap"; readonly degrees: number }
  | { readonly type: "setOnion"; readonly onion: boolean }
  | { readonly type: "setArt"; readonly art: boolean };

export const documentOf = (state: EditorState): RigLabDocument => state.history.present;
export const isDirty = (state: EditorState): boolean => state.history.present !== state.saved;

export function activeAnimationOf(state: EditorState): RigLabAnimation | null {
  return documentOf(state).animations.find((animation) => animation.name === state.activeAnimation) ?? null;
}

export const info = (text: string): Status => ({ tone: "info", text });
export const error = (text: string): Status => ({ tone: "error", text });
