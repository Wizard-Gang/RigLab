// Browser file access for documents: the File System Access API when offered, file input and download otherwise.
import { DOCUMENT_EXTENSION } from "../format/document";

interface Writable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface FileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<Writable>;
}

interface PickerOptions {
  readonly types: readonly { readonly description: string; readonly accept: Readonly<Record<string, readonly string[]>> }[];
  readonly suggestedName?: string;
  readonly excludeAcceptAllOption?: boolean;
}

/** The two WICG picker methods; not every browser has them, and the DOM typings do not declare them. */
interface PickerWindow {
  showOpenFilePicker?: (options: PickerOptions) => Promise<FileHandle[]>;
  showSaveFilePicker?: (options: PickerOptions) => Promise<FileHandle>;
}

const TYPES: PickerOptions["types"] = [{ description: "RigLab document", accept: { "application/json": [DOCUMENT_EXTENSION, ".json"] } }];

export interface OpenedFile {
  readonly text: string;
  readonly name: string;
  readonly handle: FileHandle | null;
}

export interface SavedFile {
  readonly name: string;
  readonly handle: FileHandle | null;
}

const picker = (): PickerWindow => window as unknown as PickerWindow;
const cancelled = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

function chooseWithInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${DOCUMENT_EXTENSION},.json,application/json`;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

/** Ask for a document file; null when the author cancels. */
export async function openFile(): Promise<OpenedFile | null> {
  const open = picker().showOpenFilePicker;
  if (open) {
    try {
      const [handle] = await open.call(window, { types: TYPES });
      if (!handle) return null;
      const file = await handle.getFile();
      return { text: await file.text(), name: handle.name, handle };
    } catch (error) {
      if (cancelled(error)) return null;
      throw error;
    }
  }
  const file = await chooseWithInput();
  return file ? { text: await file.text(), name: file.name, handle: null } : null;
}

async function write(handle: FileHandle, text: string): Promise<SavedFile> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  return { name: handle.name, handle };
}

function download(text: string, name: string): SavedFile {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return { name, handle: null };
}

/**
 * Save to the known handle when there is one; otherwise ask for a destination (Save As).
 * Without the picker API the file downloads under `suggestedName`. Null when the author cancels.
 */
export async function saveFile(text: string, handle: FileHandle | null, suggestedName: string): Promise<SavedFile | null> {
  if (handle) return write(handle, text);
  const save = picker().showSaveFilePicker;
  if (!save) return download(text, suggestedName);
  try {
    return await write(await save.call(window, { types: TYPES, suggestedName }), text);
  } catch (error) {
    if (cancelled(error)) return null;
    throw error;
  }
}
