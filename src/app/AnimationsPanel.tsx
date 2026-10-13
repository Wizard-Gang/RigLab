import type { RigLabAnimation } from "../format/animation";
import { ANIMATION_KINDS, ENGINE_FPS, KINDS } from "../format/timing";
import type { AnimationKind } from "../format/timing";

interface AnimationsPanelProps {
  readonly animations: readonly RigLabAnimation[];
  readonly active: string | null;
  readonly selected: string | null;
  readonly onSelect: (name: string) => void;
  readonly onAdd: (kind: AnimationKind) => void;
  readonly onDuplicate: (name: string) => void;
  readonly onDelete: () => void;
}

const seconds = (length: number): string => `${(length / ENGINE_FPS).toFixed(2)} s`;

/** The document's animations: select one to play and inspect it; add one of a kind, duplicate or delete them. */
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
              aria-label={`${animation.name}, ${animation.kind}, ${animation.keys.length} keys over ${animation.length} frames`}
              onClick={() => onSelect(animation.name)}
            >
              <span>{animation.name}</span>
              <span className="list__meta">{KINDS[animation.kind].label} · {animation.keys.length} keys · {seconds(animation.length)}</span>
            </button>
          </li>
        ))}
      </ul>
      {animations.length === 0 ? <p className="panel__empty">No animations yet. Start one with New.</p> : null}
      <div className="panel__actions">
        <select className="tool tool--menu" aria-label="New animation of a kind" value="" onChange={(event) => onAdd(event.target.value as AnimationKind)}>
          <option value="" disabled>New…</option>
          {ANIMATION_KINDS.map((kind) => (
            <option key={kind} value={kind}>{KINDS[kind].label}: {KINDS[kind].keys} keys, {seconds(KINDS[kind].length)}{KINDS[kind].loop ? ", loop" : ""}</option>
          ))}
        </select>
        <button type="button" className="tool" disabled={active === null} onClick={() => active && onDuplicate(active)}>Duplicate</button>
        <button type="button" className="tool" disabled={selected === null} onClick={onDelete}>Delete</button>
      </div>
    </section>
  );
}
