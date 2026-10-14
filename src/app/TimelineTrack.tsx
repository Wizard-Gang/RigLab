import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { RigLabAnimation } from "../format/animation";
import { poseFrames } from "../format/timing";

interface TimelineTrackProps {
  readonly animation: RigLabAnimation;
  readonly frame: number;
  readonly selectedKey: number | null;
  readonly onSeek: (frame: number) => void;
  readonly onSelectKey: (frame: number) => void;
}

/** Frames 0..length across the track, ticked at Hexframe's 13 poses: click or drag to scrub, click a key to select it. */
export function TimelineTrack({ animation, frame, selectedKey, onSeek, onSelectKey }: TimelineTrackProps) {
  const track = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const { length } = animation;
  const at = (value: number): string => `${(value / length) * 100}%`;
  const frameFrom = (clientX: number): number => {
    const box = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(length, Math.round(((clientX - box.left) / box.width) * length)));
  };

  const grabKey = (key: number) => (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    onSelectKey(key);
  };

  return (
    <div
      ref={track}
      className="track"
      onPointerDown={(event) => {
        track.current?.setPointerCapture(event.pointerId);
        scrubbing.current = true;
        onSeek(frameFrom(event.clientX));
      }}
      onPointerMove={(event) => {
        if (scrubbing.current) onSeek(frameFrom(event.clientX));
      }}
      onPointerUp={() => {
        scrubbing.current = false;
      }}
    >
      {poseFrames(length).map((tick) => (
        <span key={tick} className="track__tick" style={{ left: at(tick) }}>{tick}</span>
      ))}
      {animation.keys.map((key) => (
        <button
          key={key.frame}
          type="button"
          className={[
            "track__key",
            `track__key--${key.interpolation}`,
            key.frame === selectedKey ? "track__key--selected" : "",
            key.pins ? "track__key--held" : "",
          ].join(" ").trim()}
          style={{ left: at(key.frame) }}
          aria-label={`Key at frame ${key.frame}, ${key.interpolation}`}
          aria-pressed={key.frame === selectedKey}
          onPointerDown={grabKey(key.frame)}
        />
      ))}
      <span className="track__playhead" style={{ left: at(frame) }} aria-hidden="true" />
    </div>
  );
}
