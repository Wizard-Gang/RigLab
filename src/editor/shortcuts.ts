// Keyboard shortcuts. Browsers reserve Mod+N for a new window, so New is Mod+Alt+N.
// Arrow keys step frames, Shift+arrows step keys, and Space plays or pauses.

export type Command =
  | "new" | "open" | "save" | "saveAs" | "undo" | "redo" | "delete" | "escape"
  | "previousFrame" | "nextFrame" | "previousKey" | "nextKey" | "togglePlay";

export interface KeyInput {
  readonly key: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

export type Platform = "mac" | "other";

export const SHORTCUTS: Readonly<Record<Command, string>> = Object.freeze({
  new: "Mod+Alt+N",
  open: "Mod+O",
  save: "Mod+S",
  saveAs: "Mod+Shift+S",
  undo: "Mod+Z",
  redo: "Mod+Shift+Z",
  delete: "Delete",
  escape: "Escape",
  previousFrame: "Left",
  nextFrame: "Right",
  previousKey: "Shift+Left",
  nextKey: "Shift+Right",
  togglePlay: "Space",
});

export function platformOf(userAgent: string): Platform {
  return /Mac|iPhone|iPad/.test(userAgent) ? "mac" : "other";
}

/** Render a shortcut for display: ⌘ and ⌥ on macOS, Ctrl and Alt elsewhere. */
export function shortcutLabel(command: Command, platform: Platform): string {
  const parts = SHORTCUTS[command].split("+");
  const names: Record<string, string> = platform === "mac"
    ? { Mod: "⌘", Alt: "⌥", Shift: "⇧", Left: "←", Right: "→" }
    : { Mod: "Ctrl", Alt: "Alt", Shift: "Shift", Left: "←", Right: "→" };
  return parts.map((part) => names[part] ?? part).join(platform === "mac" ? "" : "+");
}

/** The command a key press asks for, or null. `code` keeps letters stable under Alt and layouts. */
export function commandFor(input: KeyInput, platform: Platform): Command | null {
  const mod = platform === "mac" ? input.metaKey && !input.ctrlKey : input.ctrlKey && !input.metaKey;
  if (!mod) {
    if (input.metaKey || input.ctrlKey || input.altKey) return null;
    if (input.key === "Escape") return "escape";
    if (input.key === "Delete" || input.key === "Backspace") return "delete";
    if (input.key === "ArrowLeft") return input.shiftKey ? "previousKey" : "previousFrame";
    if (input.key === "ArrowRight") return input.shiftKey ? "nextKey" : "nextFrame";
    if (input.key === " " && !input.shiftKey) return "togglePlay";
    return null;
  }
  const letter = input.code.startsWith("Key") ? input.code.slice(3) : "";
  if (letter === "N" && input.altKey && !input.shiftKey) return "new";
  if (input.altKey) return null;
  if (letter === "O" && !input.shiftKey) return "open";
  if (letter === "S") return input.shiftKey ? "saveAs" : "save";
  if (letter === "Z") return input.shiftKey ? "redo" : "undo";
  if (letter === "Y" && !input.shiftKey) return "redo";
  return null;
}
