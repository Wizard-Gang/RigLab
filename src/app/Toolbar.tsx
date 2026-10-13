import { shortcutLabel } from "../editor/shortcuts";
import type { Command, Platform } from "../editor/shortcuts";
import { MODES } from "../editor/state";
import type { Mode } from "../editor/state";

interface ToolbarProps {
  readonly platform: Platform;
  readonly mode: Mode;
  readonly onMode: (mode: Mode) => void;
  readonly onCommand: (command: Command) => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly title: string;
  readonly dirty: boolean;
}

const FILE: readonly { readonly command: Command; readonly label: string }[] = [
  { command: "new", label: "New" },
  { command: "open", label: "Open" },
  { command: "save", label: "Save" },
  { command: "saveAs", label: "Save As" },
];

export function Toolbar({ platform, mode, onMode, onCommand, canUndo, canRedo, title, dirty }: ToolbarProps) {
  const button = (command: Command, label: string, disabled = false) => (
    <button
      key={command}
      type="button"
      className="tool"
      disabled={disabled}
      title={`${label} (${shortcutLabel(command, platform)})`}
      onClick={() => onCommand(command)}
    >
      {label}
    </button>
  );
  return (
    <header className="app__bar">
      <h1 className="app__title">RigLab</h1>
      <div className="toolbar" role="toolbar" aria-label="File">
        {FILE.map(({ command, label }) => button(command, label))}
      </div>
      <div className="toolbar" role="toolbar" aria-label="Edit">
        {button("undo", "Undo", !canUndo)}
        {button("redo", "Redo", !canRedo)}
      </div>
      <div className="modes" role="tablist" aria-label="Mode">
        {MODES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            className="mode"
            aria-selected={entry.id === mode}
            onClick={() => onMode(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <a className="tool" href="wardrobe/" title="Step through every skin, part, weapon and animation in the library">Wardrobe</a>
      <p className="app__document" title={dirty ? "Unsaved changes" : "Saved"}>
        {title}
        {dirty ? <span className="app__dirty" aria-label="unsaved changes"> ●</span> : null}
      </p>
    </header>
  );
}
