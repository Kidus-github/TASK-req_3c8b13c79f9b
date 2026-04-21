import { describe, it, expect } from 'vitest';
import {
  hashStringToNumber,
  tagToSphericalPosition,
  computeStarPosition,
  vec3Distance,
  vec3Lerp,
} from '../../../src/lib/three/helpers';

describe('three helpers', () => {
  it('hashStringToNumber is deterministic for the same input', () => {
    expect(hashStringToNumber('starlight')).toBe(hashStringToNumber('starlight'));
    expect(hashStringToNumber('starlight')).not.toBe(hashStringToNumber('moonlight'));
  });

  it('tagToSphericalPosition places the point on the requested radius', () => {
    const pos = tagToSphericalPosition('aurora', 12);
    expect(vec3Distance(pos, { x: 0, y: 0, z: 0 })).toBeCloseTo(12, 6);
  });

  it('computeStarPosition offsets from the galaxy center by the orbital distance', () => {
    const center = { x: 5, y: -3, z: 8 };
    const pos = computeStarPosition(center, 7, 2, 10);
    expect(vec3Distance(pos, center)).toBeCloseTo(7, 6);
  });

  it('vec3Lerp interpolates each component independently', () => {
    expect(vec3Lerp({ x: 0, y: 10, z: -4 }, { x: 10, y: 20, z: 6 }, 0.25)).toEqual({
      x: 2.5,
      y: 12.5,
      z: -1.5,
    });
  });
});
