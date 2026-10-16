// The rig canvas with every kind of handle, rendered to static markup: handles are named without SVG tooltips.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createRigLabRig } from "../../src/format";
import { initialState } from "../../src/editor/state";
import { holdAtRest } from "../../src/editor/weaponEdits";
import { LIBRARY } from "../../src/library/active";
import { constraintGeometry } from "../../src/viewer/constraintGeometry";
import { RigCanvas } from "../../src/viewer/RigCanvas";
import { skeletonFor } from "../../src/viewer/skeleton";

const sword = LIBRARY.weapons.find((item) => item.weapon.name === "sword")!;
const held = holdAtRest(LIBRARY.rig, sword);
const constraints = { ...held.constraints, pins: [{ chain: "leg-front", x: 5, y: 0 }] };
const rig = createRigLabRig(LIBRARY.rig);
const html = renderToStaticMarkup(createElement(RigCanvas, {
  rig,
  skeleton: skeletonFor(rig, held.pose),
  selected: null,
  onSelect: () => undefined,
  view: initialState().view,
  onView: () => undefined,
  onCursor: () => undefined,
  grid: 5,
  drag: { tips: true, onDrag: () => undefined },
  constraints: constraintGeometry(LIBRARY.rig, held.pose, constraints),
  weaponSetup: true,
}));
const tags = (className: string): string[] => html.match(new RegExp(`<(?:circle|rect)[^>]*class="${className}[^"]*"[^>]*>`, "g")) ?? [];

describe("the rig canvas's handles", () => {
  it("pops up no tooltip: nothing on the canvas carries an SVG title", () => {
    expect(html).not.toContain("<title");
  });

  it("names every joint, tip, pin and weapon handle for assistive technology", () => {
    const named = { joint: tags("joint"), tip: tags("tip-handle"), pin: tags("pin"), weapon: tags("weapon-handle") };
    expect(named.joint).toHaveLength(LIBRARY.rig.bones.length);
    expect(named.tip.length).toBeGreaterThan(0);
    expect(named.pin).toHaveLength(1);
    // The sword at rest in Rig setup: its move and turn handles, both axis ends and its two grips.
    expect(named.weapon).toHaveLength(6);
    for (const tag of Object.values(named).flat()) expect(tag).toMatch(/aria-label="[^"]+"/);
    expect(html).toContain('aria-label="forearm-front"');
    expect(html).toContain('aria-label="The sword upper grip"');
  });
});
