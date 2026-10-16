import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { Rig } from "../../vendor/hexframe/src/rig";
import { panBy, viewBoxFor, zoomAt } from "../editor/view";
import type { Point, View } from "../editor/view";
import type { DragHandle } from "../solve";
import type { ConstraintGeometry } from "./constraintGeometry";
import { GridLines } from "./GridLines";
import type { Skeleton } from "./skeleton";
import { useElementSize } from "./useElementSize";
import { WeaponHandles, WeaponLines } from "./WeaponMarkers";

/** A draggable point: a bone's joint, the end of a tipped bone, or a free weapon body's move and turn handles. */
export type Handle = DragHandle;

interface RigCanvasProps {
  readonly rig: Rig;
  readonly skeleton: Skeleton;
  readonly selected: string | null;
  readonly onSelect: (bone: string | null) => void;
  readonly view: View;
  readonly onView: (view: View) => void;
  readonly onCursor: (point: Point | null) => void;
  /** Grid spacing in rig units. */
  readonly grid: number;
  /** Which handles can be dragged; `done` marks the drop, and a non-finite point a cancelled drag. */
  readonly drag?: { readonly tips: boolean; readonly onDrag: (handle: Handle, point: Point, done: boolean) => void };
  /** Pins and the weapon for this frame. */
  readonly constraints?: ConstraintGeometry;
  /** Draw held weapon bodies as lines, for when no art draws them. */
  readonly weaponLines?: boolean;
  /** Rig setup's weapon handles: each grip and axis end, and a riding body's turn. */
  readonly weaponSetup?: boolean;
  /** Called when any handle is pressed, so the editor can select what it belongs to. */
  readonly onHandle?: (handle: Handle) => void;
  /** Faint skeletons of neighbouring keys. */
  readonly ghosts?: readonly { readonly skeleton: Skeleton; readonly tone: "previous" | "next" }[];
  readonly children?: ReactNode;
}

const JOINT_PX = 5;
const ROOT_PX = 6.5;
const TIP_PX = 4;
const DRAG_THRESHOLD_PX = 3;

/**
 * A press on the canvas starts no browser text selection or drag, which WebKit would paint over the canvas and panels.
 * Cancelling it also keeps focus where it was, so a focused field is blurred here and still commits.
 */
function claimPress(event: ReactPointerEvent<Element>): void {
  event.preventDefault();
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused !== document.body) focused.blur();
}

/** The rig's SVG space in its own units (x right, y down), with wheel zoom at the cursor and drag to pan. */
export function RigCanvas({ rig, skeleton, selected, onSelect, view, onView, onCursor, grid, drag, constraints, weaponLines = true, weaponSetup = false, onHandle, ghosts, children }: RigCanvasProps) {
  const svg = useRef<SVGSVGElement>(null);
  const size = useElementSize(svg);
  const latest = useRef({ view, onView });
  latest.current = { view, onView };
  const pan = useRef<{ x: number; y: number; view: View; scale: number; moved: boolean } | null>(null);
  const handleDrag = useRef<{ handle: Handle; x: number; y: number; moved: boolean } | null>(null);
  const viewBox = viewBoxFor(rig.contract.space, view);
  const scale = size.width && size.height ? Math.min(size.width / viewBox[2], size.height / viewBox[3]) : 1;

  const toRig = (clientX: number, clientY: number): Point | null => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  };

  useEffect(() => {
    const element = svg.current;
    if (!element) return undefined;
    // React registers wheel listeners as passive; zooming must cancel the page scroll.
    const wheel = (event: WheelEvent): void => {
      event.preventDefault();
      const matrix = element.getScreenCTM();
      if (!matrix) return;
      const at = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      latest.current.onView(zoomAt(latest.current.view, at, Math.exp(-event.deltaY * 0.0015)));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);

  const grab = (handle: Handle) => (event: ReactPointerEvent<SVGElement>): void => {
    event.stopPropagation();
    claimPress(event);
    if (handle.kind === "joint" || handle.kind === "tip") onSelect(handle.bone);
    onHandle?.(handle);
    if (!drag || event.button !== 0) return;
    svg.current?.setPointerCapture(event.pointerId);
    handleDrag.current = { handle, x: event.clientX, y: event.clientY, moved: false };
  };

  const visible = {
    x: view.centerX - size.width / scale / 2,
    y: view.centerY - size.height / scale / 2,
    width: size.width / scale,
    height: size.height / scale,
  };

  return (
    <svg
      ref={svg}
      className="rig-canvas"
      viewBox={viewBox.join(" ")}
      role="img"
      aria-label={`${rig.bones.length}-bone skeleton`}
      onPointerDown={(event) => {
        if (event.button !== 0 && event.button !== 1) return;
        claimPress(event);
        event.currentTarget.setPointerCapture(event.pointerId);
        pan.current = { x: event.clientX, y: event.clientY, view, scale, moved: false };
      }}
      onPointerMove={(event) => {
        const point = toRig(event.clientX, event.clientY);
        onCursor(point);
        const dragging = handleDrag.current;
        if (dragging) {
          if (!dragging.moved && Math.hypot(event.clientX - dragging.x, event.clientY - dragging.y) < DRAG_THRESHOLD_PX) return;
          dragging.moved = true;
          if (point) drag?.onDrag(dragging.handle, point, false);
          return;
        }
        const start = pan.current;
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        start.moved = true;
        onView(panBy(start.view, dx / start.scale, dy / start.scale));
      }}
      onPointerUp={(event) => {
        const dragging = handleDrag.current;
        handleDrag.current = null;
        if (dragging) {
          const point = toRig(event.clientX, event.clientY);
          if (dragging.moved && point) drag?.onDrag(dragging.handle, point, true);
          return;
        }
        if (pan.current && !pan.current.moved) onSelect(null);
        pan.current = null;
      }}
      onPointerCancel={() => {
        const dragging = handleDrag.current;
        handleDrag.current = null;
        pan.current = null;
        if (dragging?.moved) drag?.onDrag(dragging.handle, { x: Number.NaN, y: Number.NaN }, true);
      }}
      onPointerLeave={() => onCursor(null)}
    >
      <GridLines area={visible} spacing={grid} scale={scale} />
      <line className="axis" x1={visible.x} x2={visible.x + visible.width} y1={0} y2={0} />
      <line className="axis" x1={0} x2={0} y1={visible.y} y2={visible.y + visible.height} />
      {children}
      {ghosts?.map((ghost) => (
        <g key={ghost.tone} className={`ghost ghost--${ghost.tone}`} pointerEvents="none">
          {ghost.skeleton.segments.map((segment) => (
            <line key={`${segment.bone}:${segment.kind}`} x1={segment.from.x} y1={segment.from.y} x2={segment.to.x} y2={segment.to.y} />
          ))}
        </g>
      ))}
      {constraints ? (
        <g className="constraints">
          {weaponLines ? <WeaponLines markers={constraints.weapons} /> : null}
          {constraints.pins.map((pin) => (
            <g key={pin.chain}>
              {Math.hypot(pin.end.x - pin.at.x, pin.end.y - pin.at.y) > 1e-3 ? (
                <line className="pin-strain" x1={pin.end.x} y1={pin.end.y} x2={pin.at.x} y2={pin.at.y} />
              ) : null}
              <rect className="pin" aria-label={`${pin.chain} pinned`} x={pin.at.x - 5 / scale} y={pin.at.y - 5 / scale} width={10 / scale} height={10 / scale} />
            </g>
          ))}
        </g>
      ) : null}
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
        {drag?.tips
          ? skeleton.segments.filter((segment) => segment.kind === "tip").map((segment) => (
            <rect
              key={`${segment.bone}:tip`}
              className={segment.bone === selected ? "tip-handle tip-handle--selected" : "tip-handle"}
              x={segment.to.x - TIP_PX / scale}
              y={segment.to.y - TIP_PX / scale}
              width={(TIP_PX * 2) / scale}
              height={(TIP_PX * 2) / scale}
              transform={`rotate(45 ${segment.to.x} ${segment.to.y})`}
              aria-label={`${segment.bone} end`}
              onPointerDown={grab({ bone: segment.bone, kind: "tip" })}
            />
          ))
          : null}
        {skeleton.joints.map((joint) => (
          <circle
            key={joint.bone}
            className={["joint", joint.root ? "joint--root" : "", joint.bone === selected ? "joint--selected" : "", drag ? "joint--draggable" : ""].join(" ").trim()}
            cx={joint.x}
            cy={joint.y}
            r={(joint.root ? ROOT_PX : JOINT_PX) / scale}
            aria-label={joint.bone}
            onPointerDown={grab({ bone: joint.bone, kind: "joint" })}
          />
        ))}
      </g>
      {constraints && drag ? <WeaponHandles markers={constraints.weapons} scale={scale} grab={grab} setup={weaponSetup} /> : null}
    </svg>
  );
}
