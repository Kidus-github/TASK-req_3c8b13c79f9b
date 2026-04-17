export interface StarNode {
  id: string;
  cardId: string;
  position: Vec3;
  color: string;
  size: number;
  galaxyId: string;
  label: string;
  mood: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Galaxy {
  id: string;
  tag: string;
  center: Vec3;
  color: string;
  cardCount: number;
}

export const MOOD_PALETTE: Record<number, string> = {
  1: '#3b82f6',
  2: '#22d3ee',
  3: '#a3e635',
  4: '#facc15',
  5: '#f97316',
};

export type LightingPreset = 'nebula' | 'deep-space' | 'aurora' | 'twilight' | 'cosmic-dawn';

export interface CameraState {
  position: Vec3;
  target: Vec3;
  zoom: number;
}

export interface MeasurementResult {
  value: number;
  unit: string;
  points: Vec3[];
}
