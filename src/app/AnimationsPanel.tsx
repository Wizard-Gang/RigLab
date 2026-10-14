import type { RigLabAnimation } from "../format/animation";
import { ANIMATION_KINDS, ENGINE_FPS, KINDS } from "../format/timing";
import { animationLabel, classLabel } from "./labels";

interface AnimationsPanelProps {
  readonly animations: readonly RigLabAnimation[];
  /** Every class in order: unarmed, then each library weapon in config order. */
  readonly classes: readonly string[];
  readonly activeClass: string;
  readonly active: string | null;
  readonly selected: string | null;
  readonly onClass: (animationClass: string) => void;
  readonly onSelect: (name: string) => void;
}

const seconds = (length: number): string => `${(length / ENGINE_FPS).toFixed(2)} s`;

/**
 * The library's animations by class: a switcher over the classes, and the active class's five kinds under it. Each class
 * has one animation of each kind, so none is added or deleted.
 */
export function AnimationsPanel({ animations, classes, activeClass, active, selected, onClass, onSelect }: AnimationsPanelProps) {
  return (
    <section className="panel__section" aria-labelledby="animations-title">
      <h2 className="panel__title" id="animations-title">Animations</h2>
      <div className="classes" role="radiogroup" aria-label="Class">
        {classes.map((name) => (
          <button key={name} type="button" role="radio" className="tool tool--small" aria-checked={name === activeClass} onClick={() => onClass(name)}>
            {classLabel(name)}
          </button>
        ))}
      </div>
      <ul className="list" aria-label={`${classLabel(activeClass)} animations`}>
        {ANIMATION_KINDS.map((kind) => {
          const animation = animations.find((candidate) => candidate.class === activeClass && candidate.kind === kind);
          const timing = KINDS[kind];
          if (!animation) {
            return <li key={kind}><p className="list__missing">{timing.label}: not in the library</p></li>;
          }
          return (
            <li key={kind}>
              <button
                type="button"
                className={[
                  "list__item",
                  animation.name === active ? "list__item--active" : "",
                  animation.name === selected ? "list__item--selected" : "",
                ].join(" ").trim()}
                aria-pressed={animation.name === selected}
                aria-label={`${animationLabel(animation.class, kind)}, ${animation.keys.length} keys over ${animation.length} frames, ${animation.loop ? "loops" : "plays once"}`}
                onClick={() => onSelect(animation.name)}
              >
                <span className="truncate" title={animation.name}>{timing.label}</span>
                <span className="list__meta">{animation.keys.length} keys · {seconds(animation.length)} · {animation.loop ? "loops" : "once"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
