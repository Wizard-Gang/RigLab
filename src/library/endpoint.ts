// Node only: the dev server's save endpoint. Only RigLab's own page, served on a loopback host, may write the folder.
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { readLibraryFolder } from "./folder";
import type { LibraryFolder } from "./folder";
import { planLibrarySave } from "./save";
import { writeLibrarySave } from "./write";
import type { WriteResult } from "./write";

export const MAX_SAVE_BYTES = 2 * 1024 * 1024;
// Vite's own host check runs after plugin middleware, so the endpoint checks the host itself: a page on another site,
// or one that reaches the server through a DNS-rebound name, never writes the folder.
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;

export interface SaveRequest {
  readonly method?: string | undefined;
  readonly url?: string | undefined;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}

export interface SaveOutcome {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
  /** Set when the folder was written. */
  readonly result?: WriteResult & { readonly saveId: string };
}

const header = (request: SaveRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : (value as string | undefined);
};
const refuse = (status: number, ...errors: readonly string[]): SaveOutcome => ({ status, body: { ok: false, errors } });

/** Why `request` may not save, or null. `readOnly` is true while the placeholder library is in use. */
export function saveRequestRefusal(request: SaveRequest, readOnly: boolean): SaveOutcome | null {
  if (request.url !== undefined && request.url !== "/" && request.url !== "") return refuse(404, "no such endpoint");
  if (request.method !== "POST") return refuse(405, "save with POST");
  const host = header(request, "host");
  if (!host || !LOOPBACK_HOST.test(host)) return refuse(403, "save only from a page served on localhost");
  if (header(request, "origin") !== `http://${host}`) return refuse(403, "save only from RigLab's own page");
  const site = header(request, "sec-fetch-site");
  if (site !== undefined && site !== "same-origin") return refuse(403, "save only from RigLab's own page");
  if (!/^application\/json\s*(?:;|$)/i.test(header(request, "content-type") ?? "")) return refuse(415, "send the save as application/json");
  if (readOnly) {
    return refuse(409, "the placeholder library is read-only: set RIGLAB_LIBRARY to a library folder, or create ~/Documents/RigLab");
  }
  return null;
}

/** The request body as text, refusing more than `limit` bytes. */
export function readBody(request: IncomingMessage, limit = MAX_SAVE_BYTES): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    // An oversized body is drained rather than cut off, so the client still reads the refusal.
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    request.on("end", () => resolve(size > limit ? null : Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

/** Check, plan and write one save: re-read the folder, merge the editor's rig and animations, and write if it loads. */
export async function handleSave(request: IncomingMessage, folder: LibraryFolder, readOnly: boolean, now = new Date()): Promise<SaveOutcome> {
  const refused = saveRequestRefusal(request, readOnly);
  if (refused) {
    request.resume();
    return refused;
  }
  const text = await readBody(request);
  if (text === null) return refuse(413, `a save may be at most ${MAX_SAVE_BYTES} bytes`);
  let save: unknown;
  try {
    save = JSON.parse(text);
  } catch (error) {
    return refuse(400, `the save is not valid JSON (${(error as Error).message})`);
  }
  const read = readLibraryFolder(folder.dir);
  if (read.errors.length) return refuse(409, ...read.errors);
  const plan = planLibrarySave(read.files, save);
  if (!plan.ok) return refuse(422, ...plan.errors);
  try {
    const written = writeLibrarySave(folder.dir, plan.value, now);
    const saveId = randomUUID();
    return {
      status: 200,
      body: { ok: true, saveId, library: folder.label, written: written.written, removed: written.removed, backup: written.backup },
      result: { ...written, saveId },
    };
  } catch (error) {
    return refuse(500, `writing ${folder.label} failed: ${(error as Error).message}`);
  }
}
