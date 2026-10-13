import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { forwardKinematics } from "../../vendor/hexframe/src/rig";
import { createRigLabRig, sampleAnimation } from "../format";
import type { RigLabRig } from "../format";
import type { Command } from "../editor/shortcuts";
import { platformOf } from "../editor/shortcuts";
import { activeAnimationOf, documentOf, editorReducer, initialState, isDirty } from "../editor/state";
import { fitView, snapToGrid, zoomAbout } from "../editor/view";
import type { Point } from "../editor/view";
import { Hierarchy } from "../viewer/Hierarchy";
import { RigCanvas } from "../viewer/RigCanvas";
import { skeletonFor } from "../viewer/skeleton";
import { usePlayback } from "../viewer/usePlayback";
import { AnimationsPanel } from "./AnimationsPanel";
import { BoneSetup } from "./BoneSetup";
import { Inspector } from "./Inspector";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";
import { Transport } from "./Transport";
import { useFileCommands } from "./useFileCommands";
import { useShortcuts } from "./useShortcuts";

const platform = platformOf(navigator.userAgent);

type Offset = readonly [number, number];

/** Six decimals, and never a negative zero, for offsets computed from pointer positions. */
const tidy = (value: number): number => Math.round(value * 1e6) / 1e6 || 0;

function withOffset(rig: RigLabRig, bone: string, offset: Offset): RigLabRig {
  return { ...rig, bones: rig.bones.map((candidate) => (candidate.name === bone ? { ...candidate, offset } : candidate)) };
}

export function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => initialState());
  const [cursor, setCursor] = useState<Point | null>(null);
  const document = documentOf(state);
  const [preview, setPreview] = useState<{ readonly bone: string; readonly offset: Offset } | null>(null);
  const shownRig = useMemo(() => (preview ? withOffset(document.rig, preview.bone, preview.offset) : document.rig), [document.rig, preview]);
  const rig = useMemo(() => createRigLabRig(shownRig), [shownRig]);
  const restPlaced = useMemo(() => forwardKinematics(createRigLabRig(document.rig), {}), [document.rig]);
  const animation = activeAnimationOf(state);
  const dirty = isDirty(state);
  const files = useFileCommands(state, dispatch);
  const onFrame = useCallback((frame: number) => dispatch({ type: "setFrame", frame }), []);
  const playback = usePlayback({
    fps: animation?.fps ?? 1,
    length: animation?.length ?? 0,
    loop: animation?.loop ?? false,
    frame: state.frame,
    onFrame,
    enabled: state.mode === "animate" && animation !== null,
  });
  const pose = useMemo(
    () => (state.mode === "setup" || !animation ? {} : sampleAnimation(animation, state.frame)),
    [state.mode, animation, state.frame],
  );
  const skeleton = useMemo(() => skeletonFor(rig, pose), [rig, pose]);
  const selectedBone = state.selection?.kind === "bone" ? state.selection.name : null;

  /** Rig setup drags a joint in rest space: the drop becomes the bone's offset in its parent's frame. */
  const onJointDrag = (bone: string, point: Point, done: boolean): void => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      setPreview(null);
      return;
    }
    const target = state.snap ? snapToGrid(point, state.grid) : point;
    const parentName = document.rig.bones.find((candidate) => candidate.name === bone)?.parent ?? null;
    const parent = parentName === null ? { x: 0, y: 0, rotation: 0 } : restPlaced.get(parentName)!;
    const dx = target.x - parent.x;
    const dy = target.y - parent.y;
    const cos = Math.cos(parent.rotation);
    const sin = Math.sin(parent.rotation);
    const offset: Offset = [tidy(dx * cos + dy * sin), tidy(dy * cos - dx * sin)];
    if (!done) {
      setPreview({ bone, offset });
      return;
    }
    setPreview(null);
    const current = document.rig.bones.find((candidate) => candidate.name === bone)?.offset;
    if (current && (current[0] !== offset[0] || current[1] !== offset[1])) {
      dispatch({ type: "rigEdit", edit: { kind: "moveJoint", bone, offset } });
    }
  };

  const run = useCallback((command: Command) => {
    if (command === "new") files.newDocument();
    else if (command === "open") void files.open();
    else if (command === "save") void files.save();
    else if (command === "saveAs") void files.saveAs();
    else if (command === "undo" || command === "redo") dispatch({ type: command });
    else if (command === "delete") dispatch({ type: "deleteSelection" });
    else dispatch({ type: "select", selection: null });
  }, [files]);
  useShortcuts(platform, run);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <div className="app">
      <Toolbar
        platform={platform}
        mode={state.mode}
        onMode={(mode) => dispatch({ type: "setMode", mode })}
        onCommand={run}
        canUndo={state.history.past.length > 0}
        canRedo={state.history.future.length > 0}
        title={state.fileName ?? "Untitled"}
        dirty={dirty}
      />

      <aside className="panel panel--left">
        <section className="panel__section" aria-labelledby="hierarchy-title">
          <h2 className="panel__title" id="hierarchy-title">Hierarchy · <code>{document.rig.name}</code></h2>
          <Hierarchy rig={rig} selected={selectedBone} onSelect={(name) => dispatch({ type: "select", selection: { kind: "bone", name } })} />
        </section>
        <AnimationsPanel
          animations={document.animations}
          active={state.activeAnimation}
          selected={state.selection?.kind === "animation" ? state.selection.name : null}
          onSelect={(name) => dispatch({ type: "select", selection: { kind: "animation", name } })}
          onAdd={() => dispatch({ type: "addAnimation" })}
          onDuplicate={(name) => dispatch({ type: "duplicateAnimation", name })}
          onDelete={() => dispatch({ type: "deleteSelection" })}
        />
      </aside>

      <main className="stage">
        <RigCanvas
          rig={rig}
          skeleton={skeleton}
          selected={selectedBone}
          onSelect={(name) => dispatch({ type: "select", selection: name === null ? null : { kind: "bone", name } })}
          view={state.view}
          onView={(view) => dispatch({ type: "setView", view })}
          onCursor={setCursor}
          grid={state.grid}
          onJointDrag={state.mode === "setup" ? onJointDrag : undefined}
        />
      </main>

      <aside className="panel panel--right">
        <h2 className="panel__title">{state.mode === "setup" ? "Rig setup" : "Inspector"}</h2>
        {state.mode === "setup" && selectedBone ? (
          <BoneSetup rig={document.rig} bone={selectedBone} onEdit={(edit) => dispatch({ type: "rigEdit", edit })} />
        ) : (
          <Inspector
            rig={document.rig}
            selection={state.selection}
            pose={pose}
            placed={skeleton.placed}
            animations={document.animations}
            onRename={(from, to) => dispatch({ type: "renameAnimation", from, to })}
          />
        )}
      </aside>

      {state.mode !== "setup" && animation ? (
        <Transport
          animation={animation}
          frame={state.frame}
          playing={playback.playing}
          canPlay={state.mode === "animate"}
          onToggle={playback.toggle}
          onSeek={(frame) => {
            playback.pause();
            dispatch({ type: "setFrame", frame });
          }}
        />
      ) : null}

      <StatusBar
        status={state.status}
        cursor={cursor}
        zoom={state.view.zoom}
        grid={state.grid}
        snap={state.snap}
        onZoom={(factor) => dispatch({ type: "setView", view: zoomAbout(state.view, factor) })}
        onFit={() => dispatch({ type: "setView", view: fitView(document.rig.space) })}
        onGrid={(spacing) => dispatch({ type: "setGrid", spacing })}
        onSnap={(snap) => dispatch({ type: "setSnap", snap })}
      />
    </div>
  );
}
