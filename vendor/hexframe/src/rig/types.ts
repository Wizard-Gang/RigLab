export type Point = readonly [number, number];

export interface Bone {
  readonly name: string;
  readonly parent: string | null;
  readonly offset: Point;
  readonly tip: Point | null;
  readonly slot: string;
  readonly artHeight: number;
  readonly hand: string | null;
}

export interface Space {
  readonly units: string;
  readonly x: string;
  readonly y: string;
  readonly rotation: string;
  readonly height: number;
  readonly viewBox: readonly [number, number, number, number];
}

export type DepthSide = "far" | "near";

export interface DepthProfile {
  readonly underLowerBody: DepthSide | null;
  readonly behindTorso: DepthSide | null;
  readonly foreground: readonly DepthSide[];
  readonly head: "above-arms" | "below-arms";
}

export interface DepthSides {
  readonly arms: { readonly far: string; readonly near: string };
  readonly legs: { readonly far: string; readonly near: string };
}

export interface DepthProfiles {
  readonly profiles: Readonly<Record<string, DepthProfile>>;
  readonly sides: {
    readonly facingRight: DepthSides;
    readonly facingLeft: DepthSides;
  };
  readonly byClip: Readonly<Record<string, string>>;
  readonly default: string;
}

export interface RigContract {
  readonly space: Space;
  readonly root: string;
  readonly bones: readonly Bone[];
  readonly depthProfiles: DepthProfiles;
}

export interface RigBone extends Bone {
  readonly children: readonly string[];
}

export interface Rig {
  readonly contract: RigContract;
  readonly root: string;
  readonly bones: readonly RigBone[];
  readonly byName: ReadonlyMap<string, RigBone>;
}
