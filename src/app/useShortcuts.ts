import { useEffect, useRef } from "react";
import { commandFor } from "../editor/shortcuts";
import type { Command, Platform } from "../editor/shortcuts";

/** Text entry keeps its own keys: undo, delete and escape inside a field belong to the field. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function useShortcuts(platform: Platform, run: (command: Command) => void): void {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isEditable(event.target)) return;
      const command = commandFor(event, platform);
      if (!command) return;
      event.preventDefault();
      latest.current(command);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [platform]);
}
