import { useEffect, useReducer } from "react";
import { LIBRARY, LIBRARY_LABEL } from "../library/active";
import { slotStem } from "../library/files";
import { Figure } from "./Figure";
import { heldWeapon, initialWardrobe, shownMotion, wardrobeReducer, wornParts } from "./state";
import type { Step, WardrobeAction } from "./state";
import { useLoop } from "./useLoop";

const KEYS: Readonly<Record<string, WardrobeAction>> = {
  ArrowLeft: { type: "skin", step: -1 },
  ArrowRight: { type: "skin", step: 1 },
  ArrowUp: { type: "slot", step: -1 },
  ArrowDown: { type: "slot", step: 1 },
  "[": { type: "part", step: -1 },
  "]": { type: "part", step: 1 },
};

interface StepperProps {
  readonly label: string;
  readonly value: string;
  readonly onStep: (step: Step) => void;
}

function Stepper({ label, value, onStep }: StepperProps) {
  return (
    <div className="wardrobe__stepper">
      <span className="wardrobe__label">{label}</span>
      <button type="button" className="tool tool--small" aria-label={`Previous ${label.toLowerCase()}`} onClick={() => onStep(-1)}>‹</button>
      <output className="wardrobe__value" aria-label={label}>{value}</output>
      <button type="button" className="tool tool--small" aria-label={`Next ${label.toLowerCase()}`} onClick={() => onStep(1)}>›</button>
    </div>
  );
}

/** Steps through the library's skins, each slot's parts, the weapons and the animations, on one read-only figure. */
export function Wardrobe() {
  const [state, dispatch] = useReducer(
    (current: ReturnType<typeof initialWardrobe>, action: WardrobeAction) => wardrobeReducer(LIBRARY, current, action),
    LIBRARY,
    initialWardrobe,
  );
  const weapon = heldWeapon(LIBRARY, state);
  const motion = shownMotion(LIBRARY, state);
  const frame = useLoop(motion);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = KEYS[event.key];
      if (!action || event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLSelectElement) return;
      event.preventDefault();
      dispatch(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="wardrobe">
      <header className="app__bar">
        <h1 className="app__title">RigLab</h1>
        <span className="wardrobe__title">Wardrobe</span>
        <a className="tool" href="../">Editor</a>
        <span className="status__library wardrobe__library" title="The library folder the wardrobe reads">{LIBRARY_LABEL}</span>
      </header>
      <main className="wardrobe__stage">
        <Figure library={LIBRARY} parts={wornParts(LIBRARY, state)} weapon={weapon} motion={motion} frame={frame} />
      </main>
      <aside className="wardrobe__panel" aria-label="Outfit">
        <Stepper label="Skin" value={LIBRARY.skins[state.skin]!.name} onStep={(step) => dispatch({ type: "skin", step })} />
        <Stepper label="Weapon" value={weapon?.name ?? "None"} onStep={(step) => dispatch({ type: "weapon", step })} />
        <Stepper label="Motion" value={motion ? `${motion.name} · ${frame}/${motion.length}` : "Rest"} onStep={(step) => dispatch({ type: "motion", step })} />
        <button type="button" className="tool" onClick={() => dispatch({ type: "reset" })}>Reset to {LIBRARY.skins[state.skin]!.name}</button>
        <h2 className="panel__title">Parts</h2>
        <ul className="wardrobe__slots" aria-label="Parts">
          {LIBRARY.rig.bones.map((bone, index) => {
            const skin = LIBRARY.skins[state.outfit[index]!]!.name;
            return (
              <li
                key={bone.slot}
                className={index === state.slot ? "wardrobe__slot wardrobe__slot--selected" : "wardrobe__slot"}
                aria-current={index === state.slot ? "true" : undefined}
                data-slot={bone.slot}
                data-skin={skin}
                onClick={() => dispatch({ type: "selectSlot", slot: index })}
              >
                <span className="wardrobe__part">{slotStem(bone.slot)}</span>
                <button type="button" className="tool tool--small" aria-label={`Previous ${slotStem(bone.slot)} part`} onClick={() => dispatch({ type: "part", step: -1, slot: index })}>‹</button>
                <span className="wardrobe__source">{skin}</span>
                <button type="button" className="tool tool--small" aria-label={`Next ${slotStem(bone.slot)} part`} onClick={() => dispatch({ type: "part", step: 1, slot: index })}>›</button>
              </li>
            );
          })}
        </ul>
        <p className="panel__note">← → skin · ↑ ↓ slot · [ ] that slot's part</p>
      </aside>
    </div>
  );
}
