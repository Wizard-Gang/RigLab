import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { createRigLabRig } from "../format";
import { constraintsAt, NO_CONSTRAINTS, samplePose } from "../solve";
import { constraintGeometry } from "../viewer/constraintGeometry";
import type { Command } from "../editor/shortcuts";
import { platformOf } from "../editor/shortcuts";
import { activeAnimationOf, documentOf, editorReducer, initialState, isDirty } from "../editor/state";
import { fitView, zoomAbout } from "../editor/view";
import type { Point } from "../editor/view";
import { Hierarchy } from "../viewer/Hierarchy";
import { RigCanvas } from "../viewer/RigCanvas";
import { skeletonFor } from "../viewer/skeleton";
import { usePlayback } from "../viewer/usePlayback";
import { AnimationsPanel } from "./AnimationsPanel";
import { BoneSetup } from "./BoneSetup";
import { ExportPanel } from "./ExportPanel";
import { Inspector } from "./Inspector";
import { PoseInspector } from "./PoseInspector";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";
import { Timeline } from "./Timeline";
import { useCanvasDrags } from "./useCanvasDrags";
import { useFileCommands } from "./useFileCommands";
import { useShortcuts } from "./useShortcuts";

const platform = platformOf(navigator.userAgent);

export function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => initialState());
  const [cursor, setCursor] = useState<Point | null>(null);
  const document = documentOf(state);
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
    enabled: (state.mode === "animate" || state.mode === "export") && animation !== null,
  });
  const posed = state.mode !== "setup" && animation !== null;
  const held = useMemo(
    () => (posed ? samplePose(document.rig, animation, state.frame) : { pose: {}, violations: [] }),
    [posed, document.rig, animation, state.frame],
  );
  const frameConstraints = useMemo(() => (posed ? constraintsAt(animation, state.frame) : NO_CONSTRAINTS), [posed, animation, state.frame]);
  const drags = useCanvasDrags(state, dispatch, held.pose, frameConstraints);
  const rig = useMemo(() => createRigLabRig(drags.rig), [drags.rig]);
  const pose = drags.pose;
  const skeleton = useMemo(() => skeletonFor(rig, pose), [rig, pose]);
  const markers = useMemo(
    () => (posed ? constraintGeometry(document.rig, pose, drags.constraints) : undefined),
    [posed, document.rig, pose, drags.constraints],
  );
  const ghosts = useMemo(() => {
    if (!posed || !state.onion || playback.playing) return undefined;
    const previous = animation.keys.filter((key) => key.frame < state.frame).at(-1);
    const next = animation.keys.find((key) => key.frame > state.frame);
    return [
      ...(previous ? [{ tone: "previous" as const, skeleton: skeletonFor(rig, samplePose(document.rig, animation, previous.frame).pose) }] : []),
      ...(next ? [{ tone: "next" as const, skeleton: skeletonFor(rig, samplePose(document.rig, animation, next.frame).pose) }] : []),
    ];
  }, [posed, state.onion, playback.playing, animation, state.frame, rig, document.rig]);
  const selectedBone = state.selection?.kind === "bone" ? state.selection.name : null;

  const run = useCallback((command: Command) => {
    if (command === "new") files.newDocument();
    else if (command === "open") void files.open();
    else if (command === "save") void files.save();
    else if (command === "saveAs") void files.saveAs();
    else if (command === "undo" || command === "redo") dispatch({ type: command });
    else if (command === "delete") dispatch({ type: "deleteSelection" });
    else if (command === "togglePlay") playback.toggle();
    else if (command === "previousFrame" || command === "nextFrame") {
      playback.pause();
      dispatch({ type: "setFrame", frame: state.frame + (command === "nextFrame" ? 1 : -1) });
    } else if (command === "previousKey" || command === "nextKey") {
      playback.pause();
      dispatch({ type: "stepKey", direction: command === "nextKey" ? 1 : -1 });
    } else dispatch({ type: "select", selection: null });
  }, [files, playback, state.frame]);
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
          drag={drags.drag}
          constraints={markers}
          ghosts={ghosts}
        />
      </main>

      <aside className="panel panel--right">
        <h2 className="panel__title">{{ setup: "Rig setup", pose: "Pose", animate: "Inspector", export: "Export" }[state.mode]}</h2>
        {state.mode === "export" ? (
          <ExportPanel
            document={document}
            dirty={dirty}
            onImported={(imported, source) => dispatch({ type: "imported", document: imported, source })}
            onStatus={(status) => dispatch({ type: "status", status })}
          />
        ) : state.mode === "setup" && selectedBone ? (
          <BoneSetup rig={document.rig} bone={selectedBone} onEdit={(edit) => dispatch({ type: "rigEdit", edit })} />
        ) : state.mode === "pose" && selectedBone && animation ? (
          <PoseInspector
            rig={document.rig}
            bone={selectedBone}
            pose={pose}
            constraints={drags.constraints}
            placed={skeleton.placed}
            frame={state.frame}
            keyed={animation.keys.some((key) => key.frame === state.frame)}
            onPose={(next, constraints, note, warning) => dispatch({ type: "setPose", pose: next, constraints, note, warning })}
            onError={(text) => dispatch({ type: "status", status: { tone: "error", text } })}
          />
        ) : (
          <Inspector
            rig={document.rig}
            selection={state.selection}
            active={animation}
            pose={pose}
            placed={skeleton.placed}
            animations={document.animations}
            onRename={(from, to) => dispatch({ type: "renameAnimation", from, to })}
          />
        )}
      </aside>

      {state.mode !== "setup" && animation ? (
        <Timeline
          animation={animation}
          frame={state.frame}
          selectedKey={state.selection?.kind === "key" ? state.selection.frame : null}
          playing={playback.playing}
          canPlay={state.mode === "animate" || state.mode === "export"}
          onion={state.onion}
          onToggle={playback.toggle}
          onSeek={(frame) => {
            playback.pause();
            dispatch({ type: "setFrame", frame });
          }}
          onStepKey={(direction) => {
            playback.pause();
            dispatch({ type: "stepKey", direction });
          }}
          onSelectKey={(frame) => {
            playback.pause();
            dispatch({ type: "select", selection: { kind: "key", frame } });
          }}
          onEdit={(edit) => {
            playback.pause();
            dispatch({ type: "timeline", edit });
          }}
          onOnion={(onion) => dispatch({ type: "setOnion", onion })}
        />
      ) : null}

      <StatusBar
        status={drags.message ? { tone: "error", text: drags.message } : held.violations.length ? { tone: "error", text: held.violations.join("; ") } : state.status}
        cursor={cursor}
        zoom={state.view.zoom}
        grid={state.grid}
        snap={state.snap}
        onZoom={(factor) => dispatch({ type: "setView", view: zoomAbout(state.view, factor) })}
        onFit={() => dispatch({ type: "setView", view: fitView(document.rig.space) })}
        onGrid={(spacing) => dispatch({ type: "setGrid", spacing })}
        onSnap={(snap) => dispatch({ type: "setSnap", snap })}
        rotationSnap={state.rotationSnap}
        onRotationSnap={(degrees) => dispatch({ type: "setRotationSnap", degrees })}
      />
    </div>
  );
}
