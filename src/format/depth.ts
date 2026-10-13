// Closed validation of the optional Hexframe-shaped layering hints a rig may carry for its consumers.
import { closedObject, isObject, Issues } from "./validate";

const SIDES = ["far", "near"] as const;
const HEADS = ["above-arms", "below-arms"] as const;

function validateProfile(issues: Issues, path: string, profile: unknown): void {
  if (!closedObject(issues, path, profile, ["underLowerBody", "behindTorso", "foreground", "head"])) return;
  for (const key of ["underLowerBody", "behindTorso"] as const) {
    const side = profile[key];
    if (side !== null && !SIDES.includes(side as never)) issues.add(`${path}.${key}`, "must be 'far', 'near' or null");
  }
  const foreground = profile.foreground;
  if (!Array.isArray(foreground) || !foreground.every((side) => SIDES.includes(side as never))
      || new Set(foreground).size !== foreground.length) {
    issues.add(`${path}.foreground`, "must list 'far' and/or 'near' at most once each");
  }
  if (!HEADS.includes(profile.head as never)) issues.add(`${path}.head`, "must be 'above-arms' or 'below-arms'");
}

function validatePair(issues: Issues, path: string, value: unknown, bones: ReadonlySet<string>): void {
  if (!closedObject(issues, path, value, ["far", "near"])) return;
  for (const side of SIDES) {
    if (typeof value[side] !== "string" || !bones.has(value[side] as string)) issues.add(`${path}.${side}`, "must name a bone");
  }
}

export function validateDepthProfiles(issues: Issues, value: unknown, bones: ReadonlySet<string>): void {
  const path = "$.depthProfiles";
  if (!closedObject(issues, path, value, ["profiles", "sides", "byClip", "default"])) return;
  const profiles = value.profiles;
  if (!isObject(profiles) || Object.keys(profiles).length === 0) {
    issues.add(`${path}.profiles`, "must be a non-empty object");
    return;
  }
  for (const [name, profile] of Object.entries(profiles)) validateProfile(issues, `${path}.profiles.${name}`, profile);
  if (closedObject(issues, `${path}.sides`, value.sides, ["facingRight", "facingLeft"])) {
    for (const facing of ["facingRight", "facingLeft"] as const) {
      const sides = value.sides[facing];
      if (closedObject(issues, `${path}.sides.${facing}`, sides, ["arms", "legs"])) {
        validatePair(issues, `${path}.sides.${facing}.arms`, sides.arms, bones);
        validatePair(issues, `${path}.sides.${facing}.legs`, sides.legs, bones);
      }
    }
  }
  if (!isObject(value.byClip)) issues.add(`${path}.byClip`, "must be an object");
  else {
    for (const [clip, profile] of Object.entries(value.byClip)) {
      if (typeof profile !== "string" || !Object.hasOwn(profiles, profile)) issues.add(`${path}.byClip.${clip}`, "must name a profile");
    }
  }
  if (typeof value.default !== "string" || !Object.hasOwn(profiles, value.default)) issues.add(`${path}.default`, "must name a profile");
}
