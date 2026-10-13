// Which side panels are collapsed: a per-viewer convenience kept in browser storage, never in the document or history.

export type PanelSide = "left" | "right";

export interface Panels {
  readonly left: boolean;
  readonly right: boolean;
}

export const PANELS_KEY = "riglab.panels";
export const OPEN_PANELS: Panels = Object.freeze({ left: false, right: false });

/** The part of `Storage` panels use; either call may throw where storage is blocked. */
export type PanelStorage = Pick<Storage, "getItem" | "setItem">;

/** Read the collapsed panels; missing, blocked or malformed storage leaves both open. */
export function readPanels(storage: PanelStorage | null): Panels {
  try {
    const value: unknown = JSON.parse(storage?.getItem(PANELS_KEY) ?? "null");
    if (typeof value !== "object" || value === null) return OPEN_PANELS;
    const { left, right } = value as Record<string, unknown>;
    return { left: left === true, right: right === true };
  } catch {
    return OPEN_PANELS;
  }
}

/** Remember the collapsed panels where storage allows; a failure only means they are not remembered. */
export function writePanels(storage: PanelStorage | null, panels: Panels): void {
  try {
    storage?.setItem(PANELS_KEY, JSON.stringify({ left: panels.left, right: panels.right }));
  } catch {
    // Private windows and blocked site data refuse writes; the panels still toggle for this visit.
  }
}

export const togglePanel = (panels: Panels, side: PanelSide): Panels => ({ ...panels, [side]: !panels[side] });
