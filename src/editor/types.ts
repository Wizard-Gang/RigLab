// The editor's state, actions and the small accessors every part of the editor shares.
import type { Pose } from "../../vendor/hexframe/src/rig";
import type { RigLabAnimation } from "../format/animation";
import type { RigLabDocument } from "../format/document";
import type { Constraints } from "../solve/constraints";
import type { History } from "./history";
import type { RigEdit } from "./rigEdits";
import type { TimelineEdit } from "./timeline";
import type { View } from "./view";

export type Mode = "setup" | "pose" | "animate";
export const MODES: readonly { readonly id: Mode; readonly label: string }[] = [
  { id: "setup", label: "Rig setup" },
  { id: "pose", label: "Pose" },
  { id: "animate", label: "Animation" },
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
  /** The document as last created, opened or saved; any other present document is unsaved. */
  readonly saved: RigLabDocument;
  /** The file the document was opened from or saved to, or null before the first save. */
  readonly fileName: string | null;
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
  readonly status: Status | null;
}

export type Action =
  | { readonly type: "new" }
  | { readonly type: "open"; readonly document: RigLabDocument; readonly fileName: string }
  | { readonly type: "saved"; readonly document: RigLabDocument; readonly fileName: string }
  | { readonly type: "status"; readonly status: Status | null }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "addAnimation" }
  | { readonly type: "duplicateAnimation"; readonly name: string }
  | { readonly type: "renameAnimation"; readonly from: string; readonly to: string }
  | { readonly type: "deleteSelection" }
  | { readonly type: "rigEdit"; readonly edit: RigEdit }
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
  | { readonly type: "setMode"; readonly mode: Mode }
  | { readonly type: "setFrame"; readonly frame: number }
  | { readonly type: "stepKey"; readonly direction: -1 | 1 }
  | { readonly type: "setView"; readonly view: View }
  | { readonly type: "setGrid"; readonly spacing: number }
  | { readonly type: "setSnap"; readonly snap: boolean }
  | { readonly type: "setRotationSnap"; readonly degrees: number }
  | { readonly type: "setOnion"; readonly onion: boolean };

export const documentOf = (state: EditorState): RigLabDocument => state.history.present;
export const isDirty = (state: EditorState): boolean => state.history.present !== state.saved;

export function activeAnimationOf(state: EditorState): RigLabAnimation | null {
  return documentOf(state).animations.find((animation) => animation.name === state.activeAnimation) ?? null;
}

export const info = (text: string): Status => ({ tone: "info", text });
export const error = (text: string): Status => ({ tone: "error", text });
