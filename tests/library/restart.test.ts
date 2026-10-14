import { EventEmitter } from "node:events";
import { join } from "node:path";
import type { Plugin } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { riglabLibrary as importPlugin } from "../../scripts/library-plugin.mjs";
import { RESTART_DELAY_MS, riglabLibrary } from "../../src/library/plugin";
import { PLACEHOLDER } from "./placeholder";

const ROOT = join(PLACEHOLDER, "..");
const SOURCES = ["src/library/plugin.ts", "src/library/load.ts", "src/format/rig.ts"].map((path) => join(ROOT, path));

afterEach(() => {
  vi.useRealTimers();
});

/** Run the plugin's `configureServer` against a fake dev server, then change files under the repository by path. */
function devServer(plugin: Plugin, { middlewareMode = false, restart = () => Promise.resolve() } = {}) {
  vi.useFakeTimers();
  const watcher = Object.assign(new EventEmitter(), { add: vi.fn() });
  const server = {
    config: { root: ROOT, server: { middlewareMode }, logger: { info: vi.fn(), error: vi.fn() } },
    watcher,
    restart: vi.fn(restart),
    middlewares: { use: vi.fn() },
    environments: { client: { moduleGraph: { getModuleById: () => null, invalidateModule: vi.fn() }, hot: { send: vi.fn() } } },
  };
  (plugin.configureServer as (server: unknown) => void)(server);
  const change = (...paths: string[]): void => {
    for (const path of paths) watcher.emit("all", "change", join(ROOT, path));
  };
  return { ...server, change };
}

const withSources = (sources: readonly string[] = SOURCES): Plugin => riglabLibrary({ root: ROOT, placeholder: true, sources });

describe("restarting the dev server when the library plugin's code changes", () => {
  it("restarts once a change settles, names the file, and restarts again for the next change", () => {
    const { change, restart, config } = devServer(withSources());
    change("src/library/load.ts");
    vi.advanceTimersByTime(RESTART_DELAY_MS - 1);
    expect(restart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(config.logger.info).toHaveBeenLastCalledWith("RigLab library plugin: src/library/load.ts changed, restarting server...", { timestamp: true });
    // A restart whose new code fails to load keeps this server, so the fix restarts it.
    change("src/library/load.ts");
    vi.advanceTimersByTime(RESTART_DELAY_MS);
    expect(restart).toHaveBeenCalledTimes(2);
  });

  it("restarts once for a burst of changes", () => {
    const { change, restart, config } = devServer(withSources());
    for (let step = 0; step < 5; step += 1) {
      change("src/library/plugin.ts", "src/format/rig.ts", "src/library/load.ts");
      vi.advanceTimersByTime(RESTART_DELAY_MS - 1);
    }
    expect(restart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10 * RESTART_DELAY_MS);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(config.logger.info).toHaveBeenLastCalledWith(
      "RigLab library plugin: src/library/plugin.ts, src/format/rig.ts, src/library/load.ts changed, restarting server...",
      { timestamp: true },
    );
  });

  it("leaves library files to their reload and other sources to Vite", () => {
    const { change, restart, environments } = devServer(withSources());
    change("src/app/App.tsx", "src/library/active.ts", "placeholder-library/config.txt");
    vi.advanceTimersByTime(10 * RESTART_DELAY_MS);
    expect(restart).not.toHaveBeenCalled();
    expect(environments.client.hot.send).toHaveBeenCalledWith({ type: "full-reload" });
  });

  it("leaves Vitest's middleware-mode server, and a plugin given no sources, alone", () => {
    for (const { change, restart } of [devServer(withSources(), { middlewareMode: true }), devServer(withSources([]))]) {
      change("src/library/load.ts");
      vi.advanceTimersByTime(10 * RESTART_DELAY_MS);
      expect(restart).not.toHaveBeenCalled();
    }
  });

  it("logs a restart that throws", async () => {
    const { change, config } = devServer(withSources(), { restart: () => Promise.reject(new Error("listen EADDRINUSE")) });
    change("src/library/load.ts");
    await vi.advanceTimersByTimeAsync(RESTART_DELAY_MS);
    expect(config.logger.error).toHaveBeenCalledWith("RigLab library plugin: restart failed: Error: listen EADDRINUSE", { timestamp: true });
  });

  it("is handed the plugin's own file and everything it imports, as Vite's config loads it", async () => {
    const { change, restart } = devServer(await importPlugin({ root: ROOT, placeholder: true }));
    for (const path of ["src/library/plugin.ts", "src/library/load.ts", "src/format/rig.ts", "vendor/hexframe/src/rig/fk.ts"]) {
      change(path);
      vi.advanceTimersByTime(RESTART_DELAY_MS);
      expect(restart, path).toHaveBeenCalledTimes(1);
      restart.mockClear();
    }
    change("src/app/App.tsx", "src/library/active.ts", "scripts/library-plugin.mjs");
    vi.advanceTimersByTime(10 * RESTART_DELAY_MS);
    expect(restart).not.toHaveBeenCalled();
  });
});
