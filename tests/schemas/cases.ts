// Invalid documents, each one change to a valid base. INVALID holds the cases a schema expresses, refused by the schema and
// by the format's validator; the writer formats (export, skin, baked) have no validator, since RigLab never reads them back.
// VALIDATOR_ONLY holds cross-reference cases the schema accepts and its description lists for a reader to check.
import { bakeAnimation } from "../../src/export/bake";
import { validateAnimation, validateHold, validatePalette, validatePart, validateRig, validateWeapon } from "../../src/format";
import type { Validation } from "../../src/format";
import { LIBRARY } from "../../src/library/active";
import { heldAnimation, STAFF, TWIN } from "../format/weapon-fixtures";
import type { Format } from "./documents";

export interface Case {
  readonly format: Format;
  readonly label: string;
  readonly base: () => unknown;
  readonly change: (value: any) => void;
  readonly validator?: (value: unknown) => Validation<unknown>;
  /** VALIDATOR_ONLY: the words of the schema's description that list the rule. */
  readonly listed?: string;
}

const rig = LIBRARY.rig;
const weapons = LIBRARY.weapons.map((item) => item.weapon);
const held = (name: string) => LIBRARY.weapons.find((item) => item.name === name)!;
const idle = () => LIBRARY.animations.find((animation) => animation.name === "unarmed-idle")!;
const spearHold = () => ({ format: "riglab.hold", version: 1, ...held("spear").hold });
const pixelSkin = () => LIBRARY.skins.find((skin) => skin.name === "pixel")!;
const plainPalette = () => LIBRARY.skins.find((skin) => skin.name === "plain")!.palette;
const part = () => Object.values(pixelSkin().grids!)[0]!;
const swordAttack = () => heldAnimation(rig, held("sword").weapon, held("sword").hold, "attack");
const pin = (file: string) => ({ file, sha256: "0123456789abcdef".repeat(4), bytes: 512 });
const exportManifest = () => ({
  format: "riglab.export",
  version: 2,
  generator: "RigLab test",
  rig: { name: "chibi", ...pin("chibi.rig.json") },
  animations: [{ name: "sword-attack", ...pin("animations/sword-attack.anim.json") }],
  weapons: [{ name: "sword", ...pin("weapons/sword.weapon.json"), hold: pin("weapons/sword.hold.json") }],
  baked: [{ animation: "sword-attack", ...pin("baked/sword-attack.baked.json") }],
});
const skinManifest = (kind: "skin" | "weapon") => ({
  format: "riglab.skin",
  version: 1,
  generator: "RigLab test",
  rig: "chibi",
  kind,
  name: kind === "skin" ? "pixel" : "daggers",
  palette: pin("palette.json"),
  parts: kind === "skin"
    ? [{ slot: "chibi_head", ...pin("parts/head.part.json") }]
    : [{ body: "dagger-front", slot: "weapon_dagger", ...pin("parts/dagger.part.json") }],
});
const baked = () => bakeAnimation(rig, swordAttack(), weapons);

const anim = (value: unknown) => validateAnimation(value, rig, weapons);
const weapon = (value: unknown) => validateWeapon(value, rig);
const hold = (value: unknown) => validateHold(value, held("spear").weapon);

type Change = readonly [label: string, change: (value: any) => void];
const cases = (format: Format, base: () => unknown, validator: Case["validator"], changes: readonly Change[]): Case[] =>
  changes.map(([label, change]) => ({ format, label, base, change, ...(validator ? { validator } : {}) }));

export const INVALID: readonly Case[] = [
  ...cases("riglab.rig", () => rig, validateRig, [
    ["an unknown field", (v) => { v.extra = 1; }],
    ["another format", (v) => { v.format = "riglab.rigs"; }],
    ["version 1", (v) => { v.version = 1; }],
    ["y up", (v) => { v.space.y = "up"; }],
    ["a zero-width view box", (v) => { v.space.viewBox[2] = 0; }],
    ["a bone without artHeight", (v) => { delete v.bones[1].artHeight; }],
    ["a bone name starting with a digit", (v) => { v.bones[1].name = "1leg"; }],
    ["limits beyond -360", (v) => { v.bones[1].limits = { min: -400, max: 0 }; }],
    ["a bend of 0", (v) => { v.chains[0].bend = 0; }],
    ["depth profiles without a paint order", (v) => { delete v.paintOrder; }],
    ["no depth profiles", (v) => { v.depthProfiles.profiles = {}; }],
    ["a head between the arms", (v) => { Object.values<any>(v.depthProfiles.profiles)[0].head = "between-arms"; }],
    ["a side in the foreground twice", (v) => { Object.values<any>(v.depthProfiles.profiles)[0].foreground = ["near", "near"]; }],
    ["another held-weapon rule", (v) => { v.paintOrder.held.bodies = "under-figure"; }],
    ["a paint-order clip that is not a name", (v) => { v.paintOrder.byClip["1st"] = v.depthProfiles.default; }],
  ]),
  ...cases("riglab.anim", idle, anim, [
    ["version 2", (v) => { v.version = 2; }],
    ["30 fps", (v) => { v.fps = 30; }],
    ["an unknown kind", (v) => { v.kind = "dance"; }],
    ["an idle of 61 frames", (v) => { v.length = 61; }],
    ["an idle that plays once", (v) => { v.loop = false; }],
    ["an idle of three keys", (v) => { v.keys.pop(); }],
    ["a key off its frame", (v) => { v.keys[1].frame = 16; }],
    ["a name of another kind", (v) => { v.name = "unarmed-walk"; }],
    ["an unknown interpolation", (v) => { v.keys[0].interpolation = "cubic"; }],
    ["a bone channel beyond x, y and rotation", (v) => { v.keys[0].pose.head.scale = 1; }],
    ["a rotation as text", (v) => { v.keys[0].pose.head.rotation = "0"; }],
    ["the legacy prop", (v) => { v.keys[0].prop = null; }],
    ["a pin without y", (v) => { v.keys[0].pins = [{ chain: "leg-front", x: 0 }]; }],
  ]),
  ...cases("riglab.weapon", () => STAFF, weapon, [
    ["the name unarmed", (v) => { v.name = "unarmed"; }],
    ["no bodies", (v) => { v.bodies = []; }],
    ["no grips", (v) => { v.bodies[0].grips = []; }],
    ["three grips", (v) => { v.bodies[0].grips.push({ name: "third", chain: "leg-front", at: [20, 0] }); }],
    ["an angle on a free body's grip", (v) => { v.bodies[0].grips[0].angle = 0; }],
    ["an axis of three points", (v) => { v.bodies[0].axis.push([40, 0]); }],
    ["a grip point as text", (v) => { v.bodies[0].grips[0].at = ["0", 0]; }],
  ]),
  ...cases("riglab.weapon", () => TWIN, weapon, [["a riding grip without its angle", (v) => { delete v.bodies[0].grips[0].angle; }]]),
  ...cases("riglab.hold", spearHold, hold, [
    ["another format", (v) => { v.format = "riglab.holds"; }],
    ["a placement without rotation", (v) => { delete v.bodies[0].rotation; }],
    ["an unknown field", (v) => { v.extra = true; }],
    ["a placement with an unknown field", (v) => { v.bodies[0].scale = 1; }],
  ]),
  ...cases("riglab.palette", () => pixelSkin().palette, validatePalette, [
    ["a stroke width on a pixel palette", (v) => { Object.values<any>(v.classes)[1].strokeWidth = 1; }],
    ["a visible stroke on a pixel palette", (v) => { Object.values<any>(v.classes)[1].stroke = "#000000"; }],
    ["a linecap on a pixel palette", (v) => { Object.values<any>(v.classes)[1].linecap = "round"; }],
    ["pixel as text", (v) => { v.pixel = "yes"; }],
  ]),
  ...cases("riglab.palette", plainPalette, validatePalette, [
    ["a named color", (v) => { Object.values<any>(v.classes)[0].fill = "red"; }],
    ["an opacity of 2", (v) => { Object.values<any>(v.classes)[0].opacity = 2; }],
    ["a stroke width of 9", (v) => { Object.values<any>(v.classes)[0].strokeWidth = 9; }],
    ["an unknown linecap", (v) => { Object.values<any>(v.classes)[0].linecap = "pointy"; }],
    ["no classes", (v) => { v.classes = {}; }],
    ["an upper-case class token", (v) => { v.classes.Part = {}; }],
    ["an unknown style field", (v) => { Object.values<any>(v.classes)[0].shadow = "none"; }],
  ]),
  ...cases("riglab.part", part, validatePart, [
    ["a fractional origin", (v) => { v.origin = [0.5, 0]; }],
    ["an origin beyond 1024", (v) => { v.origin = [2000, 0]; }],
    ["a size of zero", (v) => { v.size = [0, v.size[1]]; }],
    ["the transparent key", (v) => { v.keys["."] = "part"; }],
    ["a key of two characters", (v) => { v.keys.ab = "part"; }],
    ["class tokens with a double space", (v) => { v.keys[Object.keys(v.keys)[0]!] = "part  part--ink"; }],
    ["a space in a row", (v) => { v.rows[0] = ` ${v.rows[0].slice(1)}`; }],
    ["a bone starting with '_'", (v) => { v.bone = "_head"; }],
    ["rows as one string", (v) => { v.rows = v.rows.join(""); }],
  ]),
  ...cases("riglab.export", exportManifest, undefined, [
    ["version 1", (v) => { v.version = 1; }],
    ["an upper-case SHA-256", (v) => { v.rig.sha256 = v.rig.sha256.toUpperCase(); }],
    ["an empty file", (v) => { v.animations[0].bytes = 0; }],
    ["an empty weapons list", (v) => { v.weapons = []; }],
    ["a rig file outside its name pattern", (v) => { v.rig.file = "rigs/chibi.json"; }],
    ["a baked entry without its animation", (v) => { delete v.baked[0].animation; }],
    ["a hold with a name", (v) => { v.weapons[0].hold.name = "sword"; }],
    ["no generator", (v) => { delete v.generator; }],
  ]),
  ...cases("riglab.skin", () => skinManifest("skin"), undefined, [
    ["an unknown kind", (v) => { v.kind = "armor"; }],
    ["a skin part with a body", (v) => { v.parts[0].body = "head"; }],
    ["another palette file", (v) => { v.palette.file = "colors.json"; }],
    ["no parts", (v) => { v.parts = []; }],
    ["a short SHA-256", (v) => { v.parts[0].sha256 = "abc"; }],
  ]),
  ...cases("riglab.skin", () => skinManifest("weapon"), undefined, [
    ["a weapon part without its body", (v) => { delete v.parts[0].body; }],
    ["a part outside parts/", (v) => { v.parts[0].file = "dagger.part.json"; }],
  ]),
  ...cases("riglab.baked", baked, undefined, [
    ["30 fps", (v) => { v.fps = 30; }],
    ["a transform of two numbers", (v) => { v.frames[0][0] = [0, 0]; }],
    ["a bone listed twice", (v) => { v.bones[1] = v.bones[0]; }],
    ["an empty weapons list", (v) => { v.weapons = []; }],
    ["a weapon with no bodies", (v) => { v.weapons[0].bodies = {}; }],
    ["a weapon entry with an unknown field", (v) => { v.weapons[0].held = true; }],
  ]),
];

export const VALIDATOR_ONLY: readonly Case[] = [
  { format: "riglab.rig", label: "a chain whose upper bone is unknown", base: () => rig, validator: validateRig,
    change: (v) => { v.chains[0].upper = "nope"; }, listed: "a chain's `upper` and `lower` name bones" },
  { format: "riglab.rig", label: "a paint order out of order", base: () => rig, validator: validateRig,
    change: (v) => { Object.values<any>(v.paintOrder.profiles)[0].right.reverse(); }, listed: "as Hexframe's `visualPaintOrder` resolves" },
  { format: "riglab.anim", label: "another rig", base: idle, validator: anim, change: (v) => { v.rig = "other"; }, listed: "`rig` names the rig" },
  { format: "riglab.anim", label: "a pose missing a bone", base: idle, validator: anim,
    change: (v) => { delete v.keys[0].pose.head; }, listed: "exactly one entry per rig bone" },
  { format: "riglab.anim", label: "bodies on an unarmed key", base: idle, validator: anim,
    change: (v) => { v.keys[0].bodies = []; }, listed: "every other key leaves `bodies` out" },
  { format: "riglab.weapon", label: "two bodies of one name", base: () => TWIN, validator: weapon,
    change: (v) => { v.bodies[1].name = v.bodies[0].name; }, listed: "body names are unique" },
  { format: "riglab.hold", label: "another weapon's name", base: spearHold, validator: hold,
    change: (v) => { v.name = "sword"; }, listed: "`name` is the weapon's name" },
  { format: "riglab.part", label: "a row shorter than the size", base: part, validator: validatePart,
    change: (v) => { v.rows[0] = v.rows[0].slice(1); }, listed: "each is exactly `size[0]` characters" },
];
