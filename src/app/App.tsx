import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { createRigLabRig } from "../format";
import { bodyTransforms, engineOf, NO_CONSTRAINTS, playAt } from "../solve";
import type { DragHandle } from "../solve";
import { constraintGeometry } from "../viewer/constraintGeometry";
import { ArtLayer } from "../viewer/ArtLayer";
import { artPlacements, withWeaponArt } from "../hexframe/art";
import type { Command } from "../editor/shortcuts";
import { platformOf } from "../editor/shortcuts";
import { weaponRigs } from "../editor/model";
import { holdAtRest } from "../editor/weaponEdits";
import { UNARMED } from "../format/classes";
import { activeAnimationOf, editorReducer, isDirty, modelOf, openState } from "../editor/state";
import { fitView, zoomAbout } from "../editor/view";
import { LIBRARY, LIBRARY_LABEL } from "../library/active";
import { partsBySlot } from "../library/parts";
import type { Point } from "../editor/view";
import { Hierarchy, WeaponHierarchy } from "../viewer/Hierarchy";
import { RigCanvas } from "../viewer/RigCanvas";
import { skeletonFor } from "../viewer/skeleton";
import { usePlayback } from "../viewer/usePlayback";
import { AnimationsPanel } from "./AnimationsPanel";
import { ModePanel } from "./ModePanel";
import { SidePanel } from "./SidePanel";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";
import { Timeline } from "./Timeline";
import { useCanvasDrags } from "./useCanvasDrags";
import { usePanels } from "./usePanels";
import { useLibrarySave } from "./useLibrarySave";
import { useShortcuts } from "./useShortcuts";

const platform = platformOf(navigator.userAgent);
const RIGHT_TITLES = { setup: "Rig setup", pose: "Pose", animate: "Inspector", export: "Export" } as const;
/** The editor draws the library's first skin, and the weapons' parts on their own slots. */
const PARTS = partsBySlot(LIBRARY);
const UNPOSED = { pose: {}, constraints: NO_CONSTRAINTS, violations: [] as readonly string[] };

export function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => openState());
  const [cursor, setCursor] = useState<Point | null>(null);
  const [panels, togglePanel] = usePanels();
  const model = modelOf(state);
  const weapons = useMemo(() => weaponRigs(model), [model.weapons]);
  const classes = useMemo(() => [UNARMED, ...weapons.map((weapon) => weapon.name)], [weapons]);
  const animation = activeAnimationOf(state);
  const dirty = isDirty(state);
  const save = useLibrarySave(state, dispatch);
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
    () => (posed ? engineOf(model.rig, animation, weapons) : null),
    [posed, model.rig, animation, weapons],
  );
  /** In Rig setup with an armed class, its weapon, held at rest with both hands on its grips. */
  const armed = useMemo(
    () => (state.mode === "setup" && animation && animation.class !== UNARMED ? model.weapons.find((item) => item.weapon.name === animation.class) ?? null : null),
    [state.mode, animation, model.weapons],
  );
  const resting = useMemo(() => (armed ? holdAtRest(model.rig, armed) : null), [armed, model.rig]);
  const played = useMemo(
    () => (engine ? playAt(engine, state.frame) : resting ?? UNPOSED),
    [engine, state.frame, resting],
  );
  const drags = useCanvasDrags(state, dispatch, played.pose, played.constraints, armed);
  const wielding = posed || armed !== null;
  const rig = useMemo(() => createRigLabRig(drags.rig), [drags.rig]);
  const pose = drags.pose;
  const skeleton = useMemo(() => skeletonFor(rig, pose), [rig, pose]);
  const markers = useMemo(
    () => (wielding ? constraintGeometry(model.rig, pose, drags.constraints) : undefined),
    [wielding, model.rig, pose, drags.constraints],
  );
  const art = useMemo(() => {
    if (!state.art) return null;
    const placements = artPlacements(drags.rig, rig, skeleton.placed, PARTS, state.activeAnimation, wielding && animation ? animation.class : null);
    const wielded = wielding ? drags.constraints.weapon : null;
    if (!wielded) return placements;
    return withWeaponArt(drags.rig, rig, placements, bodyTransforms(drags.rig, pose, wielded), wielded.weapon, PARTS, state.activeAnimation);
  }, [state.art, wielding, animation, drags.rig, drags.constraints, rig, pose, skeleton.placed, state.activeAnimation]);
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
  const selectedPart = state.selection?.kind === "body" || state.selection?.kind === "grip"
    ? { body: state.selection.body, grip: state.selection.kind === "grip" ? state.selection.grip : null }
    : null;
  const selectPart = useCallback((body: string, grip: string | null) => {
    if (!armed) return;
    const weapon = armed.weapon.name;
    dispatch({ type: "select", selection: grip === null ? { kind: "body", weapon, body } : { kind: "grip", weapon, body, grip } });
  }, [armed]);
  const onHandle = useCallback((handle: DragHandle) => {
    if (handle.kind === "weapon-grip") selectPart(handle.body, handle.grip);
    else if (handle.kind === "weapon-move" || handle.kind === "weapon-turn" || handle.kind === "weapon-axis") selectPart(handle.body, null);
  }, [selectPart]);

  const run = useCallback((command: Command) => {
    if (command === "save") void save();
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
  }, [save, playback, state.frame]);
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
        title={LIBRARY_LABEL}
        dirty={dirty}
      />

      <SidePanel
        side="left"
        label="Hierarchy and animations"
        title={<>Hierarchy · <code>{model.rig.name}</code></>}
        titleId="hierarchy-title"
        collapsed={panels.left}
        onToggle={() => togglePanel("left")}
      >
        <section className="panel__section" aria-labelledby="hierarchy-title">
          <button
            type="button"
            className="panel__fold"
            aria-expanded={!panels.hierarchy}
            aria-controls="hierarchy-bones"
            onClick={() => togglePanel("hierarchy")}
          >
            <span className="panel__fold-chevron" aria-hidden="true">{panels.hierarchy ? "▸" : "▾"}</span>
            {panels.hierarchy ? `Show the ${model.rig.bones.length} bones` : `Fold the ${model.rig.bones.length} bones`}
          </button>
          <div id="hierarchy-bones" hidden={panels.hierarchy}>
            <Hierarchy rig={rig} selected={selectedBone} onSelect={(name) => dispatch({ type: "select", selection: { kind: "bone", name } })} />
            {armed ? <WeaponHierarchy weapon={armed.weapon} selected={selectedPart} onSelect={selectPart} /> : null}
          </div>
        </section>
        <AnimationsPanel
          animations={model.animations}
          classes={classes}
          activeClass={animation?.class ?? UNARMED}
          active={state.activeAnimation}
          selected={state.selection?.kind === "animation" ? state.selection.name : null}
          onClass={(animationClass) => dispatch({ type: "setClass", animationClass })}
          onSelect={(name) => dispatch({ type: "select", selection: { kind: "animation", name } })}
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
          weaponLines={!state.art}
          weaponSetup={armed !== null}
          onHandle={onHandle}
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
        <ModePanel
          state={state}
          dispatch={dispatch}
          model={model}
          animation={animation}
          pose={pose}
          constraints={drags.constraints}
          placed={skeleton.placed}
          armed={armed}
          violations={resting?.violations ?? []}
        />
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
        onFit={() => dispatch({ type: "setView", view: fitView(model.rig.space) })}
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
