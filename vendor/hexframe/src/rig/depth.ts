import type { Rig } from "./types";

export function depthProfileName(rig: Rig, clip: string, origin: string | null = clip): string {
  const profiles = rig.contract.depthProfiles;
  return profiles.byClip[clip] ?? (origin === null ? profiles.default : profiles.byClip[origin] ?? profiles.default);
}
