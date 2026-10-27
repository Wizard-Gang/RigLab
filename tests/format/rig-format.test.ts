import { describe, expect, it } from "vitest";
import { visualPaintOrder } from "../../vendor/hexframe/src/rig";
import { createRigLabRig, HELD_PAINT, validateRig, withPaintOrder } from "../../src/format";
import type { RigLabRig } from "../../src/format";
import { LIBRARY } from "../../src/library/active";

type Mutable = Record<string, any>;

/** A deep, freely mutable copy of the chibi rig for building invalid variants. */
const chibi = (): Mutable => structuredClone(LIBRARY.rig) as Mutable;

function errorsOf(change: (rig: Mutable) => void): string {
  const rig = chibi();
  change(rig);
  const result = validateRig(rig);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.errors.join("\n");
}

const bone = (rig: Mutable, name: string): Mutable => rig.bones.find((candidate: Mutable) => candidate.name === name);

describe("riglab.rig validation", () => {
  it("accepts the chibi rig with and without depth profiles", () => {
    expect(validateRig(chibi()).ok).toBe(true);
    const plain = chibi();
    delete plain.depthProfiles;
    delete plain.paintOrder;
    expect(validateRig(plain).ok).toBe(true);
  });

  it("requires the format header and the closed top-level shape", () => {
    expect(errorsOf((rig) => { rig.format = "hexframe.rig"; })).toMatch(/\$\.format: must be 'riglab\.rig'/);
    expect(errorsOf((rig) => { rig.version = 3; })).toMatch(/\$\.version: must be 2$/m);
    expect(errorsOf((rig) => { rig.version = 1; })).toMatch(/\$\.version: must be 2; run npm run migrate:rig/);
    expect(errorsOf((rig) => { rig.name = "has space"; })).toMatch(/\$\.name: must be a name/);
    expect(errorsOf((rig) => { rig.author = "someone"; })).toMatch(/\$: has unknown field 'author'/);
    expect(errorsOf((rig) => { delete rig.chains; })).toMatch(/\$: is missing 'chains'/);
    expect(validateRig([]).ok).toBe(false);
  });

  it("pins the coordinate conventions the FK math assumes", () => {
    expect(errorsOf((rig) => { rig.space.y = "up"; })).toMatch(/\$\.space\.y: must be 'down'/);
    expect(errorsOf((rig) => { rig.space.rotation = "counter-clockwise-positive"; })).toMatch(/\$\.space\.rotation/);
    expect(errorsOf((rig) => { rig.space.viewBox = [0, 0, 0, 10]; })).toMatch(/\$\.space\.viewBox/);
    expect(errorsOf((rig) => { rig.space.height = -1; })).toMatch(/\$\.space\.height/);
  });

  it("checks every bone field with its path", () => {
    expect(errorsOf((rig) => { bone(rig, "torso").offset = [0, Number.NaN]; })).toMatch(/\$\.bones\[5\]\.offset/);
    expect(errorsOf((rig) => { bone(rig, "head").tip = [1]; })).toMatch(/\$\.bones\[10\]\.tip/);
    expect(errorsOf((rig) => { bone(rig, "head").artHeight = -2; })).toMatch(/\$\.bones\[10\]\.artHeight/);
    expect(errorsOf((rig) => { bone(rig, "head").limits = { min: 10, max: -10 }; })).toMatch(/\$\.bones\[10\]\.limits: must have finite min <= max/);
    expect(errorsOf((rig) => { bone(rig, "head").limits = { min: -10, max: 10, soft: true }; })).toMatch(/has unknown field 'soft'/);
    expect(errorsOf((rig) => { bone(rig, "head").scale = 2; })).toMatch(/\$\.bones\[10\]: has unknown field 'scale'/);
    expect(errorsOf((rig) => { bone(rig, "head").name = "torso"; })).toMatch(/duplicates bone 'torso'/);
  });

  it("requires one root, known parents and no cycles", () => {
    expect(errorsOf((rig) => { rig.root = "torso"; })).toMatch(/\$\.root: must name the single bone/);
    expect(errorsOf((rig) => { bone(rig, "head").parent = "neck"; })).toMatch(/names unknown bone 'neck'/);
    expect(errorsOf((rig) => { bone(rig, "head").parent = null; })).toMatch(/\$\.root/);
    expect(errorsOf((rig) => {
      bone(rig, "torso").parent = "head";
    })).toMatch(/forms a cycle/);
  });

  it("checks chains against the bone tree", () => {
    expect(errorsOf((rig) => { rig.chains[0].bend = 0; })).toMatch(/\$\.chains\[0\]\.bend: must be 1 or -1/);
    expect(errorsOf((rig) => { rig.chains[0].lower = "forearm-front"; })).toMatch(/must be a child of 'leg-front'/);
    expect(errorsOf((rig) => { rig.chains[0].upper = "knee"; })).toMatch(/\$\.chains\[0\]\.upper: must name a bone/);
    expect(errorsOf((rig) => { rig.chains[1] = { ...rig.chains[0], name: "again" }; })).toMatch(/reuses bone 'leg-front'/);
    expect(errorsOf((rig) => { rig.chains[1].name = rig.chains[0].name; })).toMatch(/duplicates chain 'leg-front'/);
    expect(errorsOf((rig) => { bone(rig, "shin-front").tip = null; })).toMatch(/needs a non-zero tip/);
    expect(errorsOf((rig) => { rig.chains.push({ name: "spine", upper: "pelvis", lower: "torso", bend: 1 }); })).toMatch(/must not be the root/);
  });

  it("checks the optional depth profiles against bones and profiles", () => {
    expect(errorsOf((rig) => { rig.depthProfiles.default = "missing"; })).toMatch(/\$\.depthProfiles\.default: must name a profile/);
    expect(errorsOf((rig) => { rig.depthProfiles.sides.facingLeft.arms.far = "wing"; })).toMatch(/facingLeft\.arms\.far: must name a bone/);
    expect(errorsOf((rig) => { rig.depthProfiles.profiles.punch.head = "beside-arms"; })).toMatch(/profiles\.punch\.head/);
    expect(errorsOf((rig) => { rig.depthProfiles.byClip.attack = "nope"; })).toMatch(/byClip\.attack: must name a profile/);
  });

  it("carries the paint order Hexframe resolves for every profile and facing, with the clip map and held-weapon rule", () => {
    const rig = LIBRARY.rig;
    const runtime = createRigLabRig(rig);
    for (const name of Object.keys(rig.depthProfiles!.profiles)) {
      expect(rig.paintOrder!.profiles[name]).toEqual({ right: visualPaintOrder(runtime, 1, name), left: visualPaintOrder(runtime, -1, name) });
    }
    expect(rig.paintOrder!.byClip).toEqual(rig.depthProfiles!.byClip);
    expect(rig.paintOrder!.held).toEqual(HELD_PAINT);
    expect(withPaintOrder(rig)).toEqual(rig);
    const mapped = withPaintOrder(rig, [{ name: "sword-attack", class: "sword" }, { name: "unarmed-idle", class: "unarmed" }]);
    expect(mapped.paintOrder!.byClip).toEqual({ ...rig.depthProfiles!.byClip, "sword-attack": "both-front" });
    expect(validateRig(mapped).ok).toBe(true);
    const { depthProfiles: _depth, ...plain } = rig;
    expect(withPaintOrder(plain as RigLabRig)).not.toHaveProperty("paintOrder");
  });

  it("refuses a paint order that disagrees with the depth profiles, or one without them", () => {
    expect(errorsOf((rig) => { rig.paintOrder.profiles.punch.left.reverse(); })).toMatch(/\$\.paintOrder\.profiles\.punch\.left: must be the depth profile's order/);
    expect(errorsOf((rig) => { rig.depthProfiles.profiles.punch.head = "above-arms"; }))
      .toMatch(/\$\.paintOrder\.profiles\.punch\.right: must be the depth profile's order/);
    expect(errorsOf((rig) => { delete rig.paintOrder.profiles.locomotion; })).toMatch(/\$\.paintOrder\.profiles: is missing 'locomotion'/);
    expect(errorsOf((rig) => { rig.paintOrder.byClip.sword = "punch"; })).toMatch(/\$\.paintOrder\.byClip\.sword: must be 'both-front'/);
    expect(errorsOf((rig) => { rig.paintOrder.byClip["sword-attack"] = "nope"; })).toMatch(/\$\.paintOrder\.byClip\.sword-attack: must name a profile/);
    expect(errorsOf((rig) => { rig.paintOrder.held.bodies = "under-figure"; })).toMatch(/\$\.paintOrder\.held: must be/);
    expect(errorsOf((rig) => { delete rig.paintOrder; })).toMatch(/\$\.paintOrder: is missing/);
    expect(errorsOf((rig) => { delete rig.depthProfiles; })).toMatch(/\$\.paintOrder: needs depthProfiles/);
    expect(errorsOf((rig) => {
      rig.bones.push({ name: "tail", parent: "pelvis", offset: [0, 5], tip: null, slot: "tail", artHeight: 0, hand: null, limits: null });
    })).toMatch(/\$\.depthProfiles\.profiles\.anatomical: depth profile 'anatomical' does not paint every bone exactly once/);
  });
});
