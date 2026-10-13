import { WEAPONS } from "../weapons/weapons";

interface WeaponPickerProps {
  /** The weapon the key in force holds, if any. */
  readonly held: string | null;
  readonly frame: number;
  /** Whether a key sits at this frame; only a key can take or drop a weapon. */
  readonly keyed: boolean;
  readonly onPick: (name: string | null) => void;
}

const label = (name: string): string => `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

/** Pose mode's weapon for the key at this frame: none, or one of the chibi's weapons at its ready hold. */
export function WeaponPicker({ held, frame, keyed, onPick }: WeaponPickerProps) {
  const names = WEAPONS.map((weapon) => weapon.name);
  const note = !keyed
    ? `Frame ${frame} is between keys. Step to a key to change its weapon.`
    : held
      ? "Drag a hand or the weapon's handles to pose it; both hands stay on their grips."
      : "Pick a weapon to put it in the chibi's hands at this key.";
  return (
    <section className="weapon-picker" aria-labelledby="weapon-title">
      <h3 className="panel__title panel__title--section" id="weapon-title">Weapon</h3>
      <select
        className="tool tool--menu weapon-picker__select"
        aria-label={`Weapon held at frame ${frame}`}
        value={held ?? ""}
        disabled={!keyed}
        onChange={(event) => onPick(event.target.value || null)}
      >
        <option value="">None</option>
        {names.map((name) => <option key={name} value={name}>{label(name)}</option>)}
        {held && !names.includes(held) ? <option value={held}>{label(held)}</option> : null}
      </select>
      <p className="panel__note">{note}</p>
    </section>
  );
}
