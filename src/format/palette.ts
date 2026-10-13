// riglab.palette version 1: an art set's look by class token, kept as data and turned into CSS scoped to the set.
import { closedObject, isFiniteNumber, isObject, Issues, NAME } from "./validate";
import type { Validation } from "./validate";

export const PALETTE_FORMAT = "riglab.palette";
export const PALETTE_VERSION = 1;
export const PALETTE_FILE = "palette.json";

export const LINECAPS = ["butt", "round", "square"] as const;
export type Linecap = (typeof LINECAPS)[number];

/** How every path carrying one class token draws. A later token overrides an earlier one, as CSS does. */
export interface PaletteStyle {
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly opacity?: number;
  readonly linecap?: Linecap;
}

export interface RigLabPalette {
  readonly format: typeof PALETTE_FORMAT;
  readonly version: typeof PALETTE_VERSION;
  /** Pixel-art sets draw only whole 2×2-unit cells. */
  readonly pixel?: boolean;
  /** In cascade order: the first token is the base, later ones refine it. */
  readonly classes: Readonly<Record<string, PaletteStyle>>;
}

/** The class tokens part art may use: the same shape `parsePart` accepts. */
export const CLASS_TOKEN = /^[a-z][a-z0-9-]*$/;
const COLOR = /^(?:#[0-9a-fA-F]{6}|none)$/;
const STYLE_FIELDS = ["fill", "stroke", "strokeWidth", "opacity", "linecap"] as const;
const MAX_STROKE_WIDTH = 8;

function validateStyle(issues: Issues, path: string, value: unknown): void {
  if (!closedObject(issues, path, value, [], STYLE_FIELDS)) return;
  for (const field of ["fill", "stroke"] as const) {
    if (value[field] !== undefined && (typeof value[field] !== "string" || !COLOR.test(value[field]))) {
      issues.add(`${path}.${field}`, "must be '#rrggbb' or 'none'");
    }
  }
  const width = value.strokeWidth;
  if (width !== undefined && (!isFiniteNumber(width) || width < 0 || width > MAX_STROKE_WIDTH)) {
    issues.add(`${path}.strokeWidth`, `must be a number from 0 to ${MAX_STROKE_WIDTH}`);
  }
  const opacity = value.opacity;
  if (opacity !== undefined && (!isFiniteNumber(opacity) || opacity < 0 || opacity > 1)) issues.add(`${path}.opacity`, "must be a number from 0 to 1");
  if (value.linecap !== undefined && !(LINECAPS as readonly unknown[]).includes(value.linecap)) {
    issues.add(`${path}.linecap`, `must be one of ${LINECAPS.join(", ")}`);
  }
}

export function validatePalette(value: unknown): Validation<RigLabPalette> {
  const issues = new Issues();
  if (!closedObject(issues, "$", value, ["format", "version", "classes"], ["pixel"])) return issues.result(value);
  if (value.format !== PALETTE_FORMAT) issues.add("$.format", `must be '${PALETTE_FORMAT}'`);
  if (value.version !== PALETTE_VERSION) issues.add("$.version", `must be ${PALETTE_VERSION}`);
  if (value.pixel !== undefined && typeof value.pixel !== "boolean") issues.add("$.pixel", "must be true or false");
  const classes = value.classes;
  if (!isObject(classes) || !Object.keys(classes).length) {
    issues.add("$.classes", "must be an object with at least one class token");
    return issues.result(value);
  }
  for (const [token, style] of Object.entries(classes)) {
    if (!CLASS_TOKEN.test(token)) issues.add(`$.classes`, `'${token}' is not a class token`);
    validateStyle(issues, `$.classes.${token}`, style);
    const stroked = isObject(style) && ((style.stroke !== undefined && style.stroke !== "none") || style.strokeWidth !== undefined || style.linecap !== undefined);
    if (value.pixel === true && stroked) issues.add(`$.classes.${token}`, "a pixel palette draws no strokes; outline with cells instead");
  }
  return issues.result(value);
}

const DECLARATIONS: readonly [keyof PaletteStyle, string][] = [
  ["fill", "fill"],
  ["stroke", "stroke"],
  ["strokeWidth", "stroke-width"],
  ["linecap", "stroke-linecap"],
  ["opacity", "opacity"],
];

/**
 * The palette as CSS scoped to `.art-set--<set>`. Only validated values reach the text. A visible stroke keeps
 * a constant width at any zoom and joins round, as the art was drawn for. A pixel set renders with crisp edges.
 */
export function paletteCss(set: string, palette: RigLabPalette): string {
  if (!NAME.test(set)) throw new Error(`palette: '${set}' is not an art set name`);
  const root = palette.pixel ? [`.art-set--${set} { shape-rendering: crispEdges; }`] : [];
  return [...root, ...Object.entries(palette.classes).map(([token, style]) => {
    const rules = DECLARATIONS.flatMap(([field, property]) => (style[field] === undefined ? [] : [`${property}: ${style[field]};`]));
    if (style.stroke !== undefined && style.stroke !== "none") rules.push("stroke-linejoin: round;", "vector-effect: non-scaling-stroke;");
    return `.art-set--${set} .${token} { ${rules.join(" ")} }`;
  })].join("\n");
}
