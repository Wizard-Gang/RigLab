import type { PointerEvent as ReactPointerEvent } from "react";
import type { DragHandle } from "../solve";
import type { WeaponMarker } from "./constraintGeometry";

type Grab = (handle: DragHandle) => (event: ReactPointerEvent<SVGElement>) => void;

/** Each held body as a line along its axis, for when no art draws it. */
export function WeaponLines({ markers }: { readonly markers: readonly WeaponMarker[] }) {
  return (
    <g className="weapon-lines" pointerEvents="none">
      {markers.map((marker) => <line key={marker.body} className="weapon" x1={marker.butt.x} y1={marker.butt.y} x2={marker.tip.x} y2={marker.tip.y} />)}
    </g>
  );
}

/** Move and turn handles for each free body; a body that rides a hand moves with that hand. */
export function WeaponHandles({ markers, scale, grab }: { readonly markers: readonly WeaponMarker[]; readonly scale: number; readonly grab: Grab }) {
  return (
    <g className="weapon-handles">
      {markers.filter((marker) => marker.free).map((marker) => (
        <g key={marker.body}>
          <circle className="weapon-handle" cx={marker.center.x} cy={marker.center.y} r={4.5 / scale} onPointerDown={grab({ kind: "weapon-move", body: marker.body })}>
            <title>{`Move the ${marker.body}`}</title>
          </circle>
          <rect
            className="weapon-handle"
            x={marker.tip.x - 4 / scale}
            y={marker.tip.y - 4 / scale}
            width={8 / scale}
            height={8 / scale}
            transform={`rotate(45 ${marker.tip.x} ${marker.tip.y})`}
            onPointerDown={grab({ kind: "weapon-turn", body: marker.body })}
          >
            <title>{`Turn the ${marker.body}`}</title>
          </rect>
        </g>
      ))}
    </g>
  );
}
