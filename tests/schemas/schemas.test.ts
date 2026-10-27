// The published JSON Schemas against RigLab's own validators and writers: one closed schema per consumer format, which
// accepts every document the validators accept and everything export writes, and refuses every invalid case they refuse.
// Rules a schema cannot express are listed in its description; those cases are refused by the validator alone.
import { describe, expect, it } from "vitest";
import { written, writtenSkin } from "../export/written";
import { validateAnimation, validateHold, validateRig, validateWeapon } from "../../src/format";
import type { Validation } from "../../src/format";
import { LIBRARY } from "../../src/library/active";
import { HOLDS, heldAnimation, STAFF, TWIN } from "../format/weapon-fixtures";
import { DIALECT, validate } from "./evaluate";
import { exportedFiles, exportModels, FORMATS, LIBRARIES, libraryDocuments, parse, publishedFiles, readSchema, SCHEMA, schemaFile, skinFiles, writtenFormat } from "./documents";
import type { Format } from "./documents";
import { INVALID, VALIDATOR_ONLY } from "./cases";

const formats = Object.keys(FORMATS) as Format[];
const conforms = (format: Format, value: unknown): string[] => validate(SCHEMA[format], value).map((v) => `${v.path} ${v.keyword}`);
const weapons = LIBRARY.weapons.map((item) => item.weapon);

describe("published JSON Schemas", () => {
  it("publish one closed 2020-12 schema per consumer format, named and identified by its format and version", () => {
    expect(publishedFiles()).toEqual(formats.map(schemaFile).sort());
    for (const format of formats) {
      const schema = readSchema(format);
      expect(schema.$schema, format).toBe(DIALECT);
      expect(schema.$id, format).toBe(`urn:riglab:schema:${format}:${FORMATS[format]}`);
      expect(schema.title, format).toBe(`${format} v${FORMATS[format]}`);
      expect(schema.properties.format, format).toEqual({ const: format });
      expect(schema.properties.version, format).toEqual({ const: FORMATS[format] });
      expect(schema.additionalProperties, format).toBe(false);
      expect(schema.description, format).toMatch(/src\/(?:format|export)\/\w+\.ts/);
    }
  });

  it("accept every library document its validator accepts", () => {
    expect(LIBRARIES).toContain("placeholder-library");
    const seen = new Set<Format>();
    for (const folder of LIBRARIES) {
      for (const document of libraryDocuments(folder)) {
        expect(document.verdict.ok ? [] : document.verdict.errors, document.path).toEqual([]);
        expect(conforms(document.format, document.value), document.path).toEqual([]);
        seen.add(document.format);
      }
    }
    expect([...seen].sort()).toEqual(["riglab.anim", "riglab.hold", "riglab.palette", "riglab.part", "riglab.rig", "riglab.weapon"]);
  });

  it("accept a rig without depth profiles, both weapon shapes, and keys with pins and free bodies", () => {
    const { depthProfiles: _depth, paintOrder: _order, ...plain } = LIBRARY.rig;
    const pinned = structuredClone(LIBRARY.animations[0]!) as any;
    pinned.keys[0].pins = [{ chain: "leg-front", x: 4, y: 0 }, { chain: "leg-back", x: -4, y: 0 }];
    const staffIdle = heldAnimation(LIBRARY.rig, STAFF, HOLDS.staff!, "idle");
    const twinHit = heldAnimation(LIBRARY.rig, TWIN, HOLDS.twin!, "hit");
    const cases: readonly (readonly [Format, unknown, Validation<unknown>])[] = [
      ["riglab.rig", plain, validateRig(plain)],
      ["riglab.weapon", STAFF, validateWeapon(STAFF, LIBRARY.rig)],
      ["riglab.weapon", TWIN, validateWeapon(TWIN, LIBRARY.rig)],
      ["riglab.anim", pinned, validateAnimation(pinned, LIBRARY.rig, weapons)],
      ["riglab.anim", staffIdle, validateAnimation(staffIdle, LIBRARY.rig, [STAFF, TWIN])],
      ["riglab.anim", twinHit, validateAnimation(twinHit, LIBRARY.rig, [STAFF, TWIN])],
      ["riglab.hold", { format: "riglab.hold", version: 1, ...HOLDS.staff }, validateHold({ format: "riglab.hold", version: 1, ...HOLDS.staff }, STAFF)],
    ];
    for (const [format, value, verdict] of cases) {
      expect(verdict.ok ? [] : verdict.errors, format).toEqual([]);
      expect(conforms(format, value), format).toEqual([]);
    }
  });

  it("accept every file export writes, armed and unarmed, baked, and every pixel skin bundle", async () => {
    const seen = new Set<Format>();
    for (const model of exportModels()) {
      const files = await exportedFiles(model);
      await written(files, model);
      for (const [path, bytes] of files) {
        const format = writtenFormat(path);
        expect(conforms(format, parse(bytes)), path).toEqual([]);
        seen.add(format);
      }
    }
    const skins = await skinFiles();
    for (const [path, bytes] of skins) {
      const format = writtenFormat(path);
      expect(conforms(format, parse(bytes)), path).toEqual([]);
      seen.add(format);
    }
    for (const dir of new Set([...skins.keys()].map((path) => path.split("/").slice(0, 2).join("/")))) {
      const [kind, name] = dir.split("/") as [string, string];
      const bundle = new Map([...skins].flatMap(([path, bytes]) => (path.startsWith(`${dir}/`) ? [[path.slice(dir.length + 1), bytes] as const] : [])));
      await writtenSkin(bundle, LIBRARY, kind === "skins" ? "skin" : "weapon", name);
    }
    expect([...seen].sort()).toEqual([...formats].sort());
  });

  it("refuse every invalid case, which the format's validator refuses too", () => {
    expect(new Set(INVALID.map((item) => item.format))).toEqual(new Set(formats));
    for (const item of [...INVALID, ...VALIDATOR_ONLY]) {
      expect(conforms(item.format, item.base()), `${item.format}: base of ${item.label}`).toEqual([]);
      if (item.validator) expect(item.validator(item.base()).ok, `${item.format}: base of ${item.label}`).toBe(true);
    }
    for (const item of INVALID) {
      const value = structuredClone(item.base());
      item.change(value);
      expect(conforms(item.format, value).length, `${item.format}: ${item.label}`).toBeGreaterThan(0);
      if (item.validator) expect(item.validator(value).ok, `${item.format}: ${item.label}`).toBe(false);
    }
  });

  it("leave to the validator only the rules each schema's description lists", () => {
    for (const item of VALIDATOR_ONLY) {
      const value = structuredClone(item.base());
      item.change(value);
      expect(item.validator!(value).ok, `${item.format}: ${item.label}`).toBe(false);
      expect(conforms(item.format, value), `${item.format}: ${item.label}`).toEqual([]);
      expect(readSchema(item.format).description, `${item.format}: ${item.label}`).toContain(item.listed);
    }
  });
});
