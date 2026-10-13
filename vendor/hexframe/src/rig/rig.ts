import type { Rig, RigBone, RigContract } from "./types";

function fail(message: string): never {
  throw new Error(`rig: ${message}`);
}

/** Resolve the committed bone parent list into the small runtime tree used by presentation code. */
export function createRig(contract: RigContract): Rig {
  const children = new Map<string, string[]>();
  for (const bone of contract.bones) {
    if (children.has(bone.name)) fail(`duplicate bone '${bone.name}'`);
    children.set(bone.name, []);
  }

  for (const bone of contract.bones) {
    if (bone.parent === null) continue;
    const parent = children.get(bone.parent);
    if (!parent) fail(`'${bone.name}' hangs off unknown bone '${bone.parent}'`);
    parent.push(bone.name);
  }

  const roots = contract.bones.filter((bone) => bone.parent === null);
  if (roots.length !== 1 || roots[0]?.name !== contract.root) {
    fail(`root '${contract.root}' does not match the single parentless bone`);
  }

  const bones: RigBone[] = contract.bones.map((bone) => ({
    ...bone,
    children: children.get(bone.name) ?? [],
  }));
  const byName = new Map(bones.map((bone) => [bone.name, bone]));

  const seen = new Set<string>();
  const visit = (name: string): void => {
    if (seen.has(name)) fail(`bone tree reaches '${name}' more than once`);
    const bone = byName.get(name);
    if (!bone) fail(`bone tree references missing bone '${name}'`);
    seen.add(name);
    for (const child of bone.children) visit(child);
  };
  visit(contract.root);
  if (seen.size !== bones.length) fail("bone tree does not reach every bone");

  return { contract, root: contract.root, bones, byName };
}

export function hierarchyOrder(rig: Rig): readonly RigBone[] {
  const ordered: RigBone[] = [];
  const visit = (name: string): void => {
    const bone = rig.byName.get(name);
    if (!bone) fail(`bone tree references missing bone '${name}'`);
    ordered.push(bone);
    for (const child of bone.children) visit(child);
  };
  visit(rig.root);
  return ordered;
}
