import { Fragment, useEffect, useState } from "react";
import { version } from "../../package.json";
import type { RigLabAnimation } from "../format/animation";
import { clipNotes, toHexframeClip, toHexframeRig } from "../hexframe/adapter";
import { buildBundle, EXPORT_ROOT } from "../export/bundle";
import { canUseFolders, downloadJson, downloadZip, writeFolder } from "../editor/bundleFiles";
import { weaponRigs } from "../editor/model";
import type { LibraryModel } from "../editor/model";
import type { Status } from "../editor/state";

interface ExportPanelProps {
  readonly model: LibraryModel;
  /** The active animation, which the Hexframe clip export converts. */
  readonly active: RigLabAnimation | null;
  readonly onStatus: (status: Status) => void;
}

export const GENERATOR = `RigLab ${version}`;

const size = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

/** A bundle path that may break only after a slash, never inside a name. */
function BundlePath({ path }: { readonly path: string }) {
  const segments = path.split("/");
  return (
    <code title={path}>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          <span className="bundle__segment">{index < segments.length - 1 ? `${segment}/` : segment}</span>
          {index < segments.length - 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </code>
  );
}

/** Export mode: what the bundle will hold and where to write it. Export only writes; motion comes in through the library folder. */
export function ExportPanel({ model, active, onStatus }: ExportPanelProps) {
  const [baked, setBaked] = useState(true);
  const [files, setFiles] = useState<ReadonlyMap<string, Uint8Array> | null>(null);
  const folders = canUseFolders();

  useEffect(() => {
    let current = true;
    setFiles(null);
    void buildBundle(model, { baked, generator: GENERATOR }).then((built) => {
      if (current) setFiles(built);
    });
    return () => {
      current = false;
    };
  }, [model, baked]);

  const run = async (what: string, task: () => Promise<string | null>): Promise<void> => {
    try {
      const done = await task();
      if (done) onStatus({ tone: "info", text: done });
    } catch (error) {
      onStatus({ tone: "error", text: `${what} failed: ${(error as Error).message}` });
    }
  };

  return (
    <div className="setup">
      <p className="panel__note">
        A <code>{EXPORT_ROOT}/</code> bundle: a manifest pinning every file by SHA-256, the rig, each animation, the
        weapons they hold and, optionally, every frame's solved world transforms.
      </p>
      <label className="check">
        <input type="checkbox" aria-label="Include baked frames" checked={baked} onChange={(event) => setBaked(event.target.checked)} />
        Include baked frames
      </label>
      <ul className="bundle" aria-label="Bundle files">
        {files
          ? [...files].map(([path, bytes]) => (
            <li key={path}><BundlePath path={path} /><span className="list__meta">{size(bytes.length)}</span></li>
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
      <h3 className="panel__title panel__title--section">Hexframe</h3>
      <p className="panel__note">
        Hexframe's own shapes: the rig, and the active animation as the 13-pose clip RigLab already plays on Hexframe's 60 Hz clock.
      </p>
      <div className="setup__actions">
        <button type="button" className="tool" onClick={() => {
          const adapted = toHexframeRig(model.rig);
          if (!adapted.ok) return onStatus({ tone: "error", text: adapted.error });
          const name = `${model.rig.name}.rig.json`;
          downloadJson(`${JSON.stringify(adapted.value, null, 2)}\n`, name);
          onStatus({ tone: "info", text: [`Downloaded ${name}`, ...adapted.notes].join("; ") });
        }}>Download Hexframe rig</button>
        <button type="button" className="tool" disabled={!active} onClick={() => {
          if (!active) return;
          const clip = toHexframeClip(model.rig, active, weaponRigs(model));
          downloadJson(`${JSON.stringify(clip, null, 2)}\n`, `${active.name}.json`);
          const done = `Downloaded ${active.name}.json: ${clip.duration} frames at 60 Hz, 13 poses, as RigLab plays it`;
          onStatus({ tone: "info", text: [done, ...clipNotes(active)].join("; ") });
        }}>Download Hexframe clip</button>
      </div>
    </div>
  );
}
