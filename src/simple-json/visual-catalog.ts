import { PROP_ANCHORS, PROP_CATALOG, type PropFn } from "../gcl/props";

export type VisualOrientation = "left" | "right" | "up" | "down";

export interface VisualAssetDefinition {
  id: string;
  draw: PropFn;
  bounds: { width: number; height: number };
  anchors: Record<string, [number, number]>;
  facing?: VisualOrientation;
}

const VISUAL_ASSETS: Record<string, Omit<VisualAssetDefinition, "id" | "draw" | "anchors">> = {
  "biology.ion-channel": { bounds: { width: 36, height: 28 } },
  "biology.neuron.cell": { bounds: { width: 124, height: 110 }, facing: "right" },
  "biology.neuron.full": { bounds: { width: 210, height: 110 }, facing: "right" },
  "nature.apple": { bounds: { width: 32, height: 38 } },
  "nature.tree": { bounds: { width: 60, height: 80 } },
  "physics.cannon": { bounds: { width: 70, height: 70 }, facing: "left" },
  "physics.planet": { bounds: { width: 64, height: 44 } },
  "symbols.arrow": { bounds: { width: 44, height: 20 }, facing: "right" },
  "symbols.star": { bounds: { width: 44, height: 44 } },
};

const CARDINAL_DEGREES: Record<VisualOrientation, number> = {
  right: 0,
  down: 90,
  left: 180,
  up: -90,
};

export function resolveVisualAsset(id: string): VisualAssetDefinition | undefined {
  const metadata = VISUAL_ASSETS[id];
  const draw = PROP_CATALOG[id];
  if (!metadata || !draw) return undefined;
  return {
    id,
    draw,
    bounds: { ...metadata.bounds },
    anchors: { ...(PROP_ANCHORS[id] ?? {}) },
    facing: metadata.facing,
  };
}

export function availableVisualAssets(): string[] {
  return Object.keys(VISUAL_ASSETS).sort();
}

export function visualAssetBounds(id: string): { width: number; height: number } | undefined {
  const asset = resolveVisualAsset(id);
  return asset ? { ...asset.bounds } : undefined;
}

export function visualAssetAnchorMap(id: string): Record<string, [number, number]> | undefined {
  const asset = resolveVisualAsset(id);
  if (!asset) return undefined;
  const { width, height } = asset.bounds;
  return {
    center: [0, 0],
    top: [0, -height / 2],
    bottom: [0, height / 2],
    left: [-width / 2, 0],
    right: [width / 2, 0],
    ...asset.anchors,
  };
}

export function visualAssetAnchors(id: string): string[] | undefined {
  const anchors = visualAssetAnchorMap(id);
  return anchors ? Object.keys(anchors) : undefined;
}

export function visualOrientationAngle(id: string, requested?: VisualOrientation): number {
  if (!requested) return 0;
  const authoredFacing = resolveVisualAsset(id)?.facing ?? "right";
  return CARDINAL_DEGREES[requested] - CARDINAL_DEGREES[authoredFacing];
}
