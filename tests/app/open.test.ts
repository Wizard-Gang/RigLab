// The editor as it opens, rendered whole to static markup: what the first screen shows before any interaction.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../../src/app/App";
import { initialState } from "../../src/editor/state";
import { LIBRARY, LIBRARY_LABEL } from "../../src/library/active";

const html = renderToStaticMarkup(createElement(App));
const count = (text: string): number => html.split(text).length - 1;

describe("the editor as it opens", () => {
  it("draws the art on every bone, with Art on", () => {
    expect(initialState().art).toBe(true);
    expect(html).toContain('aria-label="Show part art" checked=""');
    for (const bone of LIBRARY.rig.bones) expect(count(`data-bone="${bone.name}"`), bone.name).toBe(1);
  });

  it("names the library folder once, in the toolbar", () => {
    expect(count(`>${LIBRARY_LABEL}<`)).toBe(1);
    expect(html).toContain(`<span class="app__library-name">${LIBRARY_LABEL}</span>`);
    expect(html).not.toContain("status__library");
  });

  it("says what to do next in Animate, the mode it opens in", () => {
    expect(count('aria-selected="true"')).toBe(1);
    expect(html).toMatch(/role="tab" class="mode" aria-selected="true">Animate</);
    expect(html).toContain("Select a joint on a key to pose it");
    expect(html).not.toMatch(/Pose mode|seed animation|starting animation/i);
  });
});
