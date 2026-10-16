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

interface WeaponHandlesProps {
  readonly markers: readonly WeaponMarker[];
  readonly scale: number;
  readonly grab: Grab;
  /** Rig setup also edits the weapon itself: each grip, both axis ends, and a riding body's turn on its hand. */
  readonly setup?: boolean;
}

/** A point `px` screen pixels past the tip, along the axis: where Rig setup puts the turn handle, beside the tip's own. */
function pastTip(marker: WeaponMarker, px: number, scale: number) {
  const dx = marker.tip.x - marker.butt.x;
  const dy = marker.tip.y - marker.butt.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: marker.tip.x + (dx / length) * (px / scale), y: marker.tip.y + (dy / length) * (px / scale) };
}

/**
 * Move and turn handles for each free body; a body that rides a hand moves with that hand. In Rig setup the move and
 * turn handles set the hold, a riding body's turn handle sets its grip angle, and each grip and axis end drags in the
 * body's own frame.
 */
export function WeaponHandles({ markers, scale, grab, setup = false }: WeaponHandlesProps) {
  return (
    <g className="weapon-handles">
      {markers.filter((marker) => marker.free || setup).map((marker) => {
        const turn = setup ? pastTip(marker, 14, scale) : marker.tip;
        return (
          <g key={marker.body}>
            {marker.free ? (
              <circle className="weapon-handle" cx={marker.center.x} cy={marker.center.y} r={4.5 / scale} onPointerDown={grab({ kind: "weapon-move", body: marker.body })}>
                <title>{`Move the ${marker.body}`}</title>
              </circle>
            ) : null}
            <rect
              className="weapon-handle"
              x={turn.x - 4 / scale}
              y={turn.y - 4 / scale}
              width={8 / scale}
              height={8 / scale}
              transform={`rotate(45 ${turn.x} ${turn.y})`}
              onPointerDown={grab({ kind: "weapon-turn", body: marker.body })}
            >
              <title>{`Turn the ${marker.body}`}</title>
            </rect>
            {setup ? (
              <>
                {(["butt", "tip"] as const).map((end) => (
                  <rect
                    key={end}
                    className="weapon-handle weapon-handle--axis"
                    x={marker[end].x - 3 / scale}
                    y={marker[end].y - 3 / scale}
                    width={6 / scale}
                    height={6 / scale}
                    onPointerDown={grab({ kind: "weapon-axis", body: marker.body, end })}
                  >
                    <title>{`The ${marker.body} ${end}`}</title>
                  </rect>
                ))}
                {marker.grips.map((grip) => (
                  <circle key={grip.grip} className="weapon-handle weapon-handle--grip" cx={grip.x} cy={grip.y} r={3 / scale} onPointerDown={grab({ kind: "weapon-grip", body: marker.body, grip: grip.grip })}>
                    <title>{`The ${marker.body} ${grip.grip} grip`}</title>
                  </circle>
                ))}
              </>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
