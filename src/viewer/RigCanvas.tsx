import type { Rig } from "../../vendor/hexframe/src/rig";
import type { Skeleton } from "./skeleton";

interface RigCanvasProps {
  readonly rig: Rig;
  readonly skeleton: Skeleton;
  readonly selected: string | null;
  readonly onSelect: (bone: string | null) => void;
  /** Grid spacing in rig units. */
  readonly grid: number;
}

const PAD = 12;

/** The rig's SVG space, drawn in its own units: x right, y down, rotation clockwise-positive. */
export function RigCanvas({ rig, skeleton, selected, onSelect, grid }: RigCanvasProps) {
  const [x, y, width, height] = rig.contract.space.viewBox;
  const viewBox = `${x - PAD} ${y - PAD} ${width + PAD * 2} ${height + PAD * 2}`;
  const major = grid * 5;
  return (
    <svg
      className="rig-canvas"
      viewBox={viewBox}
      role="img"
      aria-label={`${rig.bones.length}-bone skeleton`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelect(null);
      }}
    >
      <defs>
        <pattern id="grid-minor" width={grid} height={grid} patternUnits="userSpaceOnUse">
          <path d={`M ${grid} 0 L 0 0 0 ${grid}`} className="grid-minor" />
        </pattern>
        <pattern id="grid-major" width={major} height={major} patternUnits="userSpaceOnUse">
          <rect width={major} height={major} fill="url(#grid-minor)" />
          <path d={`M ${major} 0 L 0 0 0 ${major}`} className="grid-major" />
        </pattern>
      </defs>
      <rect
        x={x - PAD}
        y={y - PAD}
        width={width + PAD * 2}
        height={height + PAD * 2}
        fill="url(#grid-major)"
        pointerEvents="none"
      />
      <line className="axis" x1={x - PAD} x2={x + width + PAD} y1={0} y2={0} />
      <line className="axis" x1={0} x2={0} y1={y - PAD} y2={y + height + PAD} />
      <g className="skeleton">
        {skeleton.segments.map((segment) => (
          <line
            key={`${segment.bone}:${segment.kind}`}
            className={segment.bone === selected ? "bone bone--selected" : "bone"}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
          />
        ))}
        {skeleton.joints.map((joint) => (
          <circle
            key={joint.bone}
            className={[
              "joint",
              joint.root ? "joint--root" : "",
              joint.bone === selected ? "joint--selected" : "",
            ].join(" ").trim()}
            cx={joint.x}
            cy={joint.y}
            r={joint.root ? 2.6 : 2}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect(joint.bone);
            }}
          >
            <title>{joint.bone}</title>
          </circle>
        ))}
      </g>
    </svg>
  );
}
