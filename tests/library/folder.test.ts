import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chooseLibraryFolder, MAX_FILE_BYTES, readLibraryFolder } from "../../src/library/folder";
import { libraryModule } from "../../src/library/plugin";
import { PLACEHOLDER, placeholderFiles } from "./placeholder";

const root = join(PLACEHOLDER, "..");
let scratch: string[] = [];
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "riglab-library-"));
  scratch.push(dir);
  return dir;
};
/** A copy of the placeholder library in a temporary folder. */
const copy = (): string => {
  const dir = join(temp(), "library");
  cpSync(PLACEHOLDER, dir, { recursive: true });
  return dir;
};
afterEach(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  scratch = [];
});

describe("choosing the library folder", () => {
  it("takes RIGLAB_LIBRARY, then ~/Documents/RigLab with a config.txt, then the placeholder", () => {
    const home = temp();
    expect(chooseLibraryFolder({ root, home })).toEqual({ dir: PLACEHOLDER, label: "placeholder library" });
    mkdirSync(join(home, "Documents", "RigLab"), { recursive: true });
    expect(chooseLibraryFolder({ root, home }).label).toBe("placeholder library");
    writeFileSync(join(home, "Documents", "RigLab", "config.txt"), "");
    expect(chooseLibraryFolder({ root, home })).toEqual({ dir: join(home, "Documents", "RigLab"), label: join("~", "Documents", "RigLab") });
    expect(chooseLibraryFolder({ root, home, env: "/srv/art" })).toEqual({ dir: "/srv/art", label: "/srv/art" });
    expect(chooseLibraryFolder({ root, home, env: "placeholder-library" }).dir).toBe(PLACEHOLDER);
    expect(chooseLibraryFolder({ root, home, env: "/srv/art", placeholder: true })).toEqual({ dir: PLACEHOLDER, label: "placeholder library" });
  });
});

describe("reading a library folder", () => {
  it("reads exactly the placeholder's mapped files, and the plugin serves them", () => {
    const read = readLibraryFolder(PLACEHOLDER);
    expect(read.errors).toEqual([]);
    const all = placeholderFiles();
    expect(read.files).toEqual(Object.fromEntries(Object.entries(all).filter(([path]) => !path.endsWith("README.md"))));
    const module = libraryModule({ dir: PLACEHOLDER, label: "placeholder library" });
    expect(module.source).toBe(`export default ${JSON.stringify({ label: "placeholder library", files: read.files })};\n`);
  });

  it("skips unread file types inside a directory and refuses a mapped one", () => {
    const dir = copy();
    writeFileSync(join(dir, "skins", "plain", "README.md"), "# notes");
    expect(Object.keys(readLibraryFolder(dir).files)).not.toContain("skins/plain/README.md");
    writeFileSync(join(dir, "rigs", "chibi.rig.yaml"), "format: riglab.rig");
    writeFileSync(join(dir, "config.txt"), "rig chibi = rigs/chibi.rig.yaml\n");
    expect(readLibraryFolder(dir).errors).toEqual(["rigs/chibi.rig.yaml: only .txt, .json and .svg files are read"]);
  });

  it("refuses a symlink out of the folder, for a directory or a file", () => {
    const dir = copy();
    const outside = temp();
    cpSync(join(dir, "skins", "block"), join(outside, "block"), { recursive: true });
    rmSync(join(dir, "skins", "block"), { recursive: true });
    symlinkSync(join(outside, "block"), join(dir, "skins", "block"));
    expect(readLibraryFolder(dir).errors).toEqual(["skins/block: resolves outside the library folder"]);
    rmSync(join(dir, "skins", "block"));
    cpSync(join(outside, "block"), join(dir, "skins", "block"), { recursive: true });
    rmSync(join(dir, "skins", "block", "head.svg"));
    symlinkSync(join(outside, "block", "head.svg"), join(dir, "skins", "block", "head.svg"));
    expect(readLibraryFolder(dir).errors).toEqual(["skins/block/head.svg: resolves outside the library folder"]);
  });

  it("refuses a file over the size limit", () => {
    const dir = copy();
    writeFileSync(join(dir, "skins", "plain", "head.svg"), " ".repeat(MAX_FILE_BYTES + 1));
    expect(readLibraryFolder(dir).errors).toEqual([`skins/plain/head.svg: is larger than ${MAX_FILE_BYTES} bytes`]);
  });

  it("leaves an escaping config path to the loader, and the plugin shows every problem", () => {
    const dir = copy();
    writeFileSync(join(dir, "config.txt"), "rig chibi = ../rigs/chibi.rig.json\n");
    expect(Object.keys(readLibraryFolder(dir).files)).toEqual(["config.txt"]);
    expect(() => libraryModule({ dir, label: "~/x" })).toThrow(/did not load:\nconfig\.txt:1: path '\.\.\/rigs\/chibi\.rig\.json' must be relative/);
    rmSync(join(dir, "config.txt"));
    expect(() => libraryModule({ dir, label: "~/x" })).toThrow(/config\.txt: is missing/);
    expect(readLibraryFolder(join(dir, "nowhere")).errors).toEqual([`${join(dir, "nowhere")}: the library folder does not exist`]);
  });
});
