import type { RigLabAnimation } from "../format/animation";

interface AnimationsPanelProps {
  readonly animations: readonly RigLabAnimation[];
  readonly active: string | null;
  readonly selected: string | null;
  readonly onSelect: (name: string) => void;
  readonly onAdd: () => void;
  readonly onDuplicate: (name: string) => void;
  readonly onDelete: () => void;
}

/** The document's animations: select one to play and inspect it; add, duplicate or delete them. */
export function AnimationsPanel({ animations, active, selected, onSelect, onAdd, onDuplicate, onDelete }: AnimationsPanelProps) {
  return (
    <section className="panel__section" aria-labelledby="animations-title">
      <h2 className="panel__title" id="animations-title">Animations</h2>
      <ul className="list" aria-label="Animations">
        {animations.map((animation) => (
          <li key={animation.name}>
            <button
              type="button"
              className={[
                "list__item",
                animation.name === active ? "list__item--active" : "",
                animation.name === selected ? "list__item--selected" : "",
              ].join(" ").trim()}
              aria-pressed={animation.name === selected}
              onClick={() => onSelect(animation.name)}
            >
              <span>{animation.name}</span>
              <span className="list__meta">{animation.keys.length} {animation.keys.length === 1 ? "key" : "keys"} · {animation.fps} fps</span>
            </button>
          </li>
        ))}
      </ul>
      {animations.length === 0 ? <p className="panel__empty">No animations yet.</p> : null}
      <div className="panel__actions">
        <button type="button" className="tool" onClick={onAdd}>New</button>
        <button type="button" className="tool" disabled={active === null} onClick={() => active && onDuplicate(active)}>Duplicate</button>
        <button type="button" className="tool" disabled={selected === null} onClick={onDelete}>Delete</button>
      </div>
    </section>
  );
}
