import { EventEmitter } from "node:events";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSave, MAX_SAVE_BYTES, saveRequestRefusal } from "../../src/library/endpoint";
import type { SaveRequest } from "../../src/library/endpoint";
import { riglabLibrary } from "../../src/library/plugin";
import { SAVE_ROUTE, SAVED_EVENT } from "../../src/library/save";
import { PLACEHOLDER } from "./placeholder";

let scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  scratch = [];
  vi.unstubAllEnvs();
});
const copy = (): string => {
  const dir = join(mkdtempSync(join(tmpdir(), "riglab-endpoint-")), "library");
  scratch.push(dir);
  cpSync(PLACEHOLDER, dir, { recursive: true });
  return dir;
};
const NAMES = ["unarmed-idle", "unarmed-walk", "unarmed-jump", "unarmed-attack", "unarmed-hit"];
const placeholderJson = (path: string) => JSON.parse(readFileSync(join(PLACEHOLDER, path), "utf8"));
/** The placeholder's rig and animations, with each animation `moves` names moved to that class: the daggers need no change to their keys. */
const save = (moves: Record<string, string> = {}) => ({
  rig: placeholderJson("rigs/chibi.rig.json"),
  animations: NAMES.map((name) => {
    const animation = placeholderJson(`animations/${name}.anim.json`);
    const moved = moves[name];
    return moved ? { ...animation, class: moved, name: `${moved}-${animation.kind}` } : animation;
  }),
});

const HEADERS = { host: "localhost:5180", origin: "http://localhost:5180", "content-type": "application/json", "sec-fetch-site": "same-origin" };
const request = (overrides: Partial<SaveRequest> & { readonly body?: string } = {}): IncomingMessage => {
  const { body = JSON.stringify(save()), ...rest } = overrides;
  return Object.assign(Readable.from([Buffer.from(body)]), { method: "POST", url: "/", headers: HEADERS, ...rest }) as unknown as IncomingMessage;
};
const refusal = (overrides: Partial<SaveRequest>, readOnly = false) =>
  saveRequestRefusal({ method: "POST", url: "/", headers: HEADERS, ...overrides }, readOnly)?.status ?? null;

describe("who may save", () => {
  it("accepts RigLab's own page on a loopback host, and nothing else", () => {
    expect(refusal({})).toBeNull();
    expect(refusal({ headers: { ...HEADERS, host: "127.0.0.1:5180", origin: "http://127.0.0.1:5180" } })).toBeNull();
    expect(refusal({ headers: { ...HEADERS, "sec-fetch-site": undefined } })).toBeNull();
    expect(refusal({ method: "GET" })).toBe(405);
    expect(refusal({ url: "/other" })).toBe(404);
    expect(refusal({ headers: { ...HEADERS, origin: undefined } })).toBe(403);
    expect(refusal({ headers: { ...HEADERS, origin: "https://example.com" } })).toBe(403);
    expect(refusal({ headers: { ...HEADERS, "sec-fetch-site": "cross-site" } })).toBe(403);
    expect(refusal({ headers: { ...HEADERS, host: "evil.test:5180", origin: "http://evil.test:5180" } })).toBe(403);
    expect(refusal({ headers: { ...HEADERS, "content-type": "text/plain" } })).toBe(415);
    expect(refusal({}, true)).toBe(409);
  });
});

describe("handling a save", () => {
  it("writes a real folder and answers with what changed", async () => {
    const dir = copy();
    const outcome = await handleSave(request({ body: JSON.stringify(save({ "unarmed-walk": "daggers" })) }), { dir, label: "~/lib" }, false);
    expect(outcome.status).toBe(200);
    expect(outcome.body).toMatchObject({ ok: true, library: "~/lib", written: ["animations/daggers-walk.anim.json", "config.txt"], removed: ["animations/unarmed-walk.anim.json"] });
    expect(readFileSync(join(dir, "config.txt"), "utf8")).toContain("animation daggers-walk = animations/daggers-walk.anim.json");
    expect(outcome.result?.saveId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses bad bodies, oversized bodies and the read-only placeholder", async () => {
    const dir = copy();
    const folder = { dir, label: "~/lib" };
    expect((await handleSave(request({ body: "{ nope" }), folder, false)).status).toBe(400);
    expect((await handleSave(request({ body: " ".repeat(MAX_SAVE_BYTES + 1) }), folder, false)).status).toBe(413);
    const broken = await handleSave(request({ body: JSON.stringify({ ...save(), rig: { ...save().rig, name: "imp" } }) }), folder, false);
    expect(broken.status).toBe(422);
    expect(broken.body.errors).toEqual(expect.arrayContaining([expect.stringMatching(/is named 'imp'/)]));
    expect((await handleSave(request(), { dir: PLACEHOLDER, label: "placeholder library" }, true)).status).toBe(409);
    expect(readFileSync(join(dir, "config.txt"), "utf8")).toBe(readFileSync(join(PLACEHOLDER, "config.txt"), "utf8"));
  });
});

describe("the dev server's save route", () => {
  function devServer(dir: string) {
    vi.stubEnv("RIGLAB_LIBRARY", dir);
    const plugin = riglabLibrary({ root: join(PLACEHOLDER, "..") });
    const watcher = Object.assign(new EventEmitter(), { add: vi.fn() });
    const send = vi.fn();
    let route: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;
    const server = {
      config: { logger: { info: vi.fn() } },
      watcher,
      middlewares: { use: (path: string, handler: typeof route) => { if (path === SAVE_ROUTE) route = handler; } },
      environments: { client: { moduleGraph: { getModuleById: () => null, invalidateModule: vi.fn() }, hot: { send } } },
    };
    (plugin.configureServer as (server: unknown) => void)(server);
    const post = (body: unknown) => new Promise<{ status: number; body: Record<string, unknown> }>((resolve) => {
      const res = { statusCode: 0, setHeader: vi.fn(), end: (text: string) => resolve({ status: res.statusCode, body: JSON.parse(text) }) };
      route!(request({ body: JSON.stringify(body) }), res as unknown as ServerResponse);
    });
    return { watcher, send, post };
  }

  it("tells every page about its own save, and still reloads them for an outside edit", async () => {
    const dir = copy();
    const { watcher, send, post } = devServer(dir);
    const answer = await post(save({ "unarmed-walk": "daggers" }));
    expect(answer.status).toBe(200);
    expect(send).toHaveBeenCalledWith({ type: "custom", event: SAVED_EVENT, data: { saveId: answer.body.saveId, written: answer.body.written, removed: answer.body.removed } });
    send.mockClear();
    for (const path of ["config.txt", "animations/daggers-walk.anim.json", "animations/unarmed-walk.anim.json", `${answer.body.backup}/config.txt`]) {
      watcher.emit("all", "change", join(dir, path));
    }
    for (const path of ["backups", String(answer.body.backup), `${answer.body.backup}/animations`]) watcher.emit("all", "addDir", join(dir, path));
    expect(send).not.toHaveBeenCalled();
    watcher.emit("all", "change", join(dir, "skins/plain/head.svg"));
    expect(send).toHaveBeenCalledWith({ type: "full-reload" });
  });
});
