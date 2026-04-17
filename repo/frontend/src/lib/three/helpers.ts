import type { Vec3 } from '$lib/types/starmap';

export function hashStringToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  return hash;
}

export function tagToSphericalPosition(tag: string, radius: number = 20): Vec3 {
  const hash = hashStringToNumber(tag);
  const phi = ((hash & 0xffff) / 0xffff) * Math.PI;
  const theta = (((hash >> 16) & 0xffff) / 0xffff) * Math.PI * 2;

  return {
    x: radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.sin(phi) * Math.sin(theta),
    z: radius * Math.cos(phi),
  };
}

export function computeStarPosition(
  galaxyCenter: Vec3,
  orbitalDistance: number,
  index: number,
  total: number
): Vec3 {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const theta = goldenAngle * index;
  const phi = Math.acos(1 - (2 * (index + 0.5)) / Math.max(total, 1));

  return {
    x: galaxyCenter.x + orbitalDistance * Math.sin(phi) * Math.cos(theta),
    y: galaxyCenter.y + orbitalDistance * Math.sin(phi) * Math.sin(theta),
    z: galaxyCenter.z + orbitalDistance * Math.cos(phi),
  };
}

export function vec3Distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}
