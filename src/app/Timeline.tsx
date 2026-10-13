import type { Interpolation, RigLabAnimation } from "../format/animation";
import { INTERPOLATIONS } from "../format/animation";
import { keyIndexAt } from "../format/sample";
import type { TimelineEdit } from "../editor/timeline";
import { NumberField } from "./fields";
import { TimelineTrack } from "./TimelineTrack";

interface TimelineProps {
  readonly animation: RigLabAnimation;
  readonly frame: number;
  readonly selectedKey: number | null;
  readonly playing: boolean;
  /** Pose mode scrubs and edits keys without playing. */
  readonly canPlay: boolean;
  readonly onion: boolean;
  readonly onToggle: () => void;
  readonly onSeek: (frame: number) => void;
  readonly onStepKey: (direction: -1 | 1) => void;
  readonly onSelectKey: (frame: number) => void;
  readonly onEdit: (edit: TimelineEdit) => void;
  readonly onOnion: (onion: boolean) => void;
}

const LABELS: Readonly<Record<Interpolation, string>> = { hold: "Hold", linear: "Linear", smoothstep: "Smooth" };

/** Keys on integer frames at the animation's rate: play, scrub, add, duplicate, move, delete and ease them. */
export function Timeline(props: TimelineProps) {
  const { animation, frame, selectedKey, playing, canPlay, onion, onToggle, onSeek, onStepKey, onSelectKey, onEdit, onOnion } = props;
  const keyHere = animation.keys.find((key) => key.frame === frame);
  const inForce = animation.keys[keyIndexAt(animation.keys, frame)]!;
  const target = selectedKey ?? keyHere?.frame ?? null;
  const targetKey = animation.keys.find((key) => key.frame === target);
  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline__row">
        {canPlay ? <button type="button" className="tool transport__play" onClick={onToggle}>{playing ? "Pause" : "Play"}</button> : null}
        <div className="toolbar" role="toolbar" aria-label="Step">
          <button type="button" className="tool tool--small" aria-label="Previous key" title="Previous key (⇧←)" onClick={() => onStepKey(-1)}>⏮</button>
          <button type="button" className="tool tool--small" aria-label="Previous frame" title="Previous frame (←)" onClick={() => onSeek(frame - 1)}>◀</button>
          <button type="button" className="tool tool--small" aria-label="Next frame" title="Next frame (→)" onClick={() => onSeek(frame + 1)}>▶</button>
          <button type="button" className="tool tool--small" aria-label="Next key" title="Next key (⇧→)" onClick={() => onStepKey(1)}>⏭</button>
        </div>
        <output className="transport__frame">
          <code>{animation.name}</code> · frame {frame} / {animation.length} · {keyHere ? "key" : `holding key ${inForce.frame}`}
        </output>
        <div className="toolbar timeline__keys" role="toolbar" aria-label="Keys">
          <button type="button" className="tool" disabled={Boolean(keyHere)} onClick={() => onEdit({ kind: "addKey", frame })}>Add key</button>
          <button type="button" className="tool" onClick={() => onEdit({ kind: "duplicateKey", frame })}>Duplicate</button>
          <button type="button" className="tool tool--danger" disabled={!targetKey || targetKey.frame === 0} onClick={() => targetKey && onEdit({ kind: "deleteKey", frame: targetKey.frame })}>
            Delete key
          </button>
          <div className="segmented" role="radiogroup" aria-label="Interpolation to the next key">
            {INTERPOLATIONS.map((interpolation) => (
              <button
                key={interpolation}
                type="button"
                role="radio"
                className="tool tool--small"
                aria-checked={targetKey?.interpolation === interpolation}
                disabled={!targetKey}
                onClick={() => targetKey && onEdit({ kind: "setInterpolation", frame: targetKey.frame, interpolation })}
              >
                {LABELS[interpolation]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <TimelineTrack
        animation={animation}
        frame={frame}
        selectedKey={selectedKey}
        onSeek={onSeek}
        onSelectKey={onSelectKey}
        onMoveKey={(from, to) => onEdit({ kind: "moveKey", from, to })}
      />
      <div className="timeline__row timeline__timing">
        <label className="status__field">
          <span>Rate</span>
          <NumberField label="Frames per second" value={animation.fps} onCommit={(fps) => onEdit({ kind: "setTiming", fps })} />
        </label>
        <label className="status__field">
          <span>Length</span>
          <NumberField label="Length in frames" value={animation.length} onCommit={(length) => onEdit({ kind: "setTiming", length })} />
        </label>
        <label className="status__field">
          <input type="checkbox" aria-label="Loop" checked={animation.loop} onChange={(event) => onEdit({ kind: "setTiming", loop: event.target.checked })} />
          <span>Loop</span>
        </label>
        <label className="status__field">
          <input type="checkbox" aria-label="Onion skins" checked={onion} onChange={(event) => onOnion(event.target.checked)} />
          <span>Onion skins</span>
        </label>
        <span className="timeline__seconds">{(animation.length / animation.fps).toFixed(2)} s · {animation.keys.length} {animation.keys.length === 1 ? "key" : "keys"}</span>
      </div>
    </section>
  );
}
