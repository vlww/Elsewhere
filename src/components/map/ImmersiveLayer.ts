import * as THREE from "three";
import * as maplibregl from "maplibre-gl";
import type { CustomLayerInterface, CustomRenderMethodInput } from "maplibre-gl";
import type { PlaceCategory } from "@/types";

export interface ImmersivePoint {
  id: string;
  lat: number;
  lon: number;
  color: string;
  selected: boolean;
  isNew: boolean;
  /** Height of the building the gem floats over (0 = ground). */
  liftM: number;
  /** Taste Layer on and this place isn't highlighted: recede. */
  muted: boolean;
}

/** A Taste Layer highlight drawn as an art-directed building. */
/** A real neighbouring building tinted as part of a top match's radiating aura. */
export interface AuraBuildingInput {
  key: string;
  ring: [number, number][];
  heightM: number;
  color: string;
  distM: number;
  level: 1 | 2 | 3;
}

interface AuraItem {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  center: [number, number];
  distM: number;
  /** How much of the match's colour this ring carries. */
  k: number;
  bornAt: number;
  /** Set when the building leaves the aura: it fades out, then is disposed. */
  leaveAt?: number;
  dispose: () => void;
}

/** Ring strength: the next buildings out carry the colour, each ring beyond a little less. */
const AURA_K = { 1: 0.64, 2: 0.32, 3: 0.12 } as const;
const AURA_BASE = "#F6F1F1"; // matches BUILDING_3D_COLOR_MUTED's low-rise tone
/** Rings appear outward from the match: this much delay per metre. */
const AURA_STAGGER_MS_PER_M = 5;
const AURA_FADE_MS = 700;
/** A soft brightening travels outward from each match on this period, over this radius. */
const WAVE_PERIOD_MS = 4200;
const WAVE_REACH_M = 190;

/** A Taste Trail as the 3D city draws it: the routed path and its stops, in order. */
export interface TrailInput {
  /** Changes when the route itself changes (replays the draw-in). */
  key: string;
  path: [number, number][];
  /** Colour at each path vertex (route gradient). */
  colors: string[];
  stops: { lon: number; lat: number; color: string; selected: boolean }[];
}

interface TrailItem {
  key: string;
  group: THREE.Group;
  core: THREE.Mesh;
  glow: THREE.Mesh;
  comet: THREE.Mesh;
  cometHalo: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  beacons: { column: THREE.Mesh; ring: THREE.Mesh; mat: THREE.MeshBasicMaterial; ringMat: THREE.MeshBasicMaterial; selected: boolean }[];
  indexCount: number;
  glowIndexCount: number;
  center: [number, number];
  bornAt: number;
  dispose: () => void;
}

const TRAIL_LIFT_M = 3;
const TRAIL_DRAW_MS = 2200;
const COMET_PERIOD_MS = 9000;

/** Vertical fade for light columns: bright at the base, gone at the top. */
function columnTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface TasteBuilding {
  id: string;
  lat: number;
  lon: number;
  /** Real OSM outline; null draws a clearly illustrative pavilion at the coordinates instead. */
  ring: [number, number][] | null;
  heightM: number;
  color: string;
  deep: string;
  tier: "strong" | "notable";
  category: PlaceCategory;
  selected: boolean;
  hovered: boolean;
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

interface BuildingItem {
  group: THREE.Group;
  walls: THREE.MeshStandardMaterial;
  halo: THREE.Mesh;
  haloR: number;
  lights?: THREE.MeshStandardMaterial;
  center: [number, number];
  bornAt: number;
  phase: number;
  key: string;
  data: TasteBuilding;
  dispose: () => void;
}

function radialTexture(inner: string, outer: string, mid?: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  if (mid) grad.addColorStop(0.45, mid);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Facade: 4 bays × 4 floors of windows, tiled in metres along every wall. Second map lights some windows. */
const BAY_M = 3.4;
const FLOOR_M = 3.2;
function facadeTextures() {
  const S = 512, cell = S / 4;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    return [c, c.getContext("2d")!] as const;
  };
  const [cc, g] = mk();
  const [ec, e] = mk();
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, S, S);
  e.fillStyle = "#000000";
  e.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let fy = 0; fy < 4; fy++) {
    // Floor band and a faint string course.
    g.fillStyle = "rgba(110,80,105,0.10)";
    g.fillRect(0, fy * cell + cell - 10, S, 10);
    for (let bx = 0; bx < 4; bx++) {
      const x = bx * cell + cell * 0.27, y = fy * cell + cell * 0.2, w = cell * 0.46, h = cell * 0.56;
      g.fillStyle = "#8F86B4";
      g.fillRect(x, y, w, h);
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.fillRect(x + 4, y + 4, w * 0.35, h * 0.3); // reflection
      g.fillStyle = "#FFFFFF";
      g.fillRect(x + w / 2 - 2, y, 4, h); // mullion
      g.fillRect(x - 6, y + h, w + 12, 7); // sill
      if (rnd() < 0.62) {
        e.fillStyle = rnd() < 0.5 ? "#FFD49A" : "#FFC3A8";
        e.fillRect(x + 3, y + 3, w - 6, h - 6);
      }
    }
  }
  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / (4 * BAY_M), 1 / (4 * FLOOR_M));
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(cc), glow: tex(ec) };
}

const mix = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function inPoly(x: number, y: number, pts: THREE.Vector2[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const GARDEN: PlaceCategory[] = ["park", "garden", "tea", "community", "plaza"];
const DOME: PlaceCategory[] = ["museum", "library", "arts_centre", "cinema"];

/**
 * Three.js custom layer for Immersive mode. Two kinds of objects share one scene, placed at real
 * coordinates:
 *  - floating crystal markers over the top recommendations (scaled per frame to a constant screen size)
 *  - Taste Layer buildings: the real OSM footprint (when the basemap has one) rebuilt as a styled,
 *    pastel building with lit windows, cornice, awning and a rooftop feature, plus a halo and a long
 *    soft shadow. They're interpretations anchored to real places, not exact architecture.
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
  private buildings = new Map<string, BuildingItem>();
  private aura = new Map<string, AuraItem>();
  private origin = maplibregl.MercatorCoordinate.fromLngLat([0, 0], 0);
  private originScale = 1;
  private hasOrigin = false;
  private gemGeo = new THREE.OctahedronGeometry(1, 0);
  private beamGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 8, 1, true);
  private discGeo = new THREE.CircleGeometry(1, 40);
  private puffGeo = new THREE.IcosahedronGeometry(1, 0);
  private bulbGeo = new THREE.SphereGeometry(1, 8, 6);
  private shadowTex = radialTexture("rgba(48,38,56,0.38)", "rgba(48,38,56,0)");
  private longShadowTex = radialTexture("rgba(72,48,78,0.30)", "rgba(72,48,78,0)", "rgba(72,48,78,0.16)");
  private facade?: { map: THREE.Texture; glow: THREE.Texture };
  private haloTextures = new Map<string, THREE.Texture>();
  private sparkles?: THREE.Points;
  private animate: boolean;
  private trail?: TrailItem;
  private columnTex?: THREE.Texture;
  onError?: (e: unknown) => void;

  constructor(opts: { animate: boolean }) {
    this.animate = opts.animate;
    this.scene.add(new THREE.HemisphereLight(0xfff3ea, 0xd9c8e8, 1.7));
    // Matches the basemap light (azimuth 210°): late sun from the south-southwest.
    const sun = new THREE.DirectionalLight(0xffd2b0, 2.0);
    sun.position.set(-0.5, 0.75, 0.87);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xc9c2f2, 0.5);
    fill.position.set(0.6, 0.4, -0.7);
    this.scene.add(fill);
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
    for (const b of this.buildings.values()) b.dispose();
    for (const a of this.aura.values()) a.dispose();
    this.aura.clear();
    this.trail?.dispose();
    this.trail = undefined;
    this.columnTex?.dispose();
    this.buildings.clear();
    [this.gemGeo, this.beamGeo, this.discGeo, this.puffGeo, this.bulbGeo].forEach((g) => g.dispose());
    this.shadowTex.dispose();
    this.longShadowTex.dispose();
    this.facade?.map.dispose();
    this.facade?.glow.dispose();
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
      t = radialTexture(rgba(0.75), rgba(0), rgba(0.35));
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

  /** Local metres east/south of the shared origin. */
  private local(lon: number, lat: number) {
    const m = maplibregl.MercatorCoordinate.fromLngLat([lon, lat], 0);
    return new THREE.Vector3((m.x - this.origin.x) / this.originScale, 0, (m.y - this.origin.y) / this.originScale);
  }

  private setOrigin() {
    if (!this.map) return;
    this.origin = maplibregl.MercatorCoordinate.fromLngLat(this.map.getCenter(), 0);
    this.originScale = this.origin.meterInMercatorCoordinateUnits();
    this.hasOrigin = true;
    for (const it of this.items.values()) it.group.position.copy(this.local(it.data.lon, it.data.lat));
    for (const b of this.buildings.values()) b.group.position.copy(this.local(...b.center));
    for (const a of this.aura.values()) a.mesh.position.copy(this.local(...a.center));
    if (this.trail) this.trail.group.position.copy(this.local(...this.trail.center));
  }

  setPoints(points: ImmersivePoint[]) {
    if (!this.map) return;
    if (points.length) this.setOrigin();
    const keep = new Set(points.map((p) => p.id));
    for (const [id, it] of this.items)
      if (!keep.has(id)) {
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
      it.group.position.copy(this.local(p.lon, p.lat));
      (it.gem.material as THREE.MeshStandardMaterial).emissiveIntensity = p.selected ? 0.55 : p.muted ? 0.12 : 0.28;
    }
    this.updateSparkles();
    this.map.triggerRepaint();
  }

  setTasteBuildings(list: TasteBuilding[]) {
    if (!this.map) return;
    if (!this.hasOrigin) this.setOrigin();
    const keep = new Set(list.map((b) => b.id));
    for (const [id, b] of this.buildings)
      if (!keep.has(id)) {
        b.dispose();
        this.buildings.delete(id);
      }
    for (const b of list) {
      // Geometry only depends on shape and palette; selection/hover are animated in render().
      const key = `${b.ring ? b.ring.length + ":" + b.ring[0].join(",") : "pavilion"}|${b.heightM}|${b.color}|${b.tier}`;
      let item = this.buildings.get(b.id);
      if (item && item.key !== key) {
        item.dispose();
        this.buildings.delete(b.id);
        item = undefined;
      }
      if (!item) {
        item = this.buildBuilding(b, key);
        this.buildings.set(b.id, item);
      }
      item.data = b;
    }
    this.map.triggerRepaint();
  }

  private buildBuilding(b: TasteBuilding, key: string): BuildingItem {
    this.facade ??= facadeTextures();
    // Everything created here is disposed with the building.
    const owned: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(x: T) => (owned.push(x), x);

    // Footprint in local metres around its own centroid; shape (x, y) = (east, north).
    let ringLL = b.ring ? b.ring.slice(0, -1) : null;
    if (ringLL && ringLL.length < 3) ringLL = null;
    const center: [number, number] = ringLL
      ? [ringLL.reduce((s, p) => s + p[0], 0) / ringLL.length, ringLL.reduce((s, p) => s + p[1], 0) / ringLL.length]
      : [b.lon, b.lat];
    const cm = maplibregl.MercatorCoordinate.fromLngLat(center, 0);
    const ms = cm.meterInMercatorCoordinateUnits();
    const pts: THREE.Vector2[] = ringLL
      ? ringLL.map(([lon, lat]) => {
          const m = maplibregl.MercatorCoordinate.fromLngLat([lon, lat], 0);
          return new THREE.Vector2((m.x - cm.x) / ms, -(m.y - cm.y) / ms);
        })
      : [new THREE.Vector2(-8, -6), new THREE.Vector2(8, -6), new THREE.Vector2(8, 6), new THREE.Vector2(-8, 6)];
    const r = pts.reduce((s, p) => s + p.length(), 0) / pts.length || 8;
    const grow = (m: number) => new THREE.Shape(pts.map((p) => p.clone().multiplyScalar((r + m) / r)));
    const extrude = (shape: THREE.Shape, depth: number) => {
      const g = track(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }));
      g.rotateX(-Math.PI / 2); // extrusion → up; shape y (north) → −z
      return g;
    };

    const seed = hash(b.id);
    const strong = b.tier === "strong";
    const h = (b.ring ? Math.max(b.heightM, 7) : 12) + 0.6;
    // Strong matches get the full colour; notable ones a paler wash of it.
    const wallColor = mix(b.color, "#FFF6EF", strong ? 0.05 : 0.38);
    const group = new THREE.Group();

    const walls = track(
      new THREE.MeshStandardMaterial({
        color: wallColor,
        map: this.facade.map,
        emissive: 0xffffff,
        emissiveMap: this.facade.glow,
        emissiveIntensity: 0.5,
        roughness: 0.72,
        metalness: 0.02,
      }),
    );
    const roof = track(new THREE.MeshStandardMaterial({ color: mix(b.color, "#FFFFFF", 0.55), roughness: 0.9 }));
    const body = new THREE.Mesh(extrude(grow(0.7), h), [roof, walls]);
    group.add(body);

    // Cornice: a pale overhanging band at the roofline.
    const trim = track(new THREE.MeshStandardMaterial({ color: "#FFF4E8", roughness: 0.6 }));
    const cornice = new THREE.Mesh(extrude(grow(1.3), 0.7), trim);
    cornice.position.y = h - 0.35;
    group.add(cornice);

    // Awning band over the ground floor, in the deep accent.
    if (h > 8) {
      const awning = new THREE.Mesh(extrude(grow(1.6), 0.35), track(new THREE.MeshStandardMaterial({ color: mix(b.deep, b.color, 0.35), roughness: 0.8 })));
      awning.position.y = 3.3;
      group.add(awning);
    }

    // Rooftop feature, chosen by kind of place (and a stable per-place seed for variety).
    const roofTop = h + 0.35;
    let lights: THREE.MeshStandardMaterial | undefined;
    if (GARDEN.includes(b.category) || (!DOME.includes(b.category) && seed % 5 === 0)) {
      const bed = new THREE.Mesh(extrude(new THREE.Shape(pts.map((p) => p.clone().multiplyScalar(0.8))), 0.45), track(new THREE.MeshStandardMaterial({ color: "#BFD3A6", roughness: 1 })));
      bed.position.y = roofTop;
      group.add(bed);
      const leaf = [track(new THREE.MeshStandardMaterial({ color: "#A8C796", flatShading: true, roughness: 0.9 })), track(new THREE.MeshStandardMaterial({ color: "#C6D9A0", flatShading: true, roughness: 0.9 })), track(new THREE.MeshStandardMaterial({ color: "#F2B9C8", flatShading: true, roughness: 0.9 }))];
      const inner = pts.map((p) => p.clone().multiplyScalar(0.72));
      let placed = 0;
      let st = (seed % 2147483646) + 1;
      const rnd = () => (st = (st * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 60 && placed < Math.min(9, 3 + Math.round(r / 4)); i++) {
        const x = (rnd() * 2 - 1) * r, y = (rnd() * 2 - 1) * r;
        if (!inPoly(x, y, inner)) continue;
        const s = 0.8 + rnd() * 0.9;
        const puff = new THREE.Mesh(this.puffGeo, leaf[placed % 4 === 3 ? 2 : placed % 2]);
        puff.scale.set(s, s * 1.15, s);
        puff.position.set(x, roofTop + 0.45 + s, -y);
        group.add(puff);
        placed++;
      }
    } else if (DOME.includes(b.category)) {
      const rd = Math.min(r * 0.42, 9);
      const domeMat = track(new THREE.MeshStandardMaterial({ color: mix(b.color, "#FFFFFF", 0.25), roughness: 0.35, metalness: 0.15 }));
      const drum = new THREE.Mesh(track(new THREE.CylinderGeometry(rd * 0.92, rd * 0.92, rd * 0.35, 28)), trim);
      drum.position.y = roofTop + rd * 0.17;
      const dome = new THREE.Mesh(track(new THREE.SphereGeometry(rd, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)), domeMat);
      dome.position.y = roofTop + rd * 0.34;
      const gold = track(new THREE.MeshStandardMaterial({ color: "#F0D277", emissive: "#F0D277", emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.3 }));
      const spire = new THREE.Mesh(track(new THREE.ConeGeometry(rd * 0.08, rd * 0.6, 8)), gold);
      spire.position.y = roofTop + rd * 1.6;
      group.add(drum, dome, spire);
    } else {
      // A little timber water tower, the neighbourhood's rooftop vernacular.
      const wood = track(new THREE.MeshStandardMaterial({ color: "#C9A184", roughness: 0.95 }));
      const tr = Math.min(1.8, r * 0.2);
      const off = new THREE.Vector3(((seed % 3) - 1) * r * 0.25, 0, (((seed >> 3) % 3) - 1) * r * 0.25);
      const tank = new THREE.Mesh(track(new THREE.CylinderGeometry(tr, tr, tr * 1.7, 14)), wood);
      tank.position.set(off.x, roofTop + 1.8 + tr * 0.85, off.z);
      const cap = new THREE.Mesh(track(new THREE.ConeGeometry(tr * 1.1, tr * 0.9, 14)), track(new THREE.MeshStandardMaterial({ color: mix(b.deep, "#59465F", 0.3), roughness: 0.8 })));
      cap.position.set(off.x, roofTop + 1.8 + tr * 1.7 + tr * 0.45, off.z);
      group.add(tank, cap);
      const legGeo = track(new THREE.CylinderGeometry(0.1, 0.1, 1.8, 5));
      for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(legGeo, wood);
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        leg.position.set(off.x + Math.cos(a) * tr * 0.75, roofTop + 0.9, off.z + Math.sin(a) * tr * 0.75);
        group.add(leg);
      }
    }

    // Festoon lights along the roof edge on strong matches.
    if (strong) {
      lights = track(new THREE.MeshStandardMaterial({ color: "#FFF1C9", emissive: "#FFD98A", emissiveIntensity: 1.2 }));
      const edge = pts.map((p) => p.clone().multiplyScalar((r + 0.9) / r));
      const bulbs: THREE.Vector3[] = [];
      for (let i = 0; i < edge.length; i++) {
        const a = edge[i], c = edge[(i + 1) % edge.length];
        const n = Math.max(1, Math.round(a.distanceTo(c) / 2.4));
        for (let k = 0; k < n && bulbs.length < 160; k++) {
          const p = a.clone().lerp(c, k / n);
          bulbs.push(new THREE.Vector3(p.x, h + 0.75, -p.y));
        }
      }
      const inst = track(new THREE.InstancedMesh(this.bulbGeo, lights, bulbs.length));
      const m = new THREE.Matrix4();
      bulbs.forEach((p, i) => inst.setMatrixAt(i, m.makeScale(0.2, 0.2, 0.2).setPosition(p)));
      group.add(inst);
    }

    // Ground: a tinted halo and a long, soft late-afternoon shadow (away from the 210° sun).
    const haloR = r * 1.5 + 14;
    const halo = new THREE.Mesh(this.discGeo, track(new THREE.MeshBasicMaterial({ map: this.haloTex(b.color), transparent: true, depthWrite: false, opacity: strong ? 0.95 : 0.6 })));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.25;
    halo.scale.set(haloR, haloR, 1);
    const pivot = new THREE.Group();
    pivot.rotation.y = -Math.PI / 6;
    const longShadow = new THREE.Mesh(this.discGeo, track(new THREE.MeshBasicMaterial({ map: this.longShadowTex, transparent: true, depthWrite: false })));
    const len = r * 1.1 + h * 0.9;
    longShadow.rotation.x = -Math.PI / 2;
    longShadow.scale.set(r * 1.15, len, 1);
    longShadow.position.set(0, 0.3, -len * 0.55);
    pivot.add(longShadow);
    group.add(halo, pivot);

    group.position.copy(this.local(...center));
    group.scale.y = this.animate ? 0.001 : 1;
    this.scene.add(group);
    return {
      group,
      walls,
      halo,
      haloR,
      lights,
      center,
      bornAt: performance.now(),
      phase: (seed % 628) / 100,
      key,
      data: b,
      dispose: () => {
        this.scene.remove(group);
        owned.forEach((x) => x.dispose());
      },
    };
  }

  /** Lighter rendering for slower devices: no ambient animation (layers settle to their final state). */
  setAnimate(on: boolean) {
    this.animate = on;
    this.map?.triggerRepaint();
  }

  setTrail(t: TrailInput | null) {
    if (!this.map) return;
    if (!t || t.path.length < 2) {
      this.trail?.dispose();
      this.trail = undefined;
      this.map.triggerRepaint();
      return;
    }
    if (!this.hasOrigin) this.setOrigin();
    if (this.trail?.key !== t.key) {
      this.trail?.dispose();
      this.trail = this.buildTrail(t);
    }
    // Selection changes only restyle the beacons.
    t.stops.forEach((s, i) => {
      const b = this.trail!.beacons[i];
      if (b) b.selected = s.selected;
    });
    this.map.triggerRepaint();
  }

  private buildTrail(t: TrailInput): TrailItem {
    this.columnTex ??= columnTexture();
    const owned: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(x: T) => (owned.push(x), x);
    const center: [number, number] = t.path[Math.floor(t.path.length / 2)];
    const cm = maplibregl.MercatorCoordinate.fromLngLat(center, 0);
    const ms = cm.meterInMercatorCoordinateUnits();
    const toLocal = ([lon, lat]: [number, number], y: number) => {
      const m = maplibregl.MercatorCoordinate.fromLngLat([lon, lat], 0);
      return new THREE.Vector3((m.x - cm.x) / ms, y, (m.y - cm.y) / ms);
    };
    // Drop near-duplicate vertices so the curve doesn't kink.
    const pts: THREE.Vector3[] = [];
    const cols: string[] = [];
    t.path.forEach((p, i) => {
      const v = toLocal(p, TRAIL_LIFT_M);
      if (!pts.length || pts[pts.length - 1].distanceTo(v) > 1.5) {
        pts.push(v);
        cols.push(t.colors[i] ?? t.colors[t.colors.length - 1]);
      }
    });
    if (pts.length < 2) pts.push(pts[0].clone().add(new THREE.Vector3(0.5, 0, 0)));
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.1);
    const length = curve.getLength();
    const segs = Math.min(1600, Math.max(64, Math.round(length / 3)));

    // Colour along the tube from the per-vertex route gradient (by arc length).
    const lengths = [0];
    for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = lengths[lengths.length - 1] || 1;
    const colorAt = (u: number) => {
      const d = u * total;
      const k = lengths.findIndex((x) => x >= d);
      if (k <= 0) return new THREE.Color(cols[0]);
      const f = (d - lengths[k - 1]) / (lengths[k] - lengths[k - 1] || 1);
      return new THREE.Color(cols[k - 1]).lerp(new THREE.Color(cols[k]), f);
    };
    // The core runs a shade deeper than the pastel stops so it holds up against the pale city.
    const DEEPEN = new THREE.Color("#9A4C7E");
    const tube = (radius: number, radial: number, deepen: number) => {
      const g = track(new THREE.TubeGeometry(curve, segs, radius, radial, false));
      const colors = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i <= segs; i++) {
        const c = colorAt(i / segs).lerp(DEEPEN, deepen);
        for (let j = 0; j <= radial; j++) colors.set([c.r, c.g, c.b], (i * (radial + 1) + j) * 3);
      }
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      return g;
    };
    const coreGeo = tube(1.8, 8, 0.3);
    const glowGeo = tube(6, 10, 0);
    const core = new THREE.Mesh(coreGeo, track(new THREE.MeshBasicMaterial({ vertexColors: true })));
    const glow = new THREE.Mesh(
      glowGeo,
      track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending })),
    );
    const group = new THREE.Group();
    group.add(glow, core);

    // A small light that travels the route, so its direction reads at a glance.
    const comet = new THREE.Mesh(track(new THREE.SphereGeometry(2.6, 16, 10)), track(new THREE.MeshBasicMaterial({ color: 0xfff6e0 })));
    const cometHalo = new THREE.Mesh(
      this.discGeo,
      track(new THREE.MeshBasicMaterial({ map: this.haloTex("#FFF1C9"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })),
    );
    cometHalo.rotation.x = -Math.PI / 2;
    cometHalo.scale.set(16, 16, 1);
    group.add(comet, cometHalo);

    // Light columns over each stop.
    const columnGeo = track(new THREE.CylinderGeometry(3.2, 3.2, 1, 20, 1, true));
    columnGeo.translate(0, 0.5, 0);
    const beacons = t.stops.map((s) => {
      const mat = track(
        new THREE.MeshBasicMaterial({ color: s.color, map: this.columnTex!, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      const column = new THREE.Mesh(columnGeo, mat);
      const ringMat = track(new THREE.MeshBasicMaterial({ map: this.haloTex(s.color), transparent: true, depthWrite: false }));
      const ring = new THREE.Mesh(this.discGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      const at = toLocal([s.lon, s.lat], 0);
      column.position.copy(at);
      ring.position.copy(at).setY(0.4);
      group.add(column, ring);
      return { column, ring, mat, ringMat, selected: s.selected };
    });

    group.position.copy(this.local(...center));
    this.scene.add(group);
    const indexCount = coreGeo.index!.count;
    const glowIndexCount = glowGeo.index!.count;
    if (this.animate) {
      coreGeo.setDrawRange(0, 0);
      glowGeo.setDrawRange(0, 0);
    }
    return {
      key: t.key,
      group,
      core,
      glow,
      comet,
      cometHalo,
      curve,
      beacons,
      indexCount,
      glowIndexCount,
      center,
      bornAt: performance.now(),
      dispose: () => {
        this.scene.remove(group);
        owned.forEach((x) => x.dispose());
      },
    };
  }

  setAura(list: AuraBuildingInput[]) {
    if (!this.map) return;
    if (!this.hasOrigin) this.setOrigin();
    const keep = new Set(list.map((a) => `${a.key}|${a.color}|${a.level}`));
    const now = performance.now();
    for (const [id, a] of this.aura) {
      if (keep.has(id)) a.leaveAt = undefined;
      else if (!this.animate) {
        a.dispose();
        this.aura.delete(id);
      } else a.leaveAt ??= now + a.distM * 2; // outer rings linger a beat longer as it recedes
    }
    for (const a of list) {
      const id = `${a.key}|${a.color}|${a.level}`;
      if (this.aura.has(id)) continue;
      const pts = a.ring.slice(0, -1);
      const center: [number, number] = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
      const cm = maplibregl.MercatorCoordinate.fromLngLat(center, 0);
      const ms = cm.meterInMercatorCoordinateUnits();
      const local = pts.map(([lon, lat]) => {
        const m = maplibregl.MercatorCoordinate.fromLngLat([lon, lat], 0);
        return new THREE.Vector2((m.x - cm.x) / ms, -(m.y - cm.y) / ms);
      });
      const r = local.reduce((sum, p) => sum + p.length(), 0) / local.length || 5;
      // Slightly larger and taller than the basemap's own extrusion, so this coat sits just outside it.
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(local.map((p) => p.multiplyScalar((r + 0.35) / r))), { depth: a.heightM + 0.35, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const k = AURA_K[a.level];
      const mat = new THREE.MeshStandardMaterial({
        color: mix(AURA_BASE, a.color, k),
        emissive: new THREE.Color(a.color),
        emissiveIntensity: 0,
        roughness: 0.85,
        transparent: true,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(this.local(...center));
      this.scene.add(mesh);
      this.aura.set(id, {
        mesh,
        mat,
        center,
        distM: a.distM,
        k,
        bornAt: now + a.distM * AURA_STAGGER_MS_PER_M,
        dispose: () => {
          this.scene.remove(mesh);
          geo.dispose();
          mat.dispose();
        },
      });
    }
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
    this.sparkles.userData.anchor = sel;
    this.scene.add(this.sparkles);
  }

  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    if (!this.map || !this.renderer || (!this.items.size && !this.buildings.size && !this.aura.size && !this.trail)) return;
    const zoom = this.map.getZoom();
    const lat = this.map.getCenter().lat;
    // Metres per CSS pixel at this zoom (512px tiles).
    const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
    const now = performance.now();
    const t = now / 1000;

    for (const it of this.items.values()) {
      const sel = it.data.selected;
      const px = sel ? 22 : it.data.muted ? 11 : 15;
      const size = px * mpp;
      const born = it.bornAt ? Math.min(1, (now - it.bornAt) / 700) : 1;
      const ease = 1 - (1 - born) ** 3;
      const bob = this.animate ? Math.sin(t * 1.6 + it.phase) * 3 * mpp : 0;
      const lift = it.data.liftM;
      const height = (lift + (sel ? 96 : 72) * mpp) * ease;
      it.gem.scale.set(size * 0.75, size * 1.25, size * 0.75);
      it.gem.position.y = height + bob;
      it.gem.rotation.y = this.animate ? t * (sel ? 0.9 : 0.35) + it.phase : it.phase;
      it.beam.scale.set(size * 0.9, height, size * 0.9);
      it.beam.position.y = height / 2;
      const haloR = (sel ? 40 + (this.animate ? Math.sin(t * 2.2) * 5 : 0) : it.data.muted ? 14 : 24) * mpp;
      it.halo.scale.set(haloR, haloR, 1);
      it.halo.position.y = 0.3 * mpp;
      it.halo.visible = !lift; // a building's own halo takes over
      const shadow = it.group.getObjectByName("shadow")!;
      shadow.scale.set(size * 1.4, size * 1.4, 1);
      shadow.position.y = 0.2 * mpp;
      shadow.visible = !lift;
    }

    for (const b of this.buildings.values()) {
      const k = this.animate ? Math.min(1, (now - b.bornAt) / 1100) : 1;
      b.group.scale.y = Math.max(0.001, 1 - (1 - k) ** 3);
      const { selected, hovered, tier } = b.data;
      const target = selected ? 1.05 : hovered ? 0.85 : tier === "strong" ? 0.55 : 0.4;
      b.walls.emissiveIntensity = this.animate ? b.walls.emissiveIntensity + (target - b.walls.emissiveIntensity) * 0.15 : target;
      const pulse = this.animate && (selected || tier === "strong") ? 1 + Math.sin(t * 1.4 + b.phase) * 0.06 : 1;
      const r = b.haloR * (selected ? 1.35 : hovered ? 1.15 : 1) * pulse;
      b.halo.scale.set(r, r, 1);
      if (b.lights) b.lights.emissiveIntensity = this.animate ? 1 + Math.sin(t * 2 + b.phase) * 0.25 : 1.1;
    }

    // Aura: each ring fades in after the one inside it, then a soft light wave keeps travelling outward.
    const wave = ((now % WAVE_PERIOD_MS) / WAVE_PERIOD_MS) * (WAVE_REACH_M + 60) - 30;
    for (const [id, a] of this.aura) {
      const fadeIn = this.animate ? Math.min(1, Math.max(0, (now - a.bornAt) / AURA_FADE_MS)) : 1;
      const fadeOut = a.leaveAt ? Math.min(1, Math.max(0, (now - a.leaveAt) / AURA_FADE_MS)) : 0;
      if (fadeOut >= 1) {
        a.dispose();
        this.aura.delete(id);
        continue;
      }
      const fade = fadeIn * (1 - fadeOut);
      const eased = 1 - (1 - fade) ** 3;
      if (fade < 1) {
        if (!a.mat.transparent) {
          a.mat.transparent = true;
          a.mat.needsUpdate = true;
        }
        a.mat.opacity = eased;
      } else if (a.mat.transparent) {
        // Opaque once settled, so depth sorting can't make the coat flicker.
        a.mat.transparent = false;
        a.mat.opacity = 1;
        a.mat.needsUpdate = true;
      }
      const bump = this.animate ? Math.max(0, 1 - Math.abs(wave - a.distM) / 34) : 0;
      a.mat.emissiveIntensity = (0.08 + 0.42 * bump * bump) * a.k * eased * 1.6;
    }

    // Trail: draws itself in from the start, then a light keeps travelling along it.
    if (this.trail) {
      const tr = this.trail;
      const drawn = this.animate ? Math.min(1, (now - tr.bornAt) / TRAIL_DRAW_MS) : 1;
      const eased = 1 - (1 - drawn) ** 3;
      const snap = (n: number) => Math.floor((n * eased) / 6) * 6; // whole triangles
      (tr.core.geometry as THREE.BufferGeometry).setDrawRange(0, drawn >= 1 ? tr.indexCount : snap(tr.indexCount));
      (tr.glow.geometry as THREE.BufferGeometry).setDrawRange(0, drawn >= 1 ? tr.glowIndexCount : snap(tr.glowIndexCount));
      const u = drawn < 1 ? eased : ((now - tr.bornAt - TRAIL_DRAW_MS) % COMET_PERIOD_MS) / COMET_PERIOD_MS;
      const head = tr.curve.getPointAt(Math.min(0.999, Math.max(0, u)));
      tr.comet.position.copy(head);
      tr.cometHalo.position.copy(head).setY(0.6);
      tr.comet.visible = tr.cometHalo.visible = this.animate;
      const glowPulse = this.animate ? 0.42 + Math.sin(t * 1.3) * 0.08 : 0.45;
      (tr.glow.material as THREE.MeshBasicMaterial).opacity = glowPulse;
      tr.beacons.forEach((b, i) => {
        // Beacons rise as the route reaches them.
        const reach = Math.min(1, Math.max(0, (eased - i / Math.max(1, tr.beacons.length)) * 3));
        const h = (b.selected ? 120 : 70) * (this.animate ? reach : 1);
        b.column.scale.set(b.selected ? 1.4 : 1, Math.max(0.01, h), b.selected ? 1.4 : 1);
        b.mat.opacity = (b.selected ? 0.95 : 0.6) * (this.animate ? reach : 1);
        const r = (b.selected ? 26 : 16) * (this.animate && b.selected ? 1 + Math.sin(t * 2.4) * 0.08 : 1);
        b.ring.scale.set(r, r, 1);
        b.ringMat.opacity = b.selected ? 1 : 0.75;
      });
    }

    if (this.sparkles) {
      const a = this.sparkles.userData.anchor as Item;
      this.sparkles.position.copy(a.group.position);
      this.sparkles.position.y += a.data.liftM;
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
    const settling = (this.trail ? now - this.trail.bornAt < TRAIL_DRAW_MS + 50 : false) || [...this.buildings.values()].some((b) => now - b.bornAt < 1200) || [...this.aura.values()].some((a) => now - a.bornAt < AURA_FADE_MS || a.leaveAt !== undefined);
    if (this.animate || settling) this.map.triggerRepaint();
  }
}
