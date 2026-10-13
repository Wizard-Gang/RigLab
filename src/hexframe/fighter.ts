// Hexframe's fighter rig and clips, loaded from the pinned vendor copy and resolved with Hexframe's own code.
import fighterRig from "../../vendor/hexframe/characters/fighter/fighter.rig.json";
import crouch from "../../vendor/hexframe/characters/fighter/clips/crouch.json";
import crouchGuard from "../../vendor/hexframe/characters/fighter/clips/crouchGuard.json";
import jump from "../../vendor/hexframe/characters/fighter/clips/jump.json";
import labGuard from "../../vendor/hexframe/characters/fighter/clips/labGuard.json";
import labIdle from "../../vendor/hexframe/characters/fighter/clips/labIdle.json";
import labOverhead from "../../vendor/hexframe/characters/fighter/clips/labOverhead.json";
import labStagger from "../../vendor/hexframe/characters/fighter/clips/labStagger.json";
import labStrike from "../../vendor/hexframe/characters/fighter/clips/labStrike.json";
import labWalk from "../../vendor/hexframe/characters/fighter/clips/labWalk.json";
import labWave from "../../vendor/hexframe/characters/fighter/clips/labWave.json";
import launched from "../../vendor/hexframe/characters/fighter/clips/launched.json";
import sweep from "../../vendor/hexframe/characters/fighter/clips/sweep.json";
import uppercut from "../../vendor/hexframe/characters/fighter/clips/uppercut.json";
import { createRig } from "../../vendor/hexframe/src/rig";
import type { Clip, Rig, RigContract } from "../../vendor/hexframe/src/rig";

/** Hexframe clips advance on its fixed 60 Hz simulation clock. */
export const HEXFRAME_FPS = 60;

export const HEXFRAME_RIG: Rig = createRig(fighterRig as unknown as RigContract);

const clip = (value: unknown): Clip => value as Clip;

export const HEXFRAME_CLIPS: Readonly<Record<string, Clip>> = Object.freeze({
  labIdle: clip(labIdle),
  labWalk: clip(labWalk),
  labGuard: clip(labGuard),
  labStrike: clip(labStrike),
  labOverhead: clip(labOverhead),
  labStagger: clip(labStagger),
  labWave: clip(labWave),
  crouch: clip(crouch),
  crouchGuard: clip(crouchGuard),
  jump: clip(jump),
  launched: clip(launched),
  sweep: clip(sweep),
  uppercut: clip(uppercut),
});

export const HEXFRAME_CLIP_NAMES: readonly string[] = Object.keys(HEXFRAME_CLIPS);
