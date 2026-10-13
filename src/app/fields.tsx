import { useEffect, useState } from "react";

interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
}

/** A text field that commits on Enter or blur and reverts on Escape. */
export function TextField({ label, value, onCommit }: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (): void => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      className="field"
      aria-label={label}
      value={draft}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setDraft(value);
      }}
    />
  );
}

interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly onCommit: (value: number) => void;
  readonly step?: number;
}

const show = (value: number): string => String(+value.toFixed(4));

/** A numeric field that commits a finite number on Enter or blur; anything else reverts. */
export function NumberField({ label, value, onCommit, step = 1 }: NumberFieldProps) {
  const [draft, setDraft] = useState(show(value));
  useEffect(() => setDraft(show(value)), [value]);
  const commit = (): void => {
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setDraft(show(value));
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };
  return (
    <input
      className="field field--number"
      type="number"
      step={step}
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setDraft(show(value));
      }}
    />
  );
}
