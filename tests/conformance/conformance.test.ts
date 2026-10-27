// The committed conformance fixtures: the bundles equal a fresh export of conformance/library byte for byte, the index
// pins every fixture by SHA-256, every valid fixture conforms, and every invalid case fails with exactly its one defect.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { libraryModel } from "../../src/editor/model";
import { EXPORT_ROOT } from "../../src/export/bundle";
import { SKINS_ROOT } from "../../src/export/skin";
import { written, writtenSkin } from "../export/written";
import { validate } from "../schemas/evaluate";
import { ROOT, SCHEMA } from "../schemas/formats";
import { CASES, CONFORMANCE, defects, digest, errorPath, EXPORT_DIR, freshExport, indexEntries, INVALID, invalidFile, loadConformanceLibrary, pinDefects, readTree, validatorOf } from "./build";
import type { Entry } from "./build";

const library = loadConformanceLibrary();
const index = JSON.parse(readFileSync(CASES, "utf8")) as { readonly cases: readonly Entry[] };
const read = (file: string): Uint8Array => readFileSync(join(ROOT, file));
const parsed = (file: string): unknown => JSON.parse(readFileSync(join(ROOT, file), "utf8"));
const under = (files: ReadonlyMap<string, Uint8Array>, root: string): Map<string, Uint8Array> =>
  new Map([...files].filter(([path]) => path.startsWith(`${root}/`)).map(([path, bytes]) => [path.slice(root.length + 1), bytes]));
const parent = (path: string): string => path.replace(/(?:\.[^.[\]]+|\[\d+\])$/, "");

describe("conformance library", () => {
  it("loads, and holds a loop, a one-shot, a planted foot, a two-handed free body and riding daggers", () => {
    const by = (name: string) => library.animations.find((animation) => animation.name === name)!;
    expect(library.animations.map((animation) => animation.name)).toEqual(["unarmed-walk", "unarmed-attack", "sword-attack", "daggers-idle"]);
    expect([by("unarmed-walk").loop, by("unarmed-attack").loop]).toEqual([true, false]);
    expect(by("unarmed-attack").keys.every((key) => key.pins?.some((pin) => pin.chain === "leg-back"))).toBe(true);
    const sword = library.weapons.find((item) => item.name === "sword")!.weapon;
    expect(sword.bodies[0]!.grips.map((grip) => grip.chain)).toEqual(["arm-front", "arm-back"]);
    expect(new Set(by("sword-attack").keys.map((key) => JSON.stringify(key.bodies))).size).toBeGreaterThan(1);
    const daggers = library.weapons.find((item) => item.name === "daggers")!;
    expect([daggers.hold.bodies, by("daggers-idle").keys.some((key) => key.bodies)]).toEqual([[], false]);
    expect(library.skins.every((skin) => skin.grids) && library.weapons.every((weapon) => weapon.grids)).toBe(true);
  });
});

describe("conformance export", () => {
  it("equals a fresh export byte for byte, and passes the written checks", async () => {
    const fresh = await freshExport(library);
    const committed = readTree(EXPORT_DIR);
    expect([...committed.keys()]).toEqual([...fresh.keys()].sort());
    for (const [path, bytes] of fresh) expect(Buffer.from(committed.get(path)!).equals(Buffer.from(bytes)), path).toBe(true);
    await written(under(fresh, EXPORT_ROOT), libraryModel(library));
    const skins = under(fresh, SKINS_ROOT);
    for (const [kind, name] of [["skin", "pixel"], ["weapon", "sword"], ["weapon", "daggers"]] as const) {
      await writtenSkin(under(skins, `${kind}s/${name}`), library, kind, name);
    }
  });
});

describe("conformance index", () => {
  it("pins every fixture once by SHA-256, and equals the index export:conformance writes", () => {
    const files = [...readTree(CONFORMANCE).keys()].filter((path) => path !== "cases.json" && path !== "README.md").map((path) => `conformance/${path}`);
    expect(index.cases.map((entry) => entry.file)).toEqual(files);
    for (const entry of index.cases) expect(digest(read(entry.file)), entry.file).toBe(entry.sha256);
    expect(index.cases).toEqual(indexEntries());
  });

  it("lists every invalid case", () => {
    const invalid = index.cases.filter((entry) => !("valid" in entry.expect)).map((entry) => entry.file);
    expect(invalid).toEqual(INVALID.map((item) => `conformance/invalid/${item.name}.json`).sort());
  });

  it("holds every valid fixture to its schema, and every valid manifest's pins to its bundle", () => {
    for (const entry of index.cases.filter((item) => "valid" in item.expect && item.format)) {
      const value = parsed(entry.file);
      expect(validate(SCHEMA[entry.format!], value), entry.file).toEqual([]);
      if (entry.bundle) expect(pinDefects(value, readTree(join(ROOT, entry.bundle))), entry.file).toEqual([]);
      const verdict = validatorOf(entry.format!, library)?.(value);
      expect(verdict === undefined || verdict.ok, entry.file).toBe(true);
    }
  });
});

describe("conformance invalid cases", () => {
  it.each(INVALID.map((item) => [item.name, item] as const))("%s fails with exactly its expected path and reason", (_name, item) => {
    const file = invalidFile(item.name);
    const value = JSON.parse(readFileSync(file, "utf8"));
    const bundle = item.bundle ? readTree(join(CONFORMANCE, item.bundle)) : undefined;
    expect(defects(item.format, value, library, bundle)).toEqual([item.expect]);
    const base = JSON.parse(readFileSync(join(CONFORMANCE, item.base), "utf8"));
    expect(defects(item.format, base, library, bundle)).toEqual([]);
    const validator = validatorOf(item.format, library);
    if (validator && !["sha256", "bytes", "file"].includes(item.expect.reason)) {
      const verdict = validator(value);
      expect(verdict.ok, item.name).toBe(false);
      const paths = verdict.ok ? [] : verdict.errors.map(errorPath);
      expect(paths.some((path) => path === item.expect.jsonPath || path === parent(item.expect.jsonPath)), `${item.name}: ${paths.join(", ")}`).toBe(true);
    }
  });
});
