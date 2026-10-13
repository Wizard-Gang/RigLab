import { useCallback, useEffect, useRef, useState } from "react";

export interface Playback {
  readonly frame: number;
  readonly playing: boolean;
  readonly toggle: () => void;
  readonly seek: (frame: number) => void;
}

/**
 * Integer-frame playback at a fixed rate. Frames advance from wall-clock time, so a slow display
 * drops frames instead of slowing the clip; frames wrap at `length` when `loop` is set and hold otherwise.
 */
export function usePlayback(fps: number, length: number, loop: boolean): Playback {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const current = useRef(0);
  current.current = frame;

  useEffect(() => {
    current.current = 0;
    setFrame(0);
  }, [fps, length, loop]);

  useEffect(() => {
    if (!playing) return undefined;
    let handle = 0;
    let origin: { time: number; frame: number } | null = null;
    const tick = (time: number): void => {
      origin ??= { time, frame: current.current };
      const next = origin.frame + Math.floor(((time - origin.time) / 1000) * fps);
      setFrame(loop ? next % Math.max(1, length) : Math.min(next, length));
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, fps, length, loop]);

  const toggle = useCallback(() => setPlaying((value) => !value), []);
  const seek = useCallback((next: number) => {
    setPlaying(false);
    setFrame(Math.max(0, Math.min(length, Math.round(next))));
  }, [length]);

  return { frame, playing, toggle, seek };
}
