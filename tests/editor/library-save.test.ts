import { describe, expect, it, vi } from "vitest";
import { reactToSave, saveToLibrary } from "../../src/editor/librarySave";
import { libraryDocument } from "../../src/editor/templates";
import { SAVE_ROUTE } from "../../src/library/save";

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("saving to the library folder", () => {
  it("posts the rig and animations as JSON to the dev server's save route", async () => {
    const fetchImpl = reply(200, { ok: true, saveId: "s1", library: "~/Documents/RigLab", written: ["animations/idle.anim.json", "config.txt"], removed: [] });
    const document = libraryDocument();
    expect(await saveToLibrary(document, fetchImpl)).toEqual({ ok: true, saveId: "s1", note: "Saved 2 files to ~/Documents/RigLab" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method, (init.headers as Record<string, string>)["Content-Type"]]).toEqual([SAVE_ROUTE, "POST", "application/json"]);
    expect(JSON.parse(String(init.body))).toEqual({ rig: document.rig, animations: document.animations });
  });

  it("says when the folder already holds everything", async () => {
    const answer = await saveToLibrary(libraryDocument(), reply(200, { ok: true, saveId: "s2", library: "~/lib", written: [], removed: [] }));
    expect(answer).toEqual({ ok: true, saveId: "s2", note: "~/lib already holds this" });
    const one = await saveToLibrary(libraryDocument(), reply(200, { ok: true, saveId: "s3", library: "~/lib", written: [], removed: ["animations/walk.anim.json"] }));
    expect(one.ok && one.note).toBe("Saved 1 file to ~/lib");
  });

  it("turns a refusal into the first error and a count of the rest", async () => {
    const answer = await saveToLibrary(libraryDocument(), reply(422, { ok: false, errors: ["skins/plain: is missing tail.svg", "skins/block: is missing tail.svg"] }));
    expect(answer).toEqual({ ok: false, error: "Save refused: skins/plain: is missing tail.svg (and 1 more)" });
    expect(await saveToLibrary(libraryDocument(), reply(500, { nope: true }))).toEqual({ ok: false, error: "Save refused: the dev server answered 500" });
  });

  it("asks for npm start when no dev server writes the folder", async () => {
    const offline = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await saveToLibrary(libraryDocument(), offline)).toEqual({ ok: false, error: "Save needs npm start: only the dev server can write the library folder (Failed to fetch)" });
    const preview = vi.fn(async () => new Response("<!doctype html>", { status: 404 }));
    expect(await saveToLibrary(libraryDocument(), preview)).toEqual({ ok: false, error: "Save needs npm start: only the dev server can write the library folder" });
  });
});

describe("another page's save", () => {
  it("is ignored when it is this page's own, reloads a clean editor and warns a dirty one", () => {
    const own = new Set(["mine"]);
    expect(reactToSave("mine", own, true)).toBe("ignore");
    expect(reactToSave("theirs", own, false)).toBe("reload");
    expect(reactToSave("theirs", own, true)).toBe("warn");
  });
});
