import type { ArtPlacement } from "../hexframe/art";

/** Part art drawn under the skeleton, each part in its bone's or weapon body's frame. Path data and classes are parsed data. */
export function ArtLayer({ placements }: { readonly placements: readonly ArtPlacement[] }) {
  return (
    <g className="art" pointerEvents="none">
      {placements.map((item) => (
        <g key={`${item.part.set}:${item.bone}`} className={`art-set art-set--${item.part.set}`} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
          {item.part.paths.map((path, index) => <path key={index} className={path.className} d={path.d} />)}
        </g>
      ))}
    </g>
  );
}
