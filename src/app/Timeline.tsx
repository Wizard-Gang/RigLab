import type { Interpolation, RigLabAnimation } from "../format/animation";
import { INTERPOLATIONS } from "../format/animation";
import { keyIndexAt } from "../format/sample";
import { KINDS } from "../format/timing";
import type { TimelineEdit } from "../editor/timeline";
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

/** The kind's keys on Hexframe's 60 Hz clock: play, scrub, step and choose how each key moves to the next. */
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
          <code>{animation.name}</code> · frame {frame} / {animation.length} · {keyHere ? "key" : `after key ${inForce.frame}`}
        </output>
        <div className="toolbar timeline__keys" role="toolbar" aria-label="Keys">
          <div className="segmented" role="radiogroup" aria-label="Interpolation to the next key">
            {INTERPOLATIONS.map((interpolation) => (
              <button
                key={interpolation}
                type="button"
                role="radio"
                className="tool tool--small"
                aria-checked={targetKey?.interpolation === interpolation}
                disabled={!targetKey}
                onClick={() => targetKey && targetKey.interpolation !== interpolation && onEdit({ kind: "setInterpolation", frame: targetKey.frame, interpolation })}
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
      />
      <div className="timeline__row timeline__timing">
        <label className="status__field">
          <input type="checkbox" aria-label="Onion skins" checked={onion} onChange={(event) => onOnion(event.target.checked)} />
          <span>Onion skins</span>
        </label>
        <span className="timeline__seconds">
          {KINDS[animation.kind].label} · {animation.fps} fps · {animation.length} frames · {(animation.length / animation.fps).toFixed(2)} s
          {" · "}{animation.loop ? "loops" : "plays once"} · {animation.keys.length} keys
        </span>
      </div>
    </section>
  );
}
