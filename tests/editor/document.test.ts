import { describe, expect, it } from "vitest";
import { CHIBI_RIG } from "../../src/chibi/chibi";
import { ANIMATION_KINDS, KINDS, keyFrames, validateAnimation } from "../../src/format";
import { parseDocument, serializeDocument, validateDocument } from "../../src/format/document";
import type { RigLabDocument } from "../../src/format/document";
import { blankAnimation, restPose, uniqueName } from "../../src/editor/animations";
import { templateDocument } from "../../src/editor/templates";

type Mutable = Record<string, any>;

/** The chibi with one blank animation of each kind. */
const moves = (): RigLabDocument => ({ ...templateDocument(), animations: ANIMATION_KINDS.map((kind) => blankAnimation(CHIBI_RIG, kind, kind)) });

describe("riglab.document", () => {
  it("starts new documents from the chibi, with no animations", () => {
    const document = templateDocument();
    expect(validateDocument(document).ok).toBe(true);
    expect([document.rig.name, document.animations]).toEqual(["chibi", []]);
  });

  it("reopens a saved document deep-equal", () => {
    const document = moves();
    const text = serializeDocument(document);
    expect(text.endsWith("\n")).toBe(true);
    const reopened = parseDocument(text);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.value).toEqual(document);
  });

  it("refuses invalid files with the first failing path", () => {
    expect(parseDocument("{ not json")).toEqual({ ok: false, errors: [expect.stringMatching(/^\$: is not valid JSON/)] });
    const broken = structuredClone(moves()) as Mutable;
    broken.rig.bones[2].offset = [0];
    const rigError = parseDocument(JSON.stringify(broken));
    expect(rigError.ok ? [] : rigError.errors[0]).toMatch(/^\$\.rig\.bones\[2\]\.offset/);
    const keyError = structuredClone(moves()) as Mutable;
    keyError.animations[3].keys[2].frame = 15;
    const result = parseDocument(JSON.stringify(keyError));
    expect(result.ok ? [] : result.errors[0]).toBe("$.animations[3].keys[2].frame: must be 16: attack keys sit at frames 0, 8, 16 and 24");
    const drifted = structuredClone(moves()) as Mutable;
    drifted.animations[0].fps = 14;
    const rate = parseDocument(JSON.stringify(drifted));
    expect(rate.ok ? [] : rate.errors[0]).toBe("$.animations[0].fps: must be 60, Hexframe's clock");
    const duplicate = structuredClone(moves()) as Mutable;
    duplicate.animations[1].name = duplicate.animations[0].name;
    const named = validateDocument(duplicate);
    expect(named.ok ? "" : named.errors.join("\n")).toMatch(/\$\.animations\[1\]\.name: duplicates animation/);
    expect(validateDocument({ ...templateDocument(), format: "riglab.rig" }).ok).toBe(false);
  });
});

describe("document helpers", () => {
  it("starts each kind with its rest-pose keys, easing in and out, on Hexframe's clock", () => {
    for (const kind of ANIMATION_KINDS) {
      const animation = blankAnimation(CHIBI_RIG, "moves", kind);
      expect([animation.kind, animation.fps, animation.length, animation.loop]).toEqual([kind, 60, KINDS[kind].length, KINDS[kind].loop]);
      expect(animation.keys.map((key) => key.frame)).toEqual(keyFrames(kind));
      for (const key of animation.keys) expect(key).toEqual({ frame: key.frame, interpolation: "smoothstep", pose: restPose(CHIBI_RIG) });
      expect(validateAnimation(animation, CHIBI_RIG).ok).toBe(true);
    }
    expect(restPose(CHIBI_RIG).pelvis).toEqual({ x: 0, y: 0, rotation: 0 });
    expect(restPose(CHIBI_RIG).head).toEqual({ rotation: 0 });
  });

  it("names copies uniquely within 64 characters", () => {
    expect(uniqueName("idle", [])).toBe("idle");
    expect(uniqueName("idle", ["idle", "idle-2"])).toBe("idle-3");
    const long = "a".repeat(64);
    const next = uniqueName(long, [long]);
    expect(next).toHaveLength(64);
    expect(next.endsWith("-2")).toBe(true);
  });
});
