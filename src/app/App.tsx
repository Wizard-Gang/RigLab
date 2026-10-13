import { useMemo, useState } from "react";
import { sampleClip } from "../../vendor/hexframe/src/rig/sample";
import { HEXFRAME_CLIPS, HEXFRAME_CLIP_NAMES, HEXFRAME_FPS, HEXFRAME_RIG } from "../hexframe/fighter";
import { Hierarchy } from "../viewer/Hierarchy";
import { RigCanvas } from "../viewer/RigCanvas";
import { skeletonFor } from "../viewer/skeleton";
import { usePlayback } from "../viewer/usePlayback";

const GRID = 5;
/** Two decimals, without printing a rounded negative zero. */
const fixed = (value: number): string => (Math.abs(value) < 0.005 ? 0 : value).toFixed(2);

export function App() {
  const rig = HEXFRAME_RIG;
  const [clipName, setClipName] = useState("labIdle");
  const [selected, setSelected] = useState<string | null>("pelvis");
  const clip = HEXFRAME_CLIPS[clipName]!;
  const playback = usePlayback(HEXFRAME_FPS, clip.duration, clip.loop);
  const pose = useMemo(() => sampleClip(clip, playback.frame), [clip, playback.frame]);
  const skeleton = useMemo(() => skeletonFor(rig, pose), [rig, pose]);
  const bone = selected === null ? null : rig.byName.get(selected) ?? null;
  const world = selected === null ? null : skeleton.placed.get(selected) ?? null;
  const local = selected === null ? null : pose[selected] ?? {};

  return (
    <div className="app">
      <header className="app__bar">
        <h1 className="app__title">RigLab</h1>
        <p className="app__subtitle">
          Hexframe humanoid · {rig.bones.length} bones · root <code>{rig.root}</code>
        </p>
      </header>

      <aside className="panel panel--left">
        <h2 className="panel__title">Hierarchy</h2>
        <Hierarchy rig={rig} selected={selected} onSelect={setSelected} />
      </aside>

      <main className="stage">
        <RigCanvas rig={rig} skeleton={skeleton} selected={selected} onSelect={setSelected} grid={GRID} />
      </main>

      <aside className="panel panel--right">
        <h2 className="panel__title">Inspector</h2>
        {bone && world && local ? (
          <dl className="inspector">
            <dt>Bone</dt><dd><code>{bone.name}</code></dd>
            <dt>Parent</dt><dd><code>{bone.parent ?? "—"}</code></dd>
            <dt>Rest offset</dt><dd>{bone.offset.join(", ")}</dd>
            <dt>Tip</dt><dd>{bone.tip ? bone.tip.join(", ") : "—"}</dd>
            <dt>Slot</dt><dd><code>{bone.slot}</code></dd>
            <dt>Local rotation</dt><dd>{fixed(local.rotation ?? 0)}°</dd>
            <dt>Local translation</dt><dd>{fixed(local.x ?? 0)}, {fixed(local.y ?? 0)}</dd>
            <dt>World position</dt><dd>{fixed(world.x)}, {fixed(world.y)}</dd>
            <dt>World rotation</dt><dd>{fixed((world.rotation * 180) / Math.PI)}°</dd>
          </dl>
        ) : (
          <p className="panel__empty">Select a joint on the canvas or in the hierarchy.</p>
        )}
      </aside>

      <footer className="transport">
        <label className="transport__clip">
          <span>Clip</span>
          <select value={clipName} onChange={(event) => setClipName(event.target.value)}>
            {HEXFRAME_CLIP_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <button type="button" className="transport__play" onClick={playback.toggle}>
          {playback.playing ? "Pause" : "Play"}
        </button>
        <input
          className="transport__scrub"
          type="range"
          min={0}
          max={clip.duration}
          value={playback.frame}
          aria-label="Frame"
          onChange={(event) => playback.seek(Number(event.target.value))}
        />
        <output className="transport__frame">
          {playback.frame} / {clip.duration} · {HEXFRAME_FPS} fps · {clip.loop ? "loop" : "once"} · {clip.easing ?? "linear"}
        </output>
      </footer>
    </div>
  );
}
