// riglab.rig version 2's paint order: every depth profile's bone order for both facings, resolved with Hexframe's
// `visualPaintOrder`, the clip-to-profile map and the held-weapon rule, so a consumer draws without resolving anything.
import { visualPaintOrder } from "../../vendor/hexframe/src/rig";
import type { DepthProfiles, Rig } from "../../vendor/hexframe/src/rig";
import type { RigLabAnimation } from "./animation";
import { checkName, closedObject, isObject, Issues } from "./validate";

/**
 * How a held weapon paints, as data: every body over the whole figure, the head included, and the forearms that grip a
 * body (each gripping chain's lower bone) over the bodies.
 */
export const HELD_PAINT = { bodies: "over-figure", grippingForearms: "over-bodies" } as const;

/** A profile's bones, back to front, for each facing. */
export interface FacingOrders {
  readonly right: readonly string[];
  readonly left: readonly string[];
}

export interface PaintOrder {
  readonly profiles: Readonly<Record<string, FacingOrders>>;
  /** The rig's `byClip`, plus each exported animation mapped to its class's profile where the rig names none for it. */
  readonly byClip: Readonly<Record<string, string>>;
  readonly held: typeof HELD_PAINT;
}

/**
 * Each animation's clip key mapped to its class's depth profile, where the rig names one for the class and none for the
 * clip, so a consumer that looks a clip up by its key alone paints it as RigLab does.
 */
export function classProfiles(byClip: Readonly<Record<string, string>>, animations: readonly Pick<RigLabAnimation, "name" | "class">[]): Record<string, string> {
  return Object.fromEntries(animations.flatMap((animation) => {
    const profile = byClip[animation.class];
    return profile !== undefined && byClip[animation.name] === undefined ? [[animation.name, profile]] : [];
  }));
}

/** Every profile's order for both facings; throws when a profile does not paint every bone exactly once. */
export function resolvePaintOrder(runtime: Rig, animations: readonly Pick<RigLabAnimation, "name" | "class">[] = []): PaintOrder {
  const depth = runtime.contract.depthProfiles;
  const profiles = Object.fromEntries(Object.keys(depth.profiles).map((name) => [name, {
    right: visualPaintOrder(runtime, 1, name),
    left: visualPaintOrder(runtime, -1, name),
  }]));
  return { profiles, byClip: { ...depth.byClip, ...classProfiles(depth.byClip, animations) }, held: HELD_PAINT };
}

const sameList = (a: unknown, b: readonly string[]): boolean => Array.isArray(a) && a.length === b.length && a.every((item, index) => item === b[index]);

/** The rig's `paintOrder` must equal what its valid depth profiles resolve to, so the profiles stay the single source. */
export function validatePaintOrder(issues: Issues, value: unknown, runtime: Rig): void {
  const path = "$.paintOrder";
  const depth: DepthProfiles = runtime.contract.depthProfiles;
  if (!closedObject(issues, path, value, ["profiles", "byClip", "held"])) return;
  const names = Object.keys(depth.profiles);
  if (closedObject(issues, `${path}.profiles`, value.profiles, names)) {
    for (const name of names) {
      const at = `${path}.profiles.${name}`;
      let expected: FacingOrders;
      try {
        expected = { right: visualPaintOrder(runtime, 1, name), left: visualPaintOrder(runtime, -1, name) };
      } catch (error) {
        issues.add(`$.depthProfiles.profiles.${name}`, (error as Error).message);
        continue;
      }
      const orders = value.profiles[name];
      if (!closedObject(issues, at, orders, ["right", "left"])) continue;
      for (const facing of ["right", "left"] as const) {
        if (!sameList(orders[facing], expected[facing])) {
          issues.add(`${at}.${facing}`, `must be the depth profile's order: ${expected[facing].join(", ")}`);
        }
      }
    }
  }
  if (!isObject(value.byClip)) issues.add(`${path}.byClip`, "must be an object");
  else {
    for (const [clip, profile] of Object.entries(depth.byClip)) {
      if (value.byClip[clip] !== profile) issues.add(`${path}.byClip.${clip}`, `must be '${profile}', as depthProfiles.byClip maps it`);
    }
    for (const [clip, profile] of Object.entries(value.byClip)) {
      if (checkName(issues, `${path}.byClip.${clip}`, clip) && (typeof profile !== "string" || !Object.hasOwn(depth.profiles, profile))) {
        issues.add(`${path}.byClip.${clip}`, "must name a profile");
      }
    }
  }
  const held = value.held;
  if (!isObject(held) || Object.keys(held).length !== 2 || held.bodies !== HELD_PAINT.bodies || held.grippingForearms !== HELD_PAINT.grippingForearms) {
    issues.add(`${path}.held`, `must be ${JSON.stringify(HELD_PAINT)}`);
  }
}
