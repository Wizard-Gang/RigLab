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
      <div className="toolbar" role="toolbar" aria-label="Library">
        {button("save", "Save")}
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
      <p className="app__document" title={dirty ? "Unsaved changes: Save writes them to the library folder" : "The library folder holds everything shown"}>
        {title}
        {dirty ? <span className="app__dirty" aria-label="unsaved changes"> ●</span> : null}
      </p>
    </header>
  );
}
