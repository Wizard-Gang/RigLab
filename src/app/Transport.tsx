import type { RigLabAnimation } from "../format/animation";

interface TransportProps {
  readonly animation: RigLabAnimation;
  readonly frame: number;
  readonly playing: boolean;
  /** Pose mode scrubs without playing. */
  readonly canPlay: boolean;
  readonly onToggle: () => void;
  readonly onSeek: (frame: number) => void;
}

export function Transport({ animation, frame, playing, canPlay, onToggle, onSeek }: TransportProps) {
  return (
    <div className="transport">
      {canPlay ? (
        <button type="button" className="tool transport__play" onClick={onToggle}>{playing ? "Pause" : "Play"}</button>
      ) : null}
      <input
        className="transport__scrub"
        type="range"
        min={0}
        max={animation.length}
        value={frame}
        aria-label="Frame"
        onChange={(event) => onSeek(Number(event.target.value))}
      />
      <output className="transport__frame">
        <code>{animation.name}</code> · {frame} / {animation.length} · {animation.fps} fps · {animation.loop ? "loop" : "once"}
      </output>
    </div>
  );
}
