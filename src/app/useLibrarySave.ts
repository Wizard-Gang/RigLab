import { useCallback, useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { reactToSave, saveToLibrary } from "../editor/librarySave";
import { isDirty, modelOf } from "../editor/state";
import type { Action, EditorState } from "../editor/state";
import { LIBRARY_LABEL } from "../library/active";
import { SAVED_EVENT } from "../library/save";
import type { SavedEvent } from "../library/save";

/**
 * Save writes the library folder, the editor's only source. A save from another page reloads this one when nothing
 * here is unsaved, and warns when something is. Its own save's event can arrive before the save's answer, so events
 * that arrive mid-save wait for the answer.
 */
export function useLibrarySave(state: EditorState, dispatch: Dispatch<Action>): () => Promise<void> {
  const latest = useRef(state);
  latest.current = state;
  const own = useRef(new Set<string>());
  const saving = useRef(false);
  const waiting = useRef<SavedEvent[]>([]);

  const react = useCallback((event: SavedEvent) => {
    const reaction = reactToSave(event.saveId, own.current, isDirty(latest.current));
    if (reaction === "reload") window.location.reload();
    else if (reaction === "warn") {
      const text = `${LIBRARY_LABEL} was saved from another page; Save here replaces those changes`;
      dispatch({ type: "status", status: { tone: "error", text } });
    }
  }, [dispatch]);

  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return undefined;
    const listener = (event: SavedEvent): void => {
      if (saving.current) waiting.current.push(event);
      else react(event);
    };
    hot.on(SAVED_EVENT, listener);
    return () => hot.off(SAVED_EVENT, listener);
  }, [react]);

  return useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    const model = modelOf(latest.current);
    const answer = await saveToLibrary(model);
    if (answer.ok) {
      own.current.add(answer.saveId);
      dispatch({ type: "saved", model, note: answer.note });
    } else {
      dispatch({ type: "status", status: { tone: "error", text: answer.error } });
    }
    saving.current = false;
    for (const event of waiting.current.splice(0)) react(event);
  }, [dispatch, react]);
}
