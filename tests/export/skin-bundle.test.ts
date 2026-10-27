import { describe, expect, it } from "vitest";
import { MANIFEST } from "../../src/export/bundle";
import { buildSkinBundle, buildSkinBundles, SKINS_ROOT, skinDir, vectorRefusal } from "../../src/export/skin";
import type { SkinKind } from "../../src/export/skin";
import { zip } from "../../src/export/zip";
import { LIBRARY } from "../../src/library/active";
import { slotStem } from "../../src/library/files";
import { placeholderFiles } from "../library/placeholder";
import { writtenSkin } from "./written";

const GENERATOR = "RigLab test";
const library = placeholderFiles();
const pixelSets: readonly (readonly [SkinKind, string, string])[] = [
  ["skin", "pixel", "skins/pixel"],
  ...LIBRARY.weapons.map((item) => ["weapon", item.name, `weapons/${item.name}`] as const),
];

describe("riglab.skin bundles", () => {
  it("export the placeholder pixel skin and every pixel weapon, grids equal to the library's files", async () => {
    for (const [kind, name, dir] of pixelSets) {
      const bundle = await writtenSkin(await buildSkinBundle(LIBRARY, kind, name, GENERATOR), LIBRARY, kind, name);
      expect(bundle.manifest.generator).toBe(GENERATOR);
      expect(bundle.palette, name).toEqual(JSON.parse(library[`${dir}/palette.json`]!));
      for (const [index, part] of bundle.parts.entries()) {
        const file = `${dir}/${slotStem(bundle.manifest.parts[index]!.slot)}.part.json`;
        expect(part, file).toEqual(JSON.parse(library[file]!));
      }
    }
  });

  it("give each dagger body its own entry on the one part file they share", async () => {
    const files = await buildSkinBundle(LIBRARY, "weapon", "daggers", GENERATOR);
    const { manifest } = await writtenSkin(files, LIBRARY, "weapon", "daggers");
    expect(manifest.parts.map((part) => ("body" in part ? part.body : null))).toEqual(["dagger-front", "dagger-back"]);
    expect(new Set(manifest.parts.map((part) => part.file))).toEqual(new Set(["parts/dagger.part.json"]));
  });

  it("refuse a vector set by name, and a set the library lacks", async () => {
    await expect(buildSkinBundle(LIBRARY, "skin", "plain", GENERATOR)).rejects.toThrow(vectorRefusal("skin", "plain"));
    expect(vectorRefusal("skin", "plain")).toContain("skin 'plain' is vector art");
    await expect(buildSkinBundle(LIBRARY, "weapon", "pixel", GENERATOR)).rejects.toThrow("the library has no weapon 'pixel'");
  });

  it("lay every pixel set out under its own directory and list each vector set left out", async () => {
    const { files, refused } = await buildSkinBundles(LIBRARY, GENERATOR);
    expect(refused).toEqual([vectorRefusal("skin", "plain"), vectorRefusal("skin", "block")]);
    const dirs = [...new Set([...files.keys()].map((path) => path.split("/").slice(0, 2).join("/")))];
    expect(dirs).toEqual(pixelSets.map(([kind, name]) => skinDir(kind, name)));
    for (const [kind, name] of pixelSets) {
      const prefix = `${skinDir(kind, name)}/`;
      const own = new Map([...files].filter(([path]) => path.startsWith(prefix)).map(([path, bytes]) => [path.slice(prefix.length), bytes]));
      expect([...own.keys()][0]).toBe(MANIFEST);
      expect(own).toEqual(await buildSkinBundle(LIBRARY, kind, name, GENERATOR));
    }
  });

  it("zip to the same bytes every time through the deterministic writer", async () => {
    const archive = async () => zip(new Map([...(await buildSkinBundles(LIBRARY, GENERATOR)).files].map(([path, bytes]) => [`${SKINS_ROOT}/${path}`, bytes])));
    expect(await archive()).toEqual(await archive());
  });
});
