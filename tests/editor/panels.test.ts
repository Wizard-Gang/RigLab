import { describe, expect, it } from "vitest";
import { OPEN_PANELS, PANELS_KEY, readPanels, togglePanel, writePanels } from "../../src/editor/panels";
import type { PanelStorage } from "../../src/editor/panels";

function memory(initial: Record<string, string> = {}): PanelStorage & { readonly items: Record<string, string> } {
  const items = { ...initial };
  return { items, getItem: (key) => items[key] ?? null, setItem: (key, value) => void (items[key] = value) };
}

const blocked: PanelStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("collapsed side panels and the folded hierarchy", () => {
  it("toggles one side, or the hierarchy, at a time", () => {
    const left = togglePanel(OPEN_PANELS, "left");
    expect(left).toEqual({ left: true, right: false, hierarchy: false });
    expect(togglePanel(left, "right")).toEqual({ left: true, right: true, hierarchy: false });
    expect(togglePanel(left, "left")).toEqual(OPEN_PANELS);
    expect(togglePanel(OPEN_PANELS, "hierarchy")).toEqual({ left: false, right: false, hierarchy: true });
  });

  it("remembers the state across reads", () => {
    const storage = memory();
    writePanels(storage, { left: true, right: false, hierarchy: true });
    expect(JSON.parse(storage.items[PANELS_KEY]!)).toEqual({ left: true, right: false, hierarchy: true });
    expect(readPanels(storage)).toEqual({ left: true, right: false, hierarchy: true });
  });

  it("leaves both panels open when storage is empty, malformed, blocked or missing", () => {
    expect(readPanels(memory())).toEqual(OPEN_PANELS);
    expect(readPanels(memory({ [PANELS_KEY]: "{not json" }))).toEqual(OPEN_PANELS);
    expect(readPanels(memory({ [PANELS_KEY]: "[true]" }))).toEqual(OPEN_PANELS);
    expect(readPanels(memory({ [PANELS_KEY]: JSON.stringify({ left: "yes", right: true, extra: 1 }) }))).toEqual({ left: false, right: true, hierarchy: false });
    expect(readPanels(blocked)).toEqual(OPEN_PANELS);
    expect(readPanels(null)).toEqual(OPEN_PANELS);
    expect(() => writePanels(blocked, { left: true, right: true, hierarchy: true })).not.toThrow();
    expect(() => writePanels(null, OPEN_PANELS)).not.toThrow();
  });
});
