interface GridLinesProps {
  readonly area: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Minor spacing in rig units; every fifth line is major. */
  readonly spacing: number;
  /** Screen pixels per rig unit. */
  readonly scale: number;
}

const MIN_MINOR_PX = 6;
const MAX_LINES = 600;

/** Multiples of `step` inside [from, to], computed from integer indices so no rounding error accumulates. */
function multiples(from: number, to: number, step: number): number[] {
  const values = [];
  for (let index = Math.ceil(from / step); index * step <= to; index += 1) values.push(index);
  return values;
}

/** Grid lines aligned to multiples of the spacing; minor lines drop out when they would crowd the screen. */
export function GridLines({ area, spacing, scale }: GridLinesProps) {
  if (!(area.width > 0) || !(area.height > 0)) return null;
  const minorVisible = spacing * scale >= MIN_MINOR_PX;
  const every = minorVisible ? 5 : 1;
  const step = minorVisible ? spacing : spacing * 5;
  if (area.width / step + area.height / step > MAX_LINES) return null;
  const columns = multiples(area.x, area.x + area.width, step);
  const rows = multiples(area.y, area.y + area.height, step);
  const kind = (index: number): string => (index % every === 0 ? "grid-major" : "grid-minor");
  return (
    <g className="grid" pointerEvents="none">
      {columns.map((index) => (
        <line key={`x${index}`} className={kind(index)} x1={index * step} x2={index * step} y1={area.y} y2={area.y + area.height} />
      ))}
      {rows.map((index) => (
        <line key={`y${index}`} className={kind(index)} x1={area.x} x2={area.x + area.width} y1={index * step} y2={index * step} />
      ))}
    </g>
  );
}
