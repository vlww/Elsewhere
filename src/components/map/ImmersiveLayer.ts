import * as THREE from "three";
import * as maplibregl from "maplibre-gl";
import type { CustomLayerInterface, CustomRenderMethodInput } from "maplibre-gl";

export interface ImmersivePoint {
  id: string;
  lat: number;
  lon: number;
  color: string;
  selected: boolean;
  isNew: boolean;
}

interface Item {
  group: THREE.Group;
  gem: THREE.Mesh;
  beam: THREE.Mesh;
  halo: THREE.Mesh;
  bornAt: number;
  phase: number;
  data: ImmersivePoint;
}

function radialTexture(inner: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Three.js custom layer for Immersive mode: floating crystal markers over each recommendation,
 * a light column to the ground, a soft contact shadow and a tinted halo. Objects are placed at real
 * coordinates and scaled per frame so they keep a constant on-screen size at any zoom.
 */
export class ImmersiveLayer implements CustomLayerInterface {
  id = "es-immersive";
  type = "custom" as const;
  renderingMode = "3d" as const;

  private map?: maplibregl.Map;
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private items = new Map<string, Item>();
  private origin = maplibregl.MercatorCoordinate.fromLngLat([0, 0], 0);
  private originScale = 1;
  private gemGeo = new THREE.OctahedronGeometry(1, 0);
  private beamGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 8, 1, true);
  private discGeo = new THREE.CircleGeometry(1, 40);
  private shadowTex = radialTexture("rgba(48,38,56,0.38)", "rgba(48,38,56,0)");
  private haloTextures = new Map<string, THREE.Texture>();
  private sparkles?: THREE.Points;
  private animate: boolean;
  onError?: (e: unknown) => void;

  constructor(opts: { animate: boolean }) {
    this.animate = opts.animate;
    this.scene.add(new THREE.HemisphereLight(0xfff3ea, 0xd9c8e8, 1.6));
    const sun = new THREE.DirectionalLight(0xffd9bd, 1.8);
    sun.position.set(-0.6, 1, 0.4);
    this.scene.add(sun);
  }

  onAdd(map: maplibregl.Map, gl: WebGL2RenderingContext) {
    this.map = map;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
    } catch (e) {
      this.onError?.(e);
    }
  }

  onRemove() {
    for (const it of this.items.values()) this.disposeItem(it);
    this.items.clear();
    this.gemGeo.dispose();
    this.beamGeo.dispose();
    this.discGeo.dispose();
    this.shadowTex.dispose();
    this.haloTextures.forEach((t) => t.dispose());
    this.sparkles?.geometry.dispose();
    (this.sparkles?.material as THREE.Material | undefined)?.dispose();
    // The GL context belongs to MapLibre; only release three's internal state.
    this.renderer?.dispose();
    this.renderer = undefined;
  }

  private haloTex(color: string) {
    let t = this.haloTextures.get(color);
    if (!t) {
      const c = new THREE.Color(color);
      const rgba = (a: number) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
      t = radialTexture(rgba(0.75), rgba(0));
      this.haloTextures.set(color, t);
    }
    return t;
  }

  private disposeItem(it: Item) {
    this.scene.remove(it.group);
    it.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      m?.dispose();
    });
  }

  setPoints(points: ImmersivePoint[]) {
    if (!this.map) return;
    if (points.length) {
      const c = this.map.getCenter();
      this.origin = maplibregl.MercatorCoordinate.fromLngLat(c, 0);
      this.originScale = this.origin.meterInMercatorCoordinateUnits();
    }
    const keep = new Set(points.map((p) => p.id));
    for (const [id, it] of this.items) if (!keep.has(id)) {
      this.disposeItem(it);
      this.items.delete(id);
    }
    for (const p of points) {
      let it = this.items.get(p.id);
      if (!it) {
        const group = new THREE.Group();
        const gem = new THREE.Mesh(
          this.gemGeo,
          new THREE.MeshStandardMaterial({ color: p.color, emissive: p.color, emissiveIntensity: 0.28, roughness: 0.32, metalness: 0.08, flatShading: true }),
        );
        const beam = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
        const shadow = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.name = "shadow";
        const halo = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ map: this.haloTex(p.color), transparent: true, depthWrite: false }));
        halo.rotation.x = -Math.PI / 2;
        group.add(shadow, halo, beam, gem);
        this.scene.add(group);
        it = { group, gem, beam, halo, bornAt: p.isNew ? performance.now() : 0, phase: Math.random() * Math.PI * 2, data: p };
        this.items.set(p.id, it);
      }
      it.data = p;
      const m = maplibregl.MercatorCoordinate.fromLngLat([p.lon, p.lat], 0);
      it.group.position.set((m.x - this.origin.x) / this.originScale, 0, (m.y - this.origin.y) / this.originScale);
      (it.gem.material as THREE.MeshStandardMaterial).emissiveIntensity = p.selected ? 0.55 : 0.28;
    }
    this.updateSparkles();
    this.map.triggerRepaint();
  }

  private updateSparkles() {
    if (this.sparkles) {
      this.scene.remove(this.sparkles);
      this.sparkles.geometry.dispose();
      (this.sparkles.material as THREE.Material).dispose();
      this.sparkles = undefined;
    }
    const sel = [...this.items.values()].find((i) => i.data.selected);
    if (!sel || !this.animate) return;
    const n = 26;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pos.set([Math.cos(a) * (0.6 + Math.random() * 0.8), 0.2 + Math.random() * 1.6, Math.sin(a) * (0.6 + Math.random() * 0.8)], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.sparkles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff1c9, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false }));
    this.sparkles.userData.anchor = sel.group;
    this.scene.add(this.sparkles);
  }

  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    if (!this.map || !this.renderer || !this.items.size) return;
    const zoom = this.map.getZoom();
    const lat = this.map.getCenter().lat;
    // Metres per CSS pixel at this zoom (512px tiles).
    const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
    const t = performance.now() / 1000;

    for (const it of this.items.values()) {
      const sel = it.data.selected;
      const px = sel ? 22 : 15;
      const size = px * mpp;
      const born = it.bornAt ? Math.min(1, (performance.now() - it.bornAt) / 700) : 1;
      const ease = 1 - (1 - born) ** 3;
      const bob = this.animate ? Math.sin(t * 1.6 + it.phase) * 3 * mpp : 0;
      const height = (sel ? 96 : 72) * mpp * ease;
      it.gem.scale.set(size * 0.75, size * 1.25, size * 0.75);
      it.gem.position.y = height + bob;
      it.gem.rotation.y = this.animate ? t * (sel ? 0.9 : 0.35) + it.phase : it.phase;
      it.beam.scale.set(size * 0.9, height, size * 0.9);
      it.beam.position.y = height / 2;
      const haloR = (sel ? 40 + (this.animate ? Math.sin(t * 2.2) * 5 : 0) : 24) * mpp;
      it.halo.scale.set(haloR, haloR, 1);
      it.halo.position.y = 0.3 * mpp;
      const shadow = it.group.getObjectByName("shadow")!;
      shadow.scale.set(size * 1.4, size * 1.4, 1);
      shadow.position.y = 0.2 * mpp;
    }
    if (this.sparkles) {
      const a = this.sparkles.userData.anchor as THREE.Group;
      this.sparkles.position.copy(a.position);
      this.sparkles.scale.setScalar(26 * mpp);
      this.sparkles.rotation.y = t * 0.25;
    }

    const s = this.originScale;
    const l = new THREE.Matrix4()
      .makeTranslation(this.origin.x, this.origin.y, this.origin.z)
      .scale(new THREE.Vector3(s, -s, s))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(Array.from(args.defaultProjectionData.mainMatrix as ArrayLike<number>)).multiply(l);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    if (this.animate) this.map.triggerRepaint();
  }
}
