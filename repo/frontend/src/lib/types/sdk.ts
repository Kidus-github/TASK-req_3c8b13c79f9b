import type { Vec3 } from './starmap';

export interface SDKEmbedConfig {
  stars: SDKStarData[];
  background?: string;
  controls?: boolean;
  lighting?: string;
  /** Invoked only when a click lands on a star. Misses do not call this. */
  onStarClick?: (star: SDKStarData) => void;
}

export interface SDKStarData {
  id: string;
  x: number;
  y: number;
  z: number;
  color: string;
  label: string;
  size?: number;
}

/**
 * Events the embed runtime actually emits. Keep this list in lockstep with
 * the set of `emit(...)` call sites in `src/lib/sdk/embed.ts`. Advertising
 * events the runtime does not emit breaks the SDK contract for embedders.
 */
export type SDKEventName =
  | 'starClick'
  | 'drawStart'
  | 'drawProgress'
  | 'drawComplete'
  | 'drawCancelled'
  | 'measureComplete'
  | 'layerChange';

export const SDK_EVENT_NAMES: readonly SDKEventName[] = [
  'starClick',
  'drawStart',
  'drawProgress',
  'drawComplete',
  'drawCancelled',
  'measureComplete',
  'layerChange',
] as const;

export type Unsubscribe = () => void;

/**
 * The runtime currently only filters by id. The filter surface is kept narrow
 * on purpose so the docs/spec/types/runtime match exactly. Expanding this
 * requires implementing the corresponding runtime branch in `queryFeatures`.
 */
export interface FeatureFilter {
  ids?: string[];
}

export interface CardFeature {
  id: string;
  position: Vec3;
  color: string;
  label: string;
}

export type DrawingMode = 'point' | 'line' | 'polygon';

export interface DrawResult {
  mode: DrawingMode;
  points: Vec3[];
  measurement: { value: number; unit: string } | null;
}

export interface StarMapSDK {
  setLayerVisibility(layerId: string, visible: boolean): void;
  getLayerVisibility(layerId: string): boolean;
  listLayers(): string[];
  queryFeatures(filter: FeatureFilter): CardFeature[];
  highlightFeatures(ids: string[]): void;
  clearHighlights(): void;
  startDrawing(mode: DrawingMode): void;
  addDrawingPoint(point: Vec3): void;
  stopDrawing(): DrawResult | null;
  cancelDrawing(): void;
  getDrawingMode(): DrawingMode | null;
  getDrawingPoints(): Vec3[];
  measureDistance(points: Vec3[]): { value: number; unit: string; points: Vec3[] };
  measureArea(points: Vec3[]): { value: number; unit: string; points: Vec3[] };
  on(event: SDKEventName, handler: (payload: unknown) => void): Unsubscribe;
  destroy(): void;
}

export interface TabInstance {
  id: string;
  openedAt: number;
  lastHeartbeatAt: number;
  activeCardEditId: string | null;
  state: 'active' | 'idle' | 'closed';
}
