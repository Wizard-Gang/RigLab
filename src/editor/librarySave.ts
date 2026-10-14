// Saving the editor into the library folder through the dev server, and what to do when another save changes it.
import { freeBodies } from "../format/weapon";
import { SAVE_ROUTE } from "../library/save";
import type { LibraryModel } from "./model";

export type SaveAnswer =
  | { readonly ok: true; readonly saveId: string; readonly note: string }
  | { readonly ok: false; readonly error: string };

const NEEDS_DEV_SERVER = "Save needs npm start: only the dev server can write the library folder";

/** The save body: the rig, each library weapon with its hold (null when every body rides a hand), and the animations. */
export function saveBody(model: LibraryModel): Readonly<Record<string, unknown>> {
  const weapons = model.weapons.map(({ weapon, hold }) => ({ weapon, hold: freeBodies(weapon).length ? hold : null }));
  return { rig: model.rig, weapons, animations: model.animations };
}

/** Post the model to the dev server. Every failure becomes one line for the status bar. */
export async function saveToLibrary(model: LibraryModel, fetchImpl: typeof fetch = fetch): Promise<SaveAnswer> {
  let response: Response;
  try {
    response = await fetchImpl(SAVE_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saveBody(model)),
    });
  } catch (error) {
    return { ok: false, error: `${NEEDS_DEV_SERVER} (${(error as Error).message})` };
  }
  let reply: Record<string, unknown> | null = null;
  try {
    reply = await response.json() as Record<string, unknown>;
  } catch {
    reply = null;
  }
  if (!reply || (response.status === 404 && !Array.isArray(reply.errors))) return { ok: false, error: NEEDS_DEV_SERVER };
  if (!response.ok || reply.ok !== true) {
    const errors = Array.isArray(reply.errors) ? reply.errors.map(String) : [`the dev server answered ${response.status}`];
    const more = errors.length > 1 ? ` (and ${errors.length - 1} more)` : "";
    return { ok: false, error: `Save refused: ${errors[0]}${more}` };
  }
  const changed = (reply.written as readonly string[]).length + (reply.removed as readonly string[]).length;
  const library = String(reply.library);
  const note = changed ? `Saved ${changed} ${changed === 1 ? "file" : "files"} to ${library}` : `${library} already holds this`;
  return { ok: true, saveId: String(reply.saveId), note };
}

export type SavedReaction = "ignore" | "reload" | "warn";

/** Another page's save reloads a clean editor and warns a dirty one; the editor's own save changes nothing. */
export function reactToSave(saveId: string, own: ReadonlySet<string>, dirty: boolean): SavedReaction {
  if (own.has(saveId)) return "ignore";
  return dirty ? "warn" : "reload";
}
