import { describe, expect, it } from "vitest";
import { record, redo, startHistory, undo } from "../../src/editor/history";
import { commandFor, platformOf, shortcutLabel } from "../../src/editor/shortcuts";
import type { KeyInput } from "../../src/editor/shortcuts";
import { fitView, MAX_ZOOM, MIN_ZOOM, panBy, snapToGrid, VIEW_MARGIN, viewBoxFor, zoomAbout, zoomAt } from "../../src/editor/view";
import { HUMANOID_RIG } from "../../src/hexframe/humanoid";

describe("undo history", () => {
  it("records, undoes and redoes whole snapshots", () => {
    let history = startHistory("a");
    history = record(record(history, "b"), "c");
    expect(history).toEqual({ past: ["a", "b"], present: "c", future: [] });
    history = undo(undo(history));
    expect(history).toEqual({ past: [], present: "a", future: ["b", "c"] });
    expect(undo(history)).toBe(history);
    history = redo(history);
    expect(history.present).toBe("b");
    expect(record(history, "z").future).toEqual([]);
  });

  it("ignores an unchanged present and drops the oldest step past the limit", () => {
    const history = startHistory(1);
    expect(record(history, 1)).toBe(history);
    let bounded = history;
    for (let value = 2; value <= 6; value += 1) bounded = record(bounded, value, 3);
    expect(bounded.past).toEqual([3, 4, 5]);
    expect(redo(bounded)).toBe(bounded);
  });
});

describe("canvas view", () => {
  const space = HUMANOID_RIG.space;

  it("fits the rig's viewBox plus a margin at zoom 1", () => {
    const view = fitView(space);
    expect(view).toEqual({ zoom: 1, centerX: 0, centerY: -52.5 });
    expect(viewBoxFor(space, view)).toEqual([-55 - VIEW_MARGIN, -110 - VIEW_MARGIN, 110 + VIEW_MARGIN * 2, 115 + VIEW_MARGIN * 2]);
  });

  it("zooms about a point that stays at the same place in the viewBox", () => {
    const view = fitView(space);
    const at = { x: 20, y: -80 };
    const zoomed = zoomAt(view, at, 2);
    const before = viewBoxFor(space, view);
    const after = viewBoxFor(space, zoomed);
    expect(zoomed.zoom).toBe(2);
    expect((at.x - after[0]) / after[2]).toBeCloseTo((at.x - before[0]) / before[2], 12);
    expect((at.y - after[1]) / after[3]).toBeCloseTo((at.y - before[1]) / before[3], 12);
  });

  it("clamps zoom, pans with the drag and snaps to the grid", () => {
    expect(zoomAbout(fitView(space), 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomAbout(fitView(space), 0.0001).zoom).toBe(MIN_ZOOM);
    expect(panBy({ zoom: 1, centerX: 0, centerY: 0 }, 5, -2)).toEqual({ zoom: 1, centerX: -5, centerY: 2 });
    expect(snapToGrid({ x: 7.4, y: -12.6 }, 5)).toEqual({ x: 5, y: -15 });
  });
});

describe("keyboard shortcuts", () => {
  const key = (code: string, extra: Partial<KeyInput> = {}): KeyInput => ({
    key: code.replace(/^Key/, "").toLowerCase(), code, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...extra,
  });

  it("maps Mod to Cmd on macOS and Ctrl elsewhere", () => {
    expect(commandFor(key("KeyS", { metaKey: true }), "mac")).toBe("save");
    expect(commandFor(key("KeyS", { ctrlKey: true }), "mac")).toBeNull();
    expect(commandFor(key("KeyS", { ctrlKey: true }), "other")).toBe("save");
    expect(commandFor(key("KeyS", { metaKey: true }), "other")).toBeNull();
    expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("mac");
    expect(platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("other");
  });

  it("covers every file and edit command", () => {
    const mod = { metaKey: true };
    expect(commandFor(key("KeyN", { ...mod, altKey: true }), "mac")).toBe("new");
    expect(commandFor(key("KeyN", mod), "mac")).toBeNull();
    expect(commandFor(key("KeyO", mod), "mac")).toBe("open");
    expect(commandFor(key("KeyS", { ...mod, shiftKey: true }), "mac")).toBe("saveAs");
    expect(commandFor(key("KeyZ", mod), "mac")).toBe("undo");
    expect(commandFor(key("KeyZ", { ...mod, shiftKey: true }), "mac")).toBe("redo");
    expect(commandFor(key("KeyY", { ctrlKey: true }), "other")).toBe("redo");
    expect(commandFor({ ...key("Delete"), key: "Delete" }, "mac")).toBe("delete");
    expect(commandFor({ ...key("Backspace"), key: "Backspace" }, "mac")).toBe("delete");
    expect(commandFor({ ...key("Escape"), key: "Escape" }, "other")).toBe("escape");
    expect(commandFor({ ...key("Backspace"), key: "Backspace", altKey: true }, "mac")).toBeNull();
    expect(commandFor(key("KeyQ", mod), "mac")).toBeNull();
  });

  it("steps frames with the arrows, keys with Shift and plays with Space", () => {
    const plain = (name: string, extra: Partial<KeyInput> = {}): KeyInput => ({ ...key(name), key: name, ...extra });
    expect(commandFor(plain("ArrowLeft"), "mac")).toBe("previousFrame");
    expect(commandFor(plain("ArrowRight"), "other")).toBe("nextFrame");
    expect(commandFor(plain("ArrowLeft", { shiftKey: true }), "mac")).toBe("previousKey");
    expect(commandFor(plain("ArrowRight", { shiftKey: true }), "mac")).toBe("nextKey");
    expect(commandFor({ ...key("Space"), key: " " }, "mac")).toBe("togglePlay");
    expect(commandFor(plain("ArrowRight", { altKey: true }), "mac")).toBeNull();
    expect(shortcutLabel("nextKey", "mac")).toBe("⇧→");
  });

  it("labels shortcuts for the platform", () => {
    expect(shortcutLabel("saveAs", "mac")).toBe("⌘⇧S");
    expect(shortcutLabel("new", "other")).toBe("Ctrl+Alt+N");
    expect(shortcutLabel("delete", "other")).toBe("Delete");
  });
});
