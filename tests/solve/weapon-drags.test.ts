import { describe, expect, it } from "vitest";
import type { Pose } from "../../vendor/hexframe/src/rig";
import { LIBRARY } from "../../src/library/active";
import { restPose } from "../../src/editor/animations";
import { bodyPoint, bodyTransforms, chainEnd, dragInPose, gripCenter, holdConstraints, runtimeRig } from "../../src/solve";
import type { Constraints } from "../../src/solve";
import { segmentLength, skeletonFor } from "../../src/viewer/skeleton";
import { STAFF, TWIN } from "../format/weapon-fixtures";

const rig = LIBRARY.rig;
const chain = (name: string) => rig.chains.find((candidate) => candidate.name === name)!;
const lengths = (pose: Pose) => skeletonFor(runtimeRig(rig), pose).segments.map(segmentLength);
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const body = STAFF.bodies[0]!;
const staffAt = (x: number, y: number, rotation = 0): Constraints => ({ pins: [], weapon: { weapon: STAFF, bodies: [{ body: "staff", x, y, rotation }] } });
/** The staff held at rest with both hands on it, as a key would carry it. */
const start = staffAt(-6, -30);
const held = holdConstraints(rig, restPose(rig), start).pose;
const onGrips = (pose: Pose, constraints: Constraints) => body.grips.map((grip) => distance(chainEnd(rig, pose, chain(grip.chain)), bodyPoint(constraints.weapon!.bodies[0]!, grip.at)));

describe("dragging a free weapon body", () => {
  it("moves it by its grips' midpoint, with both hands following", () => {
    const drag = dragInPose(rig, held, start, { kind: "weapon-move", body: "staff" }, { x: 2, y: -34 });
    expect([drag.status, drag.message]).toEqual(["ok", null]);
    expect(bodyPoint(drag.constraints.weapon!.bodies[0]!, gripCenter(body))).toEqual({ x: 2, y: -34 });
    expect(Math.max(...onGrips(drag.pose, drag.constraints))).toBeLessThan(1e-6);
  });

  it("turns it about its grips' midpoint toward the pointer, snapped", () => {
    const pivot = bodyPoint(start.weapon!.bodies[0]!, gripCenter(body));
    const drag = dragInPose(rig, held, start, { kind: "weapon-turn", body: "staff" }, { x: pivot.x + 10, y: pivot.y - 9 }, 15);
    const placement = drag.constraints.weapon!.bodies[0]!;
    expect(placement.rotation).toBe(-45);
    const moved = bodyPoint(placement, gripCenter(body));
    expect(distance(moved, pivot)).toBeLessThan(1e-6);
    expect(Math.max(...onGrips(drag.pose, drag.constraints))).toBeLessThan(1e-6);
  });

  it("is carried by a hand that grips it", () => {
    const drag = dragInPose(rig, held, start, { kind: "tip", bone: "forearm-front" }, { x: 9, y: -33 });
    expect(drag.status).toBe("ok");
    expect(bodyPoint(drag.constraints.weapon!.bodies[0]!, body.grips[1]!.at)).toEqual({ x: 9, y: -33 });
    expect(Math.max(...onGrips(drag.pose, drag.constraints))).toBeLessThan(1e-6);
  });

  it("reports a move out of reach and never stretches an arm", () => {
    const drag = dragInPose(rig, held, start, { kind: "weapon-move", body: "staff" }, { x: 40, y: -30 });
    expect(drag.status).toBe("limited");
    expect(drag.message).toMatch(/^arm-back is \d+\.\d\d off the staff's near grip; arm-front is \d+\.\d\d off the staff's far grip$/);
    expect(lengths(drag.pose)).toEqual(lengths(restPose(rig)).map((length) => expect.closeTo(length, 9)));
  });
});

describe("dragging a hand that a body rides", () => {
  it("poses the arm by IK and the body follows the hand", () => {
    const twin: Constraints = { pins: [], weapon: { weapon: TWIN, bodies: [] } };
    const drag = dragInPose(rig, restPose(rig), twin, { kind: "tip", bone: "forearm-front" }, { x: 20, y: -40 });
    expect(drag.status).toBe("ok");
    expect(drag.constraints).toBe(twin);
    expect(distance(chainEnd(rig, drag.pose, chain("arm-front")), { x: 20, y: -40 })).toBeLessThan(1e-6);
    const front = bodyTransforms(rig, drag.pose, twin.weapon!)[0]!;
    expect(distance(bodyPoint(front, TWIN.bodies[0]!.grips[0]!.at), chainEnd(rig, drag.pose, chain("arm-front")))).toBeLessThan(1e-9);
  });
});
