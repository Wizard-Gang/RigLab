import { useEffect, useState } from "react";
import { version } from "../../package.json";
import type { RigLabDocument } from "../format/document";
import { buildBundle, EXPORT_ROOT, readBundle } from "../export/bundle";
import { canUseFolders, downloadZip, readFolder, readZip, writeFolder } from "../editor/bundleFiles";
import type { Status } from "../editor/state";

interface ExportPanelProps {
  readonly document: RigLabDocument;
  readonly dirty: boolean;
  readonly onImported: (document: RigLabDocument, source: string) => void;
  readonly onStatus: (status: Status) => void;
}

export const GENERATOR = `RigLab ${version}`;

const size = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

/** Export mode: what the bundle will hold, where to write it, and verified import of a bundle. */
export function ExportPanel({ document, dirty, onImported, onStatus }: ExportPanelProps) {
  const [baked, setBaked] = useState(true);
  const [files, setFiles] = useState<ReadonlyMap<string, Uint8Array> | null>(null);
  const folders = canUseFolders();

  useEffect(() => {
    let current = true;
    setFiles(null);
    void buildBundle(document, { baked, generator: GENERATOR }).then((built) => {
      if (current) setFiles(built);
    });
    return () => {
      current = false;
    };
  }, [document, baked]);

  const run = async (what: string, task: () => Promise<string | null>): Promise<void> => {
    try {
      const done = await task();
      if (done) onStatus({ tone: "info", text: done });
    } catch (error) {
      onStatus({ tone: "error", text: `${what} failed: ${(error as Error).message}` });
    }
  };

  const importFrom = (read: typeof readZip) => run("Import", async () => {
    if (dirty && !window.confirm("Discard the unsaved changes to this document?")) return null;
    const source = await read();
    if (!source) return null;
    const result = await readBundle(source.files);
    if (!result.ok) {
      const more = result.errors.length > 1 ? ` (and ${result.errors.length - 1} more)` : "";
      throw new Error(`${source.name}: ${result.errors[0]}${more}`);
    }
    onImported(result.value, source.name);
    return null;
  });

  return (
    <div className="setup">
      <p className="panel__note">
        A <code>{EXPORT_ROOT}/</code> bundle: a manifest pinning every file by SHA-256, the rig, each animation and,
        optionally, every frame's solved world transforms.
      </p>
      <label className="check">
        <input type="checkbox" aria-label="Include baked frames" checked={baked} onChange={(event) => setBaked(event.target.checked)} />
        Include baked frames
      </label>
      <ul className="bundle" aria-label="Bundle files">
        {files
          ? [...files].map(([path, bytes]) => (
            <li key={path}><code>{path}</code><span className="list__meta">{size(bytes.length)}</span></li>
          ))
          : <li className="panel__note">Building…</li>}
      </ul>
      <div className="setup__actions">
        {folders ? (
          <button type="button" className="tool" disabled={!files} onClick={() => files && run("Export", async () => {
            const where = await writeFolder(files);
            return where ? `Exported ${files.size} files to ${where}` : null;
          })}>Export to folder…</button>
        ) : null}
        <button type="button" className="tool" disabled={!files} onClick={() => files && run("Export", async () => `Downloaded ${downloadZip(files)}`)}>
          Download zip
        </button>
      </div>
      <div className="setup__actions">
        {folders ? <button type="button" className="tool" onClick={() => importFrom(readFolder)}>Import folder…</button> : null}
        <button type="button" className="tool" onClick={() => importFrom(readZip)}>Import zip…</button>
      </div>
    </div>
  );
}
