import { GRID_SPACINGS, MAX_ZOOM, MIN_ZOOM, ROTATION_SNAPS, snapToGrid } from "../editor/view";
import type { Point } from "../editor/view";
import type { Status } from "../editor/state";
import { fixed } from "./Inspector";

interface StatusBarProps {
  readonly status: Status | null;
  readonly cursor: Point | null;
  readonly zoom: number;
  readonly grid: number;
  readonly snap: boolean;
  readonly onZoom: (factor: number) => void;
  readonly onFit: () => void;
  readonly onGrid: (spacing: number) => void;
  readonly onSnap: (snap: boolean) => void;
  readonly rotationSnap: number;
  readonly onRotationSnap: (degrees: number) => void;
}

export function StatusBar({ status, cursor, zoom, grid, snap, onZoom, onFit, onGrid, onSnap, rotationSnap, onRotationSnap }: StatusBarProps) {
  const shown = cursor && snap ? snapToGrid(cursor, grid) : cursor;
  return (
    <footer className="status">
      <p className={status?.tone === "error" ? "status__message status__message--error" : "status__message"} role="status">
        {status?.text ?? ""}
      </p>
      <output className="status__cursor" aria-label="Cursor position">
        {shown ? `${fixed(shown.x)}, ${fixed(shown.y)}` : "—"}
      </output>
      <div className="status__controls">
        <button type="button" className="tool tool--small" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => onZoom(1 / 1.25)}>−</button>
        <button type="button" className="tool tool--small status__zoom" title="Fit the rig" onClick={onFit}>{Math.round(zoom * 100)}%</button>
        <button type="button" className="tool tool--small" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => onZoom(1.25)}>+</button>
        <label className="status__field">
          <span>Grid</span>
          <select value={grid} onChange={(event) => onGrid(Number(event.target.value))}>
            {GRID_SPACINGS.map((spacing) => <option key={spacing} value={spacing}>{spacing}</option>)}
          </select>
        </label>
        <label className="status__field">
          <input type="checkbox" aria-label="Snap to grid" checked={snap} onChange={(event) => onSnap(event.target.checked)} />
          <span>Snap</span>
        </label>
        <label className="status__field">
          <span>Rotate</span>
          <select aria-label="Rotation snap" value={rotationSnap} onChange={(event) => onRotationSnap(Number(event.target.value))}>
            {ROTATION_SNAPS.map((degrees) => <option key={degrees} value={degrees}>{degrees === 0 ? "free" : `${degrees}°`}</option>)}
          </select>
        </label>
      </div>
    </footer>
  );
}
