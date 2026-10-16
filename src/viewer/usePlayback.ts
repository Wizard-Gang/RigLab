import { useEffect, useRef } from "react";

export interface PlaybackOptions {
  readonly fps: number;
  readonly length: number;
  readonly loop: boolean;
  readonly frame: number;
  readonly onFrame: (frame: number) => void;
  /** The editor's own playing state; frames advance only while it holds. */
  readonly playing: boolean;
  /** A one-shot animation reached its last frame. */
  readonly onStop: () => void;
}

/**
 * Integer-frame playback at a fixed rate, reporting frames through `onFrame` while `playing` holds. Frames advance
 * from wall-clock time, so a slow display drops frames instead of slowing the animation. A non-looping animation stops
 * on its last frame and reports it through `onStop`.
 */
export function usePlayback({ fps, length, loop, frame, onFrame, playing, onStop }: PlaybackOptions): void {
  const latest = useRef({ frame, onFrame, onStop });
  latest.current = { frame, onFrame, onStop };
  const active = playing && length > 0;

  useEffect(() => {
    if (!active) return undefined;
    let handle = 0;
    let origin: { time: number; frame: number } | null = null;
    const tick = (time: number): void => {
      if (origin === null) {
        const start = latest.current.frame >= length && !loop ? 0 : latest.current.frame;
        origin = { time, frame: start };
      }
      const next = origin.frame + Math.floor(((time - origin.time) / 1000) * fps);
      if (!loop && next >= length) {
        latest.current.onFrame(length);
        latest.current.onStop();
        return;
      }
      latest.current.onFrame(loop ? next % length : next);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [active, fps, length, loop]);
}
