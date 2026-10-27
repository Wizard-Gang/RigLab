// riglab.rig version 2: Hexframe's rig contract plus a format header, angle limits, two-bone chains and, with depth
// profiles, their resolved paint order.
import { createRig } from "../../vendor/hexframe/src/rig";
import type { Bone, DepthProfiles, Rig, RigContract, Space } from "../../vendor/hexframe/src/rig";
import { checkName, closedObject, isFiniteNumber, isObject, isPoint, Issues } from "./validate";
import type { Validation } from "./validate";
import { validateDepthProfiles } from "./depth";
import { resolvePaintOrder, validatePaintOrder } from "./paint";
import type { PaintOrder } from "./paint";
import type { RigLabAnimation } from "./animation";

export const RIG_FORMAT = "riglab.rig";
export const RIG_VERSION = 2;

/** Inclusive bounds on a bone's local rotation, in degrees. */
export interface AngleLimits {
  readonly min: number;
  readonly max: number;
}

export interface RigLabBone extends Bone {
  readonly limits: AngleLimits | null;
}

/**
 * Two bones solved together by IK: `lower` hangs off `upper`; the upper segment is `lower.offset`
 * and the lower segment is `lower.tip`. `bend` is the sign of `lower`'s local rotation away from straight.
 */
export interface Chain {
  readonly name: string;
  readonly upper: string;
  readonly lower: string;
  readonly bend: 1 | -1;
}

export interface RigLabRig {
  readonly format: typeof RIG_FORMAT;
  readonly version: typeof RIG_VERSION;
  readonly name: string;
  readonly space: Space;
  readonly root: string;
  readonly bones: readonly RigLabBone[];
  readonly chains: readonly Chain[];
  /** Optional consumer layering hints in Hexframe's shape; never read by placement. */
  readonly depthProfiles?: DepthProfiles;
  /** Present exactly when `depthProfiles` is: what they resolve to (`src/format/paint.ts`). */
  readonly paintOrder?: PaintOrder;
}

const SPACE = { units: "svg", x: "right", y: "down", rotation: "clockwise-positive" } as const;
const BONE_FIELDS = ["name", "parent", "offset", "tip", "slot", "artHeight", "hand", "limits"] as const;

function validateSpace(issues: Issues, value: unknown): void {
  if (!closedObject(issues, "$.space", value, ["units", "x", "y", "rotation", "height", "viewBox"])) return;
  for (const [key, expected] of Object.entries(SPACE)) {
    if (value[key] !== expected) issues.add(`$.space.${key}`, `must be '${expected}'`);
  }
  if (!isFiniteNumber(value.height) || value.height <= 0) issues.add("$.space.height", "must be a positive number");
  const box = value.viewBox;
  if (!Array.isArray(box) || box.length !== 4 || !box.every(isFiniteNumber) || box[2] <= 0 || box[3] <= 0) {
    issues.add("$.space.viewBox", "must be [x, y, width, height] with a positive width and height");
  }
}

function validateBone(issues: Issues, path: string, bone: unknown): void {
  if (!closedObject(issues, path, bone, BONE_FIELDS)) return;
  checkName(issues, `${path}.name`, bone.name);
  if (bone.parent !== null && typeof bone.parent !== "string") issues.add(`${path}.parent`, "must be a bone name or null");
  if (!isPoint(bone.offset)) issues.add(`${path}.offset`, "must be [x, y] finite numbers");
  if (bone.tip !== null && !isPoint(bone.tip)) issues.add(`${path}.tip`, "must be [x, y] finite numbers or null");
  checkName(issues, `${path}.slot`, bone.slot);
  if (!isFiniteNumber(bone.artHeight) || bone.artHeight < 0) issues.add(`${path}.artHeight`, "must be a number >= 0");
  if (bone.hand !== null) checkName(issues, `${path}.hand`, bone.hand);
  const limits = bone.limits;
  if (limits !== null && closedObject(issues, `${path}.limits`, limits, ["min", "max"])) {
    const { min, max } = limits;
    if (!isFiniteNumber(min) || !isFiniteNumber(max) || min > max || min < -360 || max > 360) {
      issues.add(`${path}.limits`, "must have finite min <= max within [-360, 360]");
    }
  }
}

/** Single root named by `root`, every parent known, no cycle, every bone reached. */
function validateTree(issues: Issues, root: unknown, bones: readonly RigLabBone[]): void {
  const byName = new Map(bones.map((bone) => [bone.name, bone]));
  bones.forEach((bone, index) => {
    if (bone.parent !== null && !byName.has(bone.parent)) issues.add(`$.bones[${index}].parent`, `names unknown bone '${bone.parent}'`);
  });
  const roots = bones.filter((bone) => bone.parent === null);
  if (roots.length !== 1 || roots[0]!.name !== root) issues.add("$.root", "must name the single bone whose parent is null");
  bones.forEach((bone, index) => {
    const seen = new Set<string>();
    for (let at: RigLabBone | undefined = bone; at?.parent; at = byName.get(at.parent)) {
      if (seen.has(at.name)) {
        issues.add(`$.bones[${index}].parent`, `forms a cycle through '${at.name}'`);
        return;
      }
      seen.add(at.name);
    }
  });
}

function validateChains(issues: Issues, value: unknown, bones: readonly RigLabBone[], root: string): void {
  if (!Array.isArray(value)) {
    issues.add("$.chains", "must be an array");
    return;
  }
  const byName = new Map(bones.map((bone) => [bone.name, bone]));
  const names = new Set<string>();
  const used = new Set<string>();
  value.forEach((chain: unknown, index) => {
    const path = `$.chains[${index}]`;
    if (!closedObject(issues, path, chain, ["name", "upper", "lower", "bend"])) return;
    if (checkName(issues, `${path}.name`, chain.name)) {
      if (names.has(chain.name)) issues.add(`${path}.name`, `duplicates chain '${chain.name}'`);
      names.add(chain.name);
    }
    if (chain.bend !== 1 && chain.bend !== -1) issues.add(`${path}.bend`, "must be 1 or -1");
    const upper = typeof chain.upper === "string" ? byName.get(chain.upper) : undefined;
    const lower = typeof chain.lower === "string" ? byName.get(chain.lower) : undefined;
    if (!upper) issues.add(`${path}.upper`, "must name a bone");
    if (!lower) issues.add(`${path}.lower`, "must name a bone");
    if (!upper || !lower) return;
    if (upper.name === root) issues.add(`${path}.upper`, "must not be the root");
    if (lower.parent !== upper.name) issues.add(`${path}.lower`, `must be a child of '${upper.name}'`);
    if (Math.hypot(...lower.offset) === 0) issues.add(`${path}.lower`, "needs a non-zero offset as the upper segment");
    if (lower.tip === null || Math.hypot(...lower.tip) === 0) issues.add(`${path}.lower`, "needs a non-zero tip as the lower segment");
    for (const name of [upper.name, lower.name]) {
      if (used.has(name)) issues.add(path, `reuses bone '${name}' from another chain`);
      used.add(name);
    }
  });
}

export function validateRig(value: unknown): Validation<RigLabRig> {
  const issues = new Issues();
  if (!closedObject(issues, "$", value, ["format", "version", "name", "space", "root", "bones", "chains"], ["depthProfiles", "paintOrder"])) {
    return issues.result(value);
  }
  if (value.format !== RIG_FORMAT) issues.add("$.format", `must be '${RIG_FORMAT}'`);
  if (value.version === 1) issues.add("$.version", `must be ${RIG_VERSION}; run npm run migrate:rig -- <library-folder>`);
  else if (value.version !== RIG_VERSION) issues.add("$.version", `must be ${RIG_VERSION}`);
  if ((value.depthProfiles === undefined) !== (value.paintOrder === undefined)) {
    issues.add("$.paintOrder", value.paintOrder === undefined ? "is missing: a rig with depth profiles carries their paint order" : "needs depthProfiles to resolve it");
  }
  checkName(issues, "$.name", value.name);
  validateSpace(issues, value.space);
  if (!Array.isArray(value.bones) || value.bones.length === 0) {
    issues.add("$.bones", "must be a non-empty array");
    return issues.result(value);
  }
  value.bones.forEach((bone: unknown, index) => validateBone(issues, `$.bones[${index}]`, bone));
  const names = value.bones.map((bone: unknown) => (isObject(bone) ? bone.name : undefined));
  names.forEach((name, index) => {
    if (names.indexOf(name) !== index) issues.add(`$.bones[${index}].name`, `duplicates bone '${String(name)}'`);
  });
  if (issues.errors.length) return issues.result(value);
  const bones = value.bones as readonly RigLabBone[];
  validateTree(issues, value.root, bones);
  if (issues.errors.length) return issues.result(value);
  validateChains(issues, value.chains, bones, value.root as string);
  if (value.depthProfiles !== undefined) validateDepthProfiles(issues, value.depthProfiles, new Set(bones.map((bone) => bone.name)));
  if (!issues.errors.length) {
    try {
      const runtime = createRigLabRig(value as unknown as RigLabRig);
      if (value.depthProfiles !== undefined) validatePaintOrder(issues, value.paintOrder, runtime);
    } catch (error) {
      issues.add("$", (error as Error).message);
    }
  }
  return issues.result(value);
}

/**
 * The rig with `paintOrder` resolved afresh from its depth profiles, its `byClip` mapping `animations` to their class's
 * profile, or without one when it has no depth profiles; throws when a profile does not paint every bone exactly once.
 */
export function withPaintOrder(rig: RigLabRig, animations: readonly Pick<RigLabAnimation, "name" | "class">[] = []): RigLabRig {
  const { depthProfiles, paintOrder: _stale, ...plain } = rig;
  if (!depthProfiles) return plain;
  return { ...plain, depthProfiles, paintOrder: resolvePaintOrder(createRigLabRig(rig), animations) };
}

/** Resolve a valid RigLab rig with Hexframe's own `createRig`, which reads only `root` and `bones`. */
export function createRigLabRig(rig: RigLabRig): Rig {
  return createRig(rig as unknown as RigContract);
}

export function boneOf(rig: RigLabRig, name: string): RigLabBone {
  const bone = rig.bones.find((candidate) => candidate.name === name);
  if (!bone) throw new Error(`rig '${rig.name}' has no bone '${name}'`);
  return bone;
}
