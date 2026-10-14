import { describe, expect, it } from "vitest";
import { isLibraryPath, parseConfig } from "../../src/library/config";
import { placeholderFiles } from "./placeholder";

const errorsOf = (text: string): readonly string[] => {
  const result = parseConfig(text);
  return result.ok ? [] : result.errors;
};

describe("config.txt", () => {
  it("maps the placeholder's rig, skins, weapons and animations in line order", () => {
    const result = parseConfig(placeholderFiles()["config.txt"]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = (kind: string) => result.value.filter((entry) => entry.kind === kind).map((entry) => entry.name);
    expect(names("rig")).toEqual(["chibi"]);
    expect(names("skin")).toEqual(["plain", "block", "pixel"]);
    expect(names("weapon")).toEqual(["sword", "spear", "axe", "daggers"]);
    expect(names("animation")).toEqual(["unarmed-idle", "unarmed-walk", "unarmed-jump", "unarmed-attack", "unarmed-hit"]);
  });

  it("skips blank lines and comments, takes CRLF, and records 1-based lines", () => {
    const result = parseConfig("# a library\r\n\r\n  rig chibi = rigs/chibi.rig.json  \r\nskin plain=skins/plain\r\n");
    expect(result).toEqual({ ok: true, value: [
      { kind: "rig", name: "chibi", path: "rigs/chibi.rig.json", line: 3 },
      { kind: "skin", name: "plain", path: "skins/plain", line: 4 },
    ] });
  });

  it("refuses each malformed line with its line number", () => {
    const rig = "rig chibi = rigs/chibi.rig.json\n";
    expect(errorsOf(`${rig}hat red = hats/red`)).toEqual(["config.txt:2: unknown kind 'hat'; use rig, skin, weapon, animation"]);
    expect(errorsOf(`${rig}skin 9lives = skins/x`)[0]).toMatch(/^config\.txt:2: '9lives' must be a name/);
    expect(errorsOf(`${rig}skin plain = skins/plain`)).toEqual([]);
    expect(errorsOf(`${rig}skin plain = skins/plain\nskin plain = skins/other`)).toEqual(["config.txt:3: skin 'plain' is already mapped on line 2"]);
    expect(errorsOf(`${rig}skin plain skins/plain`)).toEqual(["config.txt:2: expected '<kind> <name> = <path>'"]);
    for (const path of ["../skins/plain", "skins/../x", "/skins/plain", "skins\\plain", "skins/plain/", "./skins"]) {
      expect(errorsOf(`${rig}skin plain = ${path}`)[0]).toMatch(/^config\.txt:2: path '.*' must be relative/);
    }
  });

  it("needs exactly one rig", () => {
    expect(errorsOf("skin plain = skins/plain")).toEqual(["config.txt: needs one 'rig' line"]);
    expect(errorsOf("rig chibi = a.json\nrig other = b.json")).toEqual(["config.txt:2: a library has one rig; line 1 already maps it"]);
  });

  it("accepts only plain relative paths", () => {
    expect(isLibraryPath("skins/tier6-warlord")).toBe(true);
    expect(isLibraryPath("rigs/chibi.rig.json")).toBe(true);
    for (const path of ["", "/", "a//b", "a/..", "..", "a b", "a/./b", "C:/x"]) expect(isLibraryPath(path)).toBe(false);
  });
});
