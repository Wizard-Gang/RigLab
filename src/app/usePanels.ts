import { useCallback, useEffect, useState } from "react";
import { readPanels, togglePanel, writePanels } from "../editor/panels";
import type { PanelSide, Panels, PanelStorage } from "../editor/panels";

/** This viewer's browser storage, or null where even reaching it throws. */
function storage(): PanelStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Which side panels are collapsed, remembered for this viewer where the browser allows it. */
export function usePanels(): readonly [Panels, (side: PanelSide) => void] {
  const [panels, setPanels] = useState<Panels>(() => readPanels(storage()));
  useEffect(() => writePanels(storage(), panels), [panels]);
  const toggle = useCallback((side: PanelSide) => setPanels((current) => togglePanel(current, side)), []);
  return [panels, toggle];
}
