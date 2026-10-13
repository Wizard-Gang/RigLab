import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { RigLabAnimation } from "../format/animation";

interface TimelineTrackProps {
  readonly animation: RigLabAnimation;
  readonly frame: number;
  readonly selectedKey: number | null;
  readonly onSeek: (frame: number) => void;
  readonly onSelectKey: (frame: number) => void;
  readonly onMoveKey: (from: number, to: number) => void;
}

const TICK_TARGET = 24;

/** Frames 0..length across the track: click or drag to scrub; drag a key to move it. */
export function TimelineTrack({ animation, frame, selectedKey, onSeek, onSelectKey, onMoveKey }: TimelineTrackProps) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ kind: "scrub" } | { kind: "key"; from: number; to: number } | null>(null);
  const { length } = animation;
  const at = (value: number): string => `${(value / length) * 100}%`;
  const frameFrom = (clientX: number): number => {
    const box = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(length, Math.round(((clientX - box.left) / box.width) * length)));
  };
  const step = Math.max(1, Math.ceil(length / TICK_TARGET));
  const ticks = Array.from({ length: Math.floor(length / step) + 1 }, (_, index) => index * step);

  const grabKey = (key: number) => (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    onSelectKey(key);
    if (key === 0) return;
    track.current?.setPointerCapture(event.pointerId);
    dragging.current = { kind: "key", from: key, to: key };
  };

  return (
    <div
      ref={track}
      className="track"
      onPointerDown={(event) => {
        track.current?.setPointerCapture(event.pointerId);
        dragging.current = { kind: "scrub" };
        onSeek(frameFrom(event.clientX));
      }}
      onPointerMove={(event) => {
        const drag = dragging.current;
        if (!drag) return;
        if (drag.kind === "scrub") onSeek(frameFrom(event.clientX));
        else drag.to = Math.max(1, frameFrom(event.clientX));
        if (drag.kind === "key") track.current?.style.setProperty("--ghost", at(drag.to));
      }}
      onPointerUp={() => {
        const drag = dragging.current;
        dragging.current = null;
        track.current?.style.removeProperty("--ghost");
        if (drag?.kind === "key" && drag.to !== drag.from) onMoveKey(drag.from, drag.to);
      }}
    >
      {ticks.map((tick) => (
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
            key.pins || key.prop ? "track__key--held" : "",
          ].join(" ").trim()}
          style={{ left: at(key.frame) }}
          aria-label={`Key at frame ${key.frame}, ${key.interpolation}`}
          aria-pressed={key.frame === selectedKey}
          onPointerDown={grabKey(key.frame)}
        />
      ))}
      <span className="track__ghost" aria-hidden="true" />
      <span className="track__playhead" style={{ left: at(frame) }} aria-hidden="true" />
    </div>
  );
}
