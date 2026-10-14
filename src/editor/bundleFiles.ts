// Browser access for export bundles: write a folder through the File System Access API, or download a zip.
import { EXPORT_ROOT } from "../export/bundle";
import { zip } from "../export/zip";
import type { Files } from "../export/zip";

interface Writable {
  write(data: BufferSource): Promise<void>;
  close(): Promise<void>;
}

interface FileEntryHandle {
  createWritable(): Promise<Writable>;
}

interface FolderHandle {
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FolderHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileEntryHandle>;
}

type FolderPicker = (options?: { mode?: "readwrite" }) => Promise<FolderHandle>;

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
