import { useCallback, useEffect, useState } from "react";
import { readPanels, togglePanel, writePanels } from "../editor/panels";
import type { PanelPart, Panels, PanelStorage } from "../editor/panels";

/** This viewer's browser storage, or null where even reaching it throws. */
function storage(): PanelStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Which side panels are collapsed and whether the hierarchy is folded, remembered for this viewer where the browser allows it. */
export function usePanels(): readonly [Panels, (part: PanelPart) => void] {
  const [panels, setPanels] = useState<Panels>(() => readPanels(storage()));
  useEffect(() => writePanels(storage(), panels), [panels]);
  const toggle = useCallback((part: PanelPart) => setPanels((current) => togglePanel(current, part)), []);
  return [panels, toggle];
}
