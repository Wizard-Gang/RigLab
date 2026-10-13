// Browser access for export bundles: a folder through the File System Access API, or a zip download and upload.
import { EXPORT_ROOT } from "../export/bundle";
import { unzip, zip } from "../export/zip";
import type { Files } from "../export/zip";

interface Writable {
  write(data: BufferSource): Promise<void>;
  close(): Promise<void>;
}

interface FileEntryHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<Writable>;
}

interface FolderHandle {
  readonly kind: "directory";
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FolderHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileEntryHandle>;
  values(): AsyncIterable<FolderHandle | FileEntryHandle>;
}

type FolderPicker = (options?: { mode?: "read" | "readwrite" }) => Promise<FolderHandle>;

const folderPicker = (): FolderPicker | undefined => (window as unknown as { showDirectoryPicker?: FolderPicker }).showDirectoryPicker;
const cancelled = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

export const canUseFolders = (): boolean => typeof folderPicker() === "function";

/** Write the bundle into a riglab-export folder inside the folder the author picks; null when cancelled. */
export async function writeFolder(files: Files): Promise<string | null> {
  const pick = folderPicker();
  if (!pick) throw new Error("This browser cannot write folders; download a zip instead");
  let parent: FolderHandle;
  try {
    parent = await pick.call(window, { mode: "readwrite" });
  } catch (error) {
    if (cancelled(error)) return null;
    throw error;
  }
  const root = await parent.getDirectoryHandle(EXPORT_ROOT, { create: true });
  for (const [path, bytes] of files) {
    const parts = path.split("/");
    let folder = root;
    for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: true });
    const writable = await (await folder.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
    await writable.write(bytes as BufferSource);
    await writable.close();
  }
  return `${parent.name}/${EXPORT_ROOT}`;
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Download the bundle as riglab-export.zip, with every file under riglab-export/. */
export function downloadZip(files: Files): string {
  const name = `${EXPORT_ROOT}.zip`;
  const archive = zip(new Map([...files].map(([path, bytes]) => [`${EXPORT_ROOT}/${path}`, bytes])));
  downloadBlob(new Blob([archive as BlobPart], { type: "application/zip" }), name);
  return name;
}

/** Download one JSON file, such as the Hexframe rig or clip. */
export function downloadJson(text: string, name: string): void {
  downloadBlob(new Blob([text], { type: "application/json" }), name);
}

async function readAll(folder: FolderHandle, prefix: string, into: Map<string, Uint8Array>): Promise<void> {
  for await (const entry of folder.values()) {
    if (entry.kind === "directory") await readAll(entry, `${prefix}${entry.name}/`, into);
    else into.set(`${prefix}${entry.name}`, new Uint8Array(await (await entry.getFile()).arrayBuffer()));
  }
}

/** Read every file under a folder the author picks; null when cancelled. */
export async function readFolder(): Promise<{ readonly files: Map<string, Uint8Array>; readonly name: string } | null> {
  const pick = folderPicker();
  if (!pick) throw new Error("This browser cannot read folders; import a zip instead");
  try {
    const folder = await pick.call(window, { mode: "read" });
    const files = new Map<string, Uint8Array>();
    await readAll(folder, "", files);
    return { files, name: folder.name };
  } catch (error) {
    if (cancelled(error)) return null;
    throw error;
  }
}

/** Read a zipped bundle the author picks; null when cancelled. */
export function readZip(): Promise<{ readonly files: Map<string, Uint8Array>; readonly name: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.arrayBuffer().then((buffer) => unzip(new Uint8Array(buffer))).then((files) => resolve({ files, name: file.name }), reject);
    }, { once: true });
    input.click();
  });
}
