// Browser access for export and skin bundles: write a folder through the File System Access API, or download a zip.
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

/** Write the files into a `root` folder (riglab-export by default) inside the folder the author picks; null when cancelled. */
export async function writeFolder(files: Files, root: string = EXPORT_ROOT): Promise<string | null> {
  const pick = folderPicker();
  if (!pick) throw new Error("This browser cannot write folders; download a zip instead");
  let parent: FolderHandle;
  try {
    parent = await pick.call(window, { mode: "readwrite" });
  } catch (error) {
    if (cancelled(error)) return null;
    throw error;
  }
  const top = await parent.getDirectoryHandle(root, { create: true });
  for (const [path, bytes] of files) {
    const parts = path.split("/");
    let folder = top;
    for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: true });
    const writable = await (await folder.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
    await writable.write(bytes as BufferSource);
    await writable.close();
  }
  return `${parent.name}/${root}`;
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Download the files as `<root>.zip` (riglab-export.zip by default), with every file under `<root>/`. */
export function downloadZip(files: Files, root: string = EXPORT_ROOT): string {
  const name = `${root}.zip`;
  const archive = zip(new Map([...files].map(([path, bytes]) => [`${root}/${path}`, bytes])));
  downloadBlob(new Blob([archive as BlobPart], { type: "application/zip" }), name);
  return name;
}

/** Download one JSON file, such as the Hexframe rig or clip. */
export function downloadJson(text: string, name: string): void {
  downloadBlob(new Blob([text], { type: "application/json" }), name);
}
