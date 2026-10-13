import { useCallback, useEffect, useRef, useState } from "react";

export interface PlaybackOptions {
  readonly fps: number;
  readonly length: number;
  readonly loop: boolean;
  readonly frame: number;
  readonly onFrame: (frame: number) => void;
  /** Playback stops whenever this turns false. */
  readonly enabled: boolean;
}

export interface Playback {
  readonly playing: boolean;
  readonly toggle: () => void;
  readonly pause: () => void;
}

/**
 * Integer-frame playback at a fixed rate, reporting frames through `onFrame`. Frames advance from
 * wall-clock time, so a slow display drops frames instead of slowing the animation. A non-looping
 * animation stops on its last frame.
 */
export function usePlayback({ fps, length, loop, frame, onFrame, enabled }: PlaybackOptions): Playback {
  const [playing, setPlaying] = useState(false);
  const latest = useRef({ frame, onFrame });
  latest.current = { frame, onFrame };
  const active = playing && enabled && length > 0;

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
        setPlaying(false);
        return;
      }
      latest.current.onFrame(loop ? next % length : next);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [active, fps, length, loop]);

  const toggle = useCallback(() => setPlaying((value) => !value), []);
  const pause = useCallback(() => setPlaying(false), []);
  return { playing: active, toggle, pause };
}
