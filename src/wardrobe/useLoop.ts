import { useEffect, useState } from "react";
import type { RigLabAnimation } from "../format/animation";

/**
 * The frame to show of `animation`, played on its own clock from wall-clock time and repeated forever: a looping
 * animation wraps, and one that plays once holds its last frame for half a second before starting over.
 */
export function useLoop(animation: RigLabAnimation | null): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (!animation) return;
    const started = performance.now();
    const span = animation.loop ? animation.length : animation.length + Math.round(animation.fps / 2);
    let request = requestAnimationFrame(function tick(now) {
      setFrame(Math.min(Math.floor(((now - started) / 1000) * animation.fps) % span, animation.length));
      request = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(request);
  }, [animation]);
  return frame;
}
