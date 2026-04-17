import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { StarNode, CameraState, LightingPreset } from '$lib/types/starmap';
import { hexToRgb } from '$lib/utils/color';

export type StarPickCallback = (star: StarNode | null) => void;
export type StarHoverCallback = (star: StarNode | null) => void;

const LIGHTING_PRESETS: Record<LightingPreset, { ambient: string; bg: string; fog: string }> = {
  'nebula': { ambient: '#1a1040', bg: '#0a0a1e', fog: '#0a0a1e' },
  'deep-space': { ambient: '#050510', bg: '#000005', fog: '#000005' },
  'aurora': { ambient: '#0a2020', bg: '#051515', fog: '#051515' },
  'twilight': { ambient: '#1a1030', bg: '#0d0815', fog: '#0d0815' },
  'cosmic-dawn': { ambient: '#201010', bg: '#100808', fog: '#100808' },
};

export interface StardustParticle {
  x: number;
  y: number;
  z: number;
  size: number;
  hue: number;
  twinkle: number;
}

export class SceneManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private starMesh: THREE.InstancedMesh | null = null;
  private stars: StarNode[] = [];
  private highlightedIds: Set<string> = new Set();
  private onPick: StarPickCallback | null = null;
  private onHover: StarHoverCallback | null = null;
  private animationId: number = 0;
  private disposed = false;
  private baseColors: Float32Array | null = null;
  private canvas: HTMLCanvasElement;
  private stardustPoints: THREE.Points | null = null;
  private stardustGeometry: THREE.BufferGeometry | null = null;
  private stardustMaterial: THREE.PointsMaterial | null = null;
  private stardustEnabled = false;
  private stardustTwinklePhase = 0;
  private stardustParticles: StardustParticle[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0a0a1e');

    this.camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 15, 30);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 200;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Ambient light
    const ambient = new THREE.AmbientLight('#1a1040', 0.5);
    this.scene.add(ambient);

    // Point light at center
    const point = new THREE.PointLight('#ffffff', 1, 100);
    point.position.set(0, 0, 0);
    this.scene.add(point);

    // Resize handling
    this.handleResize();
    window.addEventListener('resize', this.handleResize);

    // Click handling
    canvas.addEventListener('click', this.handleClick);
    canvas.addEventListener('mousemove', this.handleMouseMove);

    this.animate();
  }

  private handleResize = () => {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private handleClick = (event: MouseEvent) => {
    const star = this.pickStar(event);
    if (this.onPick) this.onPick(star);
  };

  private handleMouseMove = (event: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };

  private pickStar(event: MouseEvent): StarNode | null {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (!this.starMesh) return null;
    const intersects = this.raycaster.intersectObject(this.starMesh);
    if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
      return this.stars[intersects[0].instanceId] ?? null;
    }
    return null;
  }

  private animate = () => {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.updateStardustTwinkle();
    this.renderer.render(this.scene, this.camera);
  };

  private updateStardustTwinkle(): void {
    if (!this.stardustEnabled || !this.stardustMaterial) return;
    this.stardustTwinklePhase += 0.02;
    // Pulse the halo opacity so the "stardust" reward is visibly alive.
    const pulse = 0.55 + Math.sin(this.stardustTwinklePhase) * 0.2;
    this.stardustMaterial.opacity = pulse;
    this.stardustMaterial.needsUpdate = true;
  }

  updateStars(stars: StarNode[]): void {
    this.stars = stars;

    if (this.starMesh) {
      this.scene.remove(this.starMesh);
      this.starMesh.dispose();
    }

    if (stars.length === 0) return;

    const geometry = new THREE.SphereGeometry(0.15, 8, 6);
    const material = new THREE.MeshStandardMaterial({
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.3,
      metalness: 0.5,
      roughness: 0.5,
    });

    this.starMesh = new THREE.InstancedMesh(geometry, material, stars.length);
    this.baseColors = new Float32Array(stars.length * 3);

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      const scale = (star.size ?? 1) * 0.5 + 0.5;
      matrix.makeScale(scale, scale, scale);
      matrix.setPosition(star.position.x, star.position.y, star.position.z);
      this.starMesh.setMatrixAt(i, matrix);

      const rgb = hexToRgb(star.color);
      color.setRGB(rgb.r, rgb.g, rgb.b);
      this.starMesh.setColorAt(i, color);

      this.baseColors[i * 3] = rgb.r;
      this.baseColors[i * 3 + 1] = rgb.g;
      this.baseColors[i * 3 + 2] = rgb.b;
    }

    this.starMesh.instanceMatrix.needsUpdate = true;
    if (this.starMesh.instanceColor) this.starMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.starMesh);

    // Apply any existing highlights
    if (this.highlightedIds.size > 0) {
      this.applyHighlights();
    }
  }

  highlightStars(ids: string[]): void {
    this.highlightedIds = new Set(ids);
    this.applyHighlights();
  }

  clearHighlights(): void {
    this.highlightedIds.clear();
    this.applyHighlights();
  }

  private applyHighlights(): void {
    if (!this.starMesh || !this.baseColors) return;

    const color = new THREE.Color();
    const hasHighlights = this.highlightedIds.size > 0;

    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];
      const isHighlighted = this.highlightedIds.has(star.cardId);

      if (hasHighlights) {
        if (isHighlighted) {
          color.setRGB(
            this.baseColors[i * 3],
            this.baseColors[i * 3 + 1],
            this.baseColors[i * 3 + 2]
          );
        } else {
          // Dim non-highlighted
          color.setRGB(
            this.baseColors[i * 3] * 0.15,
            this.baseColors[i * 3 + 1] * 0.15,
            this.baseColors[i * 3 + 2] * 0.15
          );
        }
      } else {
        color.setRGB(
          this.baseColors[i * 3],
          this.baseColors[i * 3 + 1],
          this.baseColors[i * 3 + 2]
        );
      }

      this.starMesh.setColorAt(i, color);
    }

    if (this.starMesh.instanceColor) this.starMesh.instanceColor.needsUpdate = true;
  }

  /**
   * Enable or disable the stardust reward effect. When enabled, renders a
   * shimmering point-cloud halo around the star cloud and pulses opacity each
   * frame. Disabled when the streak reward has not been unlocked so the
   * star-map looks identical to an unrewarded state.
   */
  setStardustEnabled(enabled: boolean, particles?: StardustParticle[]): void {
    this.stardustEnabled = enabled;
    if (!enabled) {
      this.removeStardustFromScene();
      return;
    }
    if (particles && particles.length > 0) this.stardustParticles = particles;
    if (this.stardustParticles.length === 0) {
      this.stardustParticles = this.generateDefaultStardust();
    }
    this.rebuildStardustMesh();
  }

  /** Expose whether the stardust effect is currently visible in the render path. */
  isStardustEnabled(): boolean {
    return this.stardustEnabled && this.stardustPoints !== null;
  }

  private removeStardustFromScene(): void {
    if (this.stardustPoints) {
      this.scene.remove(this.stardustPoints);
      this.stardustPoints = null;
    }
    if (this.stardustGeometry) { this.stardustGeometry.dispose(); this.stardustGeometry = null; }
    if (this.stardustMaterial) { this.stardustMaterial.dispose(); this.stardustMaterial = null; }
  }

  private rebuildStardustMesh(): void {
    this.removeStardustFromScene();
    const particles = this.stardustParticles;
    const positions = new Float32Array(particles.length * 3);
    const colors = new Float32Array(particles.length * 3);
    const sizes = new Float32Array(particles.length);

    const color = new THREE.Color();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      color.setHSL(p.hue / 360, 0.85, 0.65 + (p.twinkle * 0.15));
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      sizes[i] = p.size;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.25,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.name = 'stardust-halo';
    this.stardustGeometry = geometry;
    this.stardustMaterial = material;
    this.stardustPoints = points;
    this.scene.add(points);
  }

  private generateDefaultStardust(): StardustParticle[] {
    // Deterministic fallback so the effect still shows even without a
    // worker-precomputed particle list (e.g. offline fresh load).
    let seed = 12345;
    const rand = () => { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 0) % 1_000_000) / 1_000_000; };
    const particles: StardustParticle[] = [];
    for (let i = 0; i < 400; i++) {
      particles.push({
        x: (rand() * 2 - 1) * 30,
        y: (rand() * 2 - 1) * 18,
        z: (rand() * 2 - 1) * 30,
        size: 0.05 + rand() * 0.2,
        hue: 40 + rand() * 30,
        twinkle: rand(),
      });
    }
    return particles;
  }

  setLighting(preset: LightingPreset): void {
    const config = LIGHTING_PRESETS[preset] ?? LIGHTING_PRESETS['nebula'];
    this.scene.background = new THREE.Color(config.bg);
  }

  getCameraState(): CameraState {
    return {
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      target: {
        x: this.controls.target.x,
        y: this.controls.target.y,
        z: this.controls.target.z,
      },
      zoom: this.camera.zoom,
    };
  }

  setCameraState(state: CameraState): void {
    this.camera.position.set(state.position.x, state.position.y, state.position.z);
    this.controls.target.set(state.target.x, state.target.y, state.target.z);
    this.camera.zoom = state.zoom;
    this.camera.updateProjectionMatrix();
  }

  onStarPick(callback: StarPickCallback): void {
    this.onPick = callback;
  }

  onStarHover(callback: StarHoverCallback): void {
    this.onHover = callback;
  }

  getStarCount(): number {
    return this.stars.length;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.controls.dispose();
    if (this.starMesh) {
      this.starMesh.dispose();
    }
    this.removeStardustFromScene();
    this.renderer.dispose();
  }
}
