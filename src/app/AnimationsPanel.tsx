import type { RigLabAnimation } from "../format/animation";
import { ANIMATION_KINDS, ENGINE_FPS, KINDS } from "../format/timing";

interface AnimationsPanelProps {
  readonly animations: readonly RigLabAnimation[];
  /** Every class in order: unarmed, then each library weapon in config order. */
  readonly classes: readonly string[];
  readonly active: string | null;
  readonly selected: string | null;
  readonly onSelect: (name: string) => void;
}

const seconds = (length: number): string => `${(length / ENGINE_FPS).toFixed(2)} s`;

/** A class as people read it: `unarmed` is Unarmed, `sword` is Sword. */
export const classLabel = (name: string): string => `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

/** The library's animations by class, then kind. Each class has one animation of each kind, so none is added or deleted. */
export function AnimationsPanel({ animations, classes, active, selected, onSelect }: AnimationsPanelProps) {
  const groups = classes.flatMap((name) => {
    const members = ANIMATION_KINDS.flatMap((kind) => animations.filter((animation) => animation.class === name && animation.kind === kind));
    return members.length ? [{ name, members }] : [];
  });
  return (
    <section className="panel__section" aria-labelledby="animations-title">
      <h2 className="panel__title" id="animations-title">Animations</h2>
      {groups.map((group) => (
        <div key={group.name}>
          <h3 className="list__group" id={`class-${group.name}`}>{classLabel(group.name)}</h3>
          <ul className="list" aria-labelledby={`class-${group.name}`}>
            {group.members.map((animation) => (
              <li key={animation.name}>
                <button
                  type="button"
                  className={[
                    "list__item",
                    animation.name === active ? "list__item--active" : "",
                    animation.name === selected ? "list__item--selected" : "",
                  ].join(" ").trim()}
                  aria-pressed={animation.name === selected}
                  aria-label={`${classLabel(animation.class)} ${KINDS[animation.kind].label.toLowerCase()}, ${animation.keys.length} keys over ${animation.length} frames`}
                  onClick={() => onSelect(animation.name)}
                >
                  <span className="truncate" title={animation.name}>{KINDS[animation.kind].label}</span>
                  <span className="list__meta">{animation.keys.length} keys · {seconds(animation.length)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {groups.length === 0 ? <p className="panel__empty">The library holds no animations.</p> : null}
    </section>
  );
}
