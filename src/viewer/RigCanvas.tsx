import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Rig } from "../../vendor/hexframe/src/rig";
import { panBy, viewBoxFor, zoomAt } from "../editor/view";
import type { Point, View } from "../editor/view";
import { GridLines } from "./GridLines";
import type { Skeleton } from "./skeleton";
import { useElementSize } from "./useElementSize";

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
  /** When set, joints can be dragged; `done` marks the drop. */
  readonly onJointDrag?: (bone: string, point: Point, done: boolean) => void;
  readonly children?: ReactNode;
}

const JOINT_PX = 5;
const ROOT_PX = 6.5;
const DRAG_THRESHOLD_PX = 3;

/** The rig's SVG space in its own units (x right, y down), with wheel zoom at the cursor and drag to pan. */
export function RigCanvas({ rig, skeleton, selected, onSelect, view, onView, onCursor, grid, onJointDrag, children }: RigCanvasProps) {
  const svg = useRef<SVGSVGElement>(null);
  const size = useElementSize(svg);
  const latest = useRef({ view, onView });
  latest.current = { view, onView };
  const pan = useRef<{ x: number; y: number; view: View; scale: number; moved: boolean } | null>(null);
  const jointDrag = useRef<{ bone: string; x: number; y: number; moved: boolean } | null>(null);
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
        event.currentTarget.setPointerCapture(event.pointerId);
        pan.current = { x: event.clientX, y: event.clientY, view, scale, moved: false };
      }}
      onPointerMove={(event) => {
        const point = toRig(event.clientX, event.clientY);
        onCursor(point);
        const drag = jointDrag.current;
        if (drag) {
          if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_THRESHOLD_PX) return;
          drag.moved = true;
          if (point) onJointDrag?.(drag.bone, point, false);
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
        const drag = jointDrag.current;
        jointDrag.current = null;
        if (drag) {
          const point = toRig(event.clientX, event.clientY);
          if (drag.moved && point) onJointDrag?.(drag.bone, point, true);
          return;
        }
        if (pan.current && !pan.current.moved) onSelect(null);
        pan.current = null;
      }}
      onPointerCancel={() => {
        const drag = jointDrag.current;
        jointDrag.current = null;
        pan.current = null;
        if (drag?.moved) onJointDrag?.(drag.bone, { x: Number.NaN, y: Number.NaN }, true);
      }}
      onPointerLeave={() => onCursor(null)}
    >
      <GridLines area={visible} spacing={grid} scale={scale} />
      <line className="axis" x1={visible.x} x2={visible.x + visible.width} y1={0} y2={0} />
      <line className="axis" x1={0} x2={0} y1={visible.y} y2={visible.y + visible.height} />
      {children}
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
            className={["joint", joint.root ? "joint--root" : "", joint.bone === selected ? "joint--selected" : "", onJointDrag ? "joint--draggable" : ""].join(" ").trim()}
            cx={joint.x}
            cy={joint.y}
            r={(joint.root ? ROOT_PX : JOINT_PX) / scale}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect(joint.bone);
              if (!onJointDrag || event.button !== 0) return;
              svg.current?.setPointerCapture(event.pointerId);
              jointDrag.current = { bone: joint.bone, x: event.clientX, y: event.clientY, moved: false };
            }}
          >
            <title>{joint.bone}</title>
          </circle>
        ))}
      </g>
    </svg>
  );
}
