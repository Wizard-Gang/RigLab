// Canvas zoom and pan in rig units. Zoom 1 fits the rig's declared viewBox plus a margin.
import type { Space } from "../../vendor/hexframe/src/rig";

export interface View {
  readonly zoom: number;
  readonly centerX: number;
  readonly centerY: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 16;
export const VIEW_MARGIN = 12;
export const GRID_SPACINGS: readonly number[] = [1, 2, 5, 10, 20];

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function fitView(space: Space): View {
  const [x, y, width, height] = space.viewBox;
  return { zoom: 1, centerX: x + width / 2, centerY: y + height / 2 };
}

/** The SVG viewBox for a view: the fitted box, scaled by 1/zoom about the view's centre. */
export function viewBoxFor(space: Space, view: View): readonly [number, number, number, number] {
  const width = (space.viewBox[2] + VIEW_MARGIN * 2) / view.zoom;
  const height = (space.viewBox[3] + VIEW_MARGIN * 2) / view.zoom;
  return [view.centerX - width / 2, view.centerY - height / 2, width, height];
}

const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Zoom by `factor` keeping the rig point `at` under the same screen position. */
export function zoomAt(view: View, at: Point, factor: number): View {
  const zoom = clampZoom(view.zoom * factor);
  const keep = view.zoom / zoom;
  return { zoom, centerX: at.x + (view.centerX - at.x) * keep, centerY: at.y + (view.centerY - at.y) * keep };
}

export function zoomAbout(view: View, factor: number): View {
  return zoomAt(view, { x: view.centerX, y: view.centerY }, factor);
}

/** Move the view so content follows a drag of (dx, dy) rig units. */
export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, centerX: view.centerX - dx, centerY: view.centerY - dy };
}

export function snapToGrid(point: Point, spacing: number): Point {
  return { x: Math.round(point.x / spacing) * spacing, y: Math.round(point.y / spacing) * spacing };
}
