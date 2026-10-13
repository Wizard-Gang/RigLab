import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { createRigLabRig } from "../format";
import { engineOf, NO_CONSTRAINTS, playAt } from "../solve";
import { constraintGeometry } from "../viewer/constraintGeometry";
import { ArtLayer } from "../viewer/ArtLayer";
import { artPlacements } from "../hexframe/art";
import { ART_PARTS } from "../editor/templates";
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
import { SidePanel } from "./SidePanel";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";
import { Timeline } from "./Timeline";
import { useCanvasDrags } from "./useCanvasDrags";
import { useFileCommands } from "./useFileCommands";
import { usePanels } from "./usePanels";
import { useShortcuts } from "./useShortcuts";

const platform = platformOf(navigator.userAgent);
const RIGHT_TITLES = { setup: "Rig setup", pose: "Pose", animate: "Inspector", export: "Export" } as const;

export function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => initialState());
  const [cursor, setCursor] = useState<Point | null>(null);
  const [panels, togglePanel] = usePanels();
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
  const engine = useMemo(
    () => (posed ? engineOf(document.rig, animation, document.weapons) : null),
    [posed, document.rig, animation, document.weapons],
  );
  const played = useMemo(
    () => (engine ? playAt(engine, state.frame) : { pose: {}, constraints: NO_CONSTRAINTS, violations: [] }),
    [engine, state.frame],
  );
  const drags = useCanvasDrags(state, dispatch, played.pose, played.constraints);
  const rig = useMemo(() => createRigLabRig(drags.rig), [drags.rig]);
  const pose = drags.pose;
  const skeleton = useMemo(() => skeletonFor(rig, pose), [rig, pose]);
  const markers = useMemo(
    () => (posed ? constraintGeometry(document.rig, pose, drags.constraints) : undefined),
    [posed, document.rig, pose, drags.constraints],
  );
  const art = useMemo(
    () => (state.art ? artPlacements(drags.rig, rig, skeleton.placed, ART_PARTS, state.activeAnimation) : null),
    [state.art, drags.rig, rig, skeleton.placed, state.activeAnimation],
  );
  const ghosts = useMemo(() => {
    if (!engine || !animation || !state.onion || playback.playing) return undefined;
    const previous = animation.keys.filter((key) => key.frame < state.frame).at(-1);
    const next = animation.keys.find((key) => key.frame > state.frame);
    return [
      ...(previous ? [{ tone: "previous" as const, skeleton: skeletonFor(rig, playAt(engine, previous.frame).pose) }] : []),
      ...(next ? [{ tone: "next" as const, skeleton: skeletonFor(rig, playAt(engine, next.frame).pose) }] : []),
    ];
  }, [engine, animation, state.onion, playback.playing, state.frame, rig]);
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
    <div className={["app", panels.left ? "app--left-collapsed" : "", panels.right ? "app--right-collapsed" : ""].join(" ").trim()}>
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

      <SidePanel
        side="left"
        label="Hierarchy and animations"
        title={<>Hierarchy · <code>{document.rig.name}</code></>}
        titleId="hierarchy-title"
        collapsed={panels.left}
        onToggle={() => togglePanel("left")}
      >
        <section className="panel__section" aria-labelledby="hierarchy-title">
          <Hierarchy rig={rig} selected={selectedBone} onSelect={(name) => dispatch({ type: "select", selection: { kind: "bone", name } })} />
        </section>
        <AnimationsPanel
          animations={document.animations}
          active={state.activeAnimation}
          selected={state.selection?.kind === "animation" ? state.selection.name : null}
          onSelect={(name) => dispatch({ type: "select", selection: { kind: "animation", name } })}
          onAdd={(kind) => dispatch({ type: "addAnimation", kind })}
          onDuplicate={(name) => dispatch({ type: "duplicateAnimation", name })}
          onDelete={() => dispatch({ type: "deleteSelection" })}
        />
      </SidePanel>

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
        >
          {art ? <ArtLayer placements={art} /> : null}
        </RigCanvas>
      </main>

      <SidePanel
        side="right"
        label={RIGHT_TITLES[state.mode]}
        title={RIGHT_TITLES[state.mode]}
        titleId="inspector-title"
        collapsed={panels.right}
        onToggle={() => togglePanel("right")}
      >
        {state.mode === "export" ? (
          <ExportPanel
            document={document}
            active={animation}
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
      </SidePanel>

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
        status={drags.message ? { tone: "error", text: drags.message } : played.violations.length ? { tone: "error", text: played.violations.join("; ") } : state.status}
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
        art={state.art}
        onArt={(value) => dispatch({ type: "setArt", art: value })}
      />
    </div>
  );
}
