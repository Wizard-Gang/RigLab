import { shortcutLabel } from "../editor/shortcuts";
import type { Command, Platform } from "../editor/shortcuts";
import { MODES } from "../editor/state";
import type { Mode } from "../editor/state";
import { TEMPLATES } from "../editor/templates";
import type { TemplateId } from "../editor/templates";

interface ToolbarProps {
  readonly platform: Platform;
  readonly mode: Mode;
  readonly onMode: (mode: Mode) => void;
  readonly onCommand: (command: Command) => void;
  /** Start a new document from a template. */
  readonly onNew: (template: TemplateId) => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly title: string;
  readonly dirty: boolean;
}

const FILE: readonly { readonly command: Command; readonly label: string }[] = [
  { command: "open", label: "Open" },
  { command: "save", label: "Save" },
  { command: "saveAs", label: "Save As" },
];

export function Toolbar({ platform, mode, onMode, onCommand, onNew, canUndo, canRedo, title, dirty }: ToolbarProps) {
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
        <select
          className="tool tool--menu"
          aria-label="New document from a template"
          title={`New document (${shortcutLabel("new", platform)} starts a Hexframe humanoid)`}
          value=""
          onChange={(event) => onNew(event.target.value as TemplateId)}
        >
          <option value="" disabled>New…</option>
          {TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
        </select>
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
      <p className="app__document" title={dirty ? "Unsaved changes" : "Saved"}>
        {title}
        {dirty ? <span className="app__dirty" aria-label="unsaved changes"> ●</span> : null}
      </p>
    </header>
  );
}
