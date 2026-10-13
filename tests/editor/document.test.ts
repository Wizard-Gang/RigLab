import { describe, expect, it } from "vitest";
import { parseDocument, serializeDocument, validateDocument } from "../../src/format/document";
import { blankAnimation, restPose, templateDocument, uniqueName } from "../../src/editor/animations";
import { HUMANOID_RIG } from "../../src/hexframe/humanoid";

type Mutable = Record<string, any>;

describe("riglab.document", () => {
  it("starts new documents from the humanoid and its 13 reference animations", () => {
    const document = templateDocument();
    expect(validateDocument(document).ok).toBe(true);
    expect(document.rig.name).toBe("humanoid");
    expect(document.animations).toHaveLength(13);
  });

  it("reopens a saved document deep-equal", () => {
    const document = templateDocument();
    const text = serializeDocument(document);
    expect(text.endsWith("\n")).toBe(true);
    const reopened = parseDocument(text);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.value).toEqual(document);
  });

  it("refuses invalid files with the first failing path", () => {
    expect(parseDocument("{ not json")).toEqual({ ok: false, errors: [expect.stringMatching(/^\$: is not valid JSON/)] });
    const broken = structuredClone(templateDocument()) as Mutable;
    broken.rig.bones[2].offset = [0];
    const rigError = parseDocument(JSON.stringify(broken));
    expect(rigError.ok ? [] : rigError.errors[0]).toMatch(/^\$\.rig\.bones\[2\]\.offset/);
    const keyError = structuredClone(templateDocument()) as Mutable;
    keyError.animations[4].keys[2].frame = 0;
    const result = parseDocument(JSON.stringify(keyError));
    expect(result.ok ? [] : result.errors[0]).toMatch(/^\$\.animations\[4\]\.keys\[2\]\.frame/);
    const duplicate = structuredClone(templateDocument()) as Mutable;
    duplicate.animations[1].name = duplicate.animations[0].name;
    const named = validateDocument(duplicate);
    expect(named.ok ? "" : named.errors.join("\n")).toMatch(/\$\.animations\[1\]\.name: duplicates animation/);
    expect(validateDocument({ ...templateDocument(), format: "riglab.rig" }).ok).toBe(false);
  });
});

describe("document helpers", () => {
  it("builds a one-second, rest-pose animation at the default rate", () => {
    const animation = blankAnimation(HUMANOID_RIG, "walk");
    expect([animation.fps, animation.length, animation.loop, animation.keys.length]).toEqual([14, 14, false, 1]);
    expect(animation.keys[0]).toEqual({ frame: 0, interpolation: "hold", pose: restPose(HUMANOID_RIG) });
    expect(restPose(HUMANOID_RIG).pelvis).toEqual({ x: 0, y: 0, rotation: 0 });
    expect(restPose(HUMANOID_RIG).head).toEqual({ rotation: 0 });
  });

  it("names copies uniquely within 64 characters", () => {
    expect(uniqueName("animation", [])).toBe("animation");
    expect(uniqueName("animation", ["animation", "animation-2"])).toBe("animation-3");
    const long = "a".repeat(64);
    const next = uniqueName(long, [long]);
    expect(next).toHaveLength(64);
    expect(next.endsWith("-2")).toBe(true);
  });
});
