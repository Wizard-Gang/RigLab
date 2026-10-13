import { useCallback, useRef } from "react";
import type { Dispatch } from "react";
import { DOCUMENT_EXTENSION, parseDocument, serializeDocument } from "../format/document";
import { openFile, saveFile } from "../editor/files";
import type { FileHandle } from "../editor/files";
import { documentOf, isDirty } from "../editor/state";
import type { TemplateId } from "../editor/templates";
import type { Action, EditorState } from "../editor/state";

export interface FileCommands {
  readonly newDocument: (template?: TemplateId) => void;
  readonly open: () => Promise<void>;
  readonly save: () => Promise<void>;
  readonly saveAs: () => Promise<void>;
}

const DISCARD = "Discard the unsaved changes to this document?";

/** New, Open, Save and Save As. The file handle lives here; the reducer only records what happened. */
export function useFileCommands(state: EditorState, dispatch: Dispatch<Action>): FileCommands {
  const handle = useRef<FileHandle | null>(null);
  const latest = useRef(state);
  latest.current = state;

  const fail = useCallback((what: string, error: unknown) => {
    dispatch({ type: "status", status: { tone: "error", text: `${what} failed: ${(error as Error).message ?? String(error)}` } });
  }, [dispatch]);

  const newDocument = useCallback((template?: TemplateId) => {
    if (isDirty(latest.current) && !window.confirm(DISCARD)) return;
    handle.current = null;
    dispatch({ type: "new", template });
  }, [dispatch]);

  const open = useCallback(async () => {
    if (isDirty(latest.current) && !window.confirm(DISCARD)) return;
    try {
      const file = await openFile();
      if (!file) return;
      const parsed = parseDocument(file.text);
      if (!parsed.ok) {
        const more = parsed.errors.length > 1 ? ` (and ${parsed.errors.length - 1} more)` : "";
        dispatch({ type: "status", status: { tone: "error", text: `Cannot open ${file.name}: ${parsed.errors[0]}${more}` } });
        return;
      }
      handle.current = file.handle;
      dispatch({ type: "open", document: parsed.value, fileName: file.name });
    } catch (error) {
      fail("Open", error);
    }
  }, [dispatch, fail]);

  const write = useCallback(async (target: FileHandle | null) => {
    const document = documentOf(latest.current);
    const suggested = latest.current.fileName ?? `${document.rig.name}${DOCUMENT_EXTENSION}`;
    try {
      const saved = await saveFile(serializeDocument(document), target, suggested);
      if (!saved) return;
      handle.current = saved.handle;
      dispatch({ type: "saved", document, fileName: saved.name });
    } catch (error) {
      fail("Save", error);
    }
  }, [dispatch, fail]);

  const save = useCallback(() => write(handle.current), [write]);
  const saveAs = useCallback(() => write(null), [write]);
  return { newDocument, open, save, saveAs };
}
