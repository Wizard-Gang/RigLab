import type { ReactNode } from "react";
import type { PanelSide } from "../editor/panels";

interface SidePanelProps {
  readonly side: PanelSide;
  /** What the panel holds, shown on its collapsed rail and named by its toggle. */
  readonly label: string;
  /** The open panel's heading. */
  readonly title: ReactNode;
  readonly titleId: string;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}

/**
 * A side panel that collapses to a thin rail beside the canvas. Its content stays mounted while hidden, so a
 * half-typed field or a chosen option is still there when it opens again.
 */
export function SidePanel({ side, label, title, titleId, collapsed, onToggle, children }: SidePanelProps) {
  const body = `panel-${side}-body`;
  const name = `the ${label.toLowerCase()} panel`;
  return (
    <aside className={`panel panel--${side}${collapsed ? " panel--collapsed" : ""}`} aria-label={label}>
      {collapsed ? (
        <button type="button" className="panel__rail" aria-expanded={false} aria-controls={body} aria-label={`Expand ${name}`} title={`Expand ${name}`} onClick={onToggle}>
          <span className="panel__chevron" aria-hidden="true">{side === "left" ? "›" : "‹"}</span>
          <span className="panel__rail-label">{label}</span>
        </button>
      ) : (
        <div className="panel__head">
          <h2 className="panel__title" id={titleId}>{title}</h2>
          <button type="button" className="panel__toggle" aria-expanded={true} aria-controls={body} aria-label={`Collapse ${name}`} title={`Collapse ${name}`} onClick={onToggle}>
            <span aria-hidden="true">{side === "left" ? "‹" : "›"}</span>
          </button>
        </div>
      )}
      <div className="panel__body" id={body} hidden={collapsed}>{children}</div>
    </aside>
  );
}
