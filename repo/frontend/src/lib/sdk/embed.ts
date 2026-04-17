import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SDKEmbedConfig, SDKStarData, StarMapSDK, SDKEventName, FeatureFilter, CardFeature, Unsubscribe, DrawingMode, DrawResult } from '$lib/types/sdk';
import type { Vec3 } from '$lib/types/starmap';
import { hexToRgb } from '$lib/utils/color';

export const KNOWN_LAYERS = ['stars', 'highlights', 'drawing'] as const;
export type KnownLayer = (typeof KNOWN_LAYERS)[number];

export function embed(element: HTMLElement, config: SDKEmbedConfig): StarMapSDK {
  return new StarMapSDKInstance(element, config);
}

class StarMapSDKInstance implements StarMapSDK {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls | null = null;
  private starMesh: THREE.InstancedMesh | null = null;
  private stars: SDKStarData[] = [];
  private handlers = new Map<SDKEventName, Set<(payload: unknown) => void>>();
  private animationId = 0;
  private disposed = false;
  private canvas: HTMLCanvasElement;

  // Real scene-layer groups. setLayerVisibility toggles group.visible, which
  // Three.js honors at render time — so calls produce visible side effects.
  private layerGroups = new Map<string, THREE.Group>();
  private layerVisibility = new Map<string, boolean>();

  // Drawing lifecycle state
  private drawingMode: DrawingMode | null = null;
  private drawPoints: Vec3[] = [];
  private drawObjects: THREE.Object3D[] = [];
  private drawingGround: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private onCanvasClick: (e: MouseEvent) => void;

  constructor(element: HTMLElement, config: SDKEmbedConfig) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    element.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(config.background ?? '#0a0a1e');

    const width = element.clientWidth;
    const height = element.clientHeight;
    this.renderer.setSize(width, height, false);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(0, 15, 30);

    if (config.controls !== false) {
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
    }

    const ambient = new THREE.AmbientLight('#ffffff', 0.5);
    this.scene.add(ambient);

    for (const id of KNOWN_LAYERS) {
      const g = new THREE.Group();
      g.name = `layer:${id}`;
      g.visible = true;
      this.scene.add(g);
      this.layerGroups.set(id, g);
      this.layerVisibility.set(id, true);
    }

    if (config.stars.length > 0) {
      this.updateStars(config.stars);
    }

    this.onCanvasClick = (e: MouseEvent) => {
      if (this.drawingMode) {
        const p = this.pickGroundPoint(e);
        if (p) {
          this.drawPoints.push(p);
          this.renderDrawingPreview();
        }
        return;
      }
      if (config.onStarClick) {
        const star = this.pickStar(e);
        if (star) config.onStarClick(star);
      }
      this.emit('starClick', this.pickStar(e));
    };
    this.canvas.addEventListener('click', this.onCanvasClick);

    this.animate();
  }

  private pickStar(event: MouseEvent): SDKStarData | null {
    if (!this.starMesh) return null;
    const rect = this.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    const intersects = raycaster.intersectObject(this.starMesh);
    if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
      return this.stars[intersects[0].instanceId] ?? null;
    }
    return null;
  }

  private pickGroundPoint(event: MouseEvent): Vec3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    const target = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(this.drawingGround, target);
    if (!hit) return null;
    return { x: target.x, y: target.y, z: target.z };
  }

  private clearDrawingObjects(): void {
    const group = this.layerGroups.get('drawing');
    if (!group) return;
    for (const obj of this.drawObjects) {
      group.remove(obj);
      const geo = (obj as THREE.Mesh).geometry;
      const mat = (obj as THREE.Mesh).material;
      geo?.dispose?.();
      if (Array.isArray(mat)) mat.forEach(m => m.dispose?.());
      else mat?.dispose?.();
    }
    this.drawObjects = [];
  }

  private renderDrawingPreview(): void {
    const group = this.layerGroups.get('drawing');
    if (!group) return;

    this.clearDrawingObjects();

    const pointGeo = new THREE.SphereGeometry(0.2, 8, 6);
    const pointMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (const p of this.drawPoints) {
      const m = new THREE.Mesh(pointGeo, pointMat);
      m.position.set(p.x, p.y, p.z);
      group.add(m);
      this.drawObjects.push(m);
    }

    if (this.drawingMode === 'line' && this.drawPoints.length >= 2) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(
        this.drawPoints.map(p => new THREE.Vector3(p.x, p.y, p.z))
      );
      const lineMat = new THREE.LineBasicMaterial({ color: 0x22d3ee });
      const line = new THREE.Line(lineGeo, lineMat);
      group.add(line);
      this.drawObjects.push(line);
    }

    if (this.drawingMode === 'polygon' && this.drawPoints.length >= 3) {
      const pts = this.drawPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
      pts.push(pts[0].clone());
      const polyGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const polyMat = new THREE.LineBasicMaterial({ color: 0xa3e635 });
      const line = new THREE.LineLoop(polyGeo, polyMat);
      group.add(line);
      this.drawObjects.push(line);
    }

    this.emit('drawProgress', { mode: this.drawingMode, points: [...this.drawPoints] });
  }

  private animate = () => {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(this.animate);
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
  };

  private emit(event: SDKEventName, payload: unknown) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const h of handlers) h(payload);
    }
  }

  private updateStars(stars: SDKStarData[]) {
    this.stars = stars;
    const starLayer = this.layerGroups.get('stars');
    if (!starLayer) return;
    if (this.starMesh) {
      starLayer.remove(this.starMesh);
      this.starMesh.dispose();
    }

    const geometry = new THREE.SphereGeometry(0.15, 8, 6);
    const material = new THREE.MeshStandardMaterial({ emissive: '#ffffff', emissiveIntensity: 0.3 });
    this.starMesh = new THREE.InstancedMesh(geometry, material, stars.length);

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const scale = (s.size ?? 1) * 0.5 + 0.5;
      matrix.makeScale(scale, scale, scale);
      matrix.setPosition(s.x, s.y, s.z);
      this.starMesh.setMatrixAt(i, matrix);
      const rgb = hexToRgb(s.color);
      color.setRGB(rgb.r, rgb.g, rgb.b);
      this.starMesh.setColorAt(i, color);
    }

    this.starMesh.instanceMatrix.needsUpdate = true;
    if (this.starMesh.instanceColor) this.starMesh.instanceColor.needsUpdate = true;
    starLayer.add(this.starMesh);
  }

  setLayerVisibility(layerId: string, visible: boolean): void {
    const group = this.layerGroups.get(layerId);
    if (!group) {
      this.layerVisibility.set(layerId, visible);
      this.emit('layerChange', { layerId, visible, known: false });
      return;
    }
    group.visible = visible;
    this.layerVisibility.set(layerId, visible);
    this.emit('layerChange', { layerId, visible, known: true });
  }

  getLayerVisibility(layerId: string): boolean {
    return this.layerVisibility.get(layerId) ?? true;
  }

  listLayers(): string[] {
    return Array.from(this.layerGroups.keys());
  }

  queryFeatures(filter: FeatureFilter): CardFeature[] {
    let result = this.stars;
    if (filter.ids) {
      const idSet = new Set(filter.ids);
      result = result.filter(s => idSet.has(s.id));
    }
    return result.map(s => ({
      id: s.id,
      position: { x: s.x, y: s.y, z: s.z },
      color: s.color,
      label: s.label,
    }));
  }

  highlightFeatures(ids: string[]): void {
    if (!this.starMesh) return;
    const idSet = new Set(ids);
    const color = new THREE.Color();
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const rgb = hexToRgb(s.color);
      if (idSet.has(s.id)) {
        color.setRGB(rgb.r, rgb.g, rgb.b);
      } else {
        color.setRGB(rgb.r * 0.15, rgb.g * 0.15, rgb.b * 0.15);
      }
      this.starMesh.setColorAt(i, color);
    }
    if (this.starMesh.instanceColor) this.starMesh.instanceColor.needsUpdate = true;
  }

  clearHighlights(): void {
    if (!this.starMesh) return;
    const color = new THREE.Color();
    for (let i = 0; i < this.stars.length; i++) {
      const rgb = hexToRgb(this.stars[i].color);
      color.setRGB(rgb.r, rgb.g, rgb.b);
      this.starMesh.setColorAt(i, color);
    }
    if (this.starMesh.instanceColor) this.starMesh.instanceColor.needsUpdate = true;
  }

  startDrawing(mode: DrawingMode): void {
    this.drawingMode = mode;
    this.drawPoints = [];
    this.clearDrawingObjects();
    this.emit('drawStart', { mode });
  }

  addDrawingPoint(point: Vec3): void {
    if (!this.drawingMode) return;
    this.drawPoints.push({ x: point.x, y: point.y, z: point.z });
    this.renderDrawingPreview();
  }

  stopDrawing(): DrawResult | null {
    if (!this.drawingMode) return null;
    const mode = this.drawingMode;
    const points = [...this.drawPoints];
    let measurement: { value: number; unit: string } | null = null;
    if (mode === 'line' && points.length >= 2) {
      measurement = { value: this.measureDistance(points).value, unit: 'units' };
    } else if (mode === 'polygon' && points.length >= 3) {
      measurement = { value: this.measureArea(points).value, unit: 'sq units' };
    }
    const result: DrawResult = { mode, points, measurement };
    this.emit('drawComplete', result);
    this.drawingMode = null;
    this.drawPoints = [];
    return result;
  }

  cancelDrawing(): void {
    if (!this.drawingMode) return;
    const mode = this.drawingMode;
    this.clearDrawingObjects();
    this.drawingMode = null;
    this.drawPoints = [];
    this.emit('drawCancelled', { mode });
  }

  getDrawingMode(): DrawingMode | null {
    return this.drawingMode;
  }

  getDrawingPoints(): Vec3[] {
    return [...this.drawPoints];
  }

  measureDistance(points: Vec3[]): { value: number; unit: string; points: Vec3[] } {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const dz = points[i].z - points[i - 1].z;
      total += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    const result = { value: total, unit: 'units', points };
    this.emit('measureComplete', { kind: 'distance', ...result });
    return result;
  }

  measureArea(points: Vec3[]): { value: number; unit: string; points: Vec3[] } {
    if (points.length < 3) return { value: 0, unit: 'sq units', points };
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].z;
      area -= points[j].x * points[i].z;
    }
    const result = { value: Math.abs(area) / 2, unit: 'sq units', points };
    this.emit('measureComplete', { kind: 'area', ...result });
    return result;
  }

  on(event: SDKEventName, handler: (payload: unknown) => void): Unsubscribe {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => { this.handlers.get(event)?.delete(handler); };
  }

  destroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationId);
    this.canvas.removeEventListener('click', this.onCanvasClick);
    this.clearDrawingObjects();
    this.controls?.dispose();
    this.starMesh?.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.handlers.clear();
    this.layerGroups.clear();
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as { NebulaForge: { embed: typeof embed } }).NebulaForge = { embed };
}
