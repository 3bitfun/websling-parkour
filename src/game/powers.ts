import * as THREE from "three";
import type { Rarity } from "./dealers";
import { STREET_LINES, SIDEWALK, WORLD_SPAN } from "./world";

/** How a power behaves. Implemented once, reused by every power. */
export type PowerArchetype =
  | "burst" // radial AoE around the player
  | "projectile" // flying orb that explodes on contact / max range
  | "beam" // instant piercing ray forward
  | "dash" // forward dash damaging everything in its path
  | "blast" // huge delayed AoE (long cd)
  | "leap" // launch upward + forward
  | "jump" // extra air jump
  | "buff"; // temporary transformation / shield

export interface PowerMove {
  key: "Z" | "X" | "C" | "V";
  name: string;
  arch: PowerArchetype;
  dmg: number;
  radius: number;
  cd: number;
  freeze?: boolean;
  pull?: boolean;
  buffT?: number;
}

export interface PowerDef {
  id: string;
  name: string;
  rarity: Rarity;
  color: number;
  glow: number;
  moves: PowerMove[];
  desc: string;
}

/** The eight street powers — renamed for the Queens black market. */
export const POWERS: PowerDef[] = [
  {
    id: "inferno", name: "Inferno", rarity: "legendary", color: 0xff5c1f, glow: 0xffb347,
    desc: "Burn the block down, one combo at a time.",
    moves: [
      { key: "Z", name: "Flame Burst", arch: "burst", dmg: 40, radius: 6.5, cd: 3 },
      { key: "X", name: "Fireball", arch: "projectile", dmg: 55, radius: 4.5, cd: 2 },
      { key: "C", name: "Flame Dash", arch: "dash", dmg: 35, radius: 3, cd: 5 },
      { key: "V", name: "Flame Pillar", arch: "blast", dmg: 95, radius: 9, cd: 11 },
    ],
  },
  {
    id: "radiance", name: "Radiance", rarity: "legendary", color: 0xfff3b0, glow: 0xffffff,
    desc: "Outrun your own shadow.",
    moves: [
      { key: "Z", name: "Light Kick", arch: "dash", dmg: 45, radius: 3, cd: 2 },
      { key: "X", name: "Laser", arch: "beam", dmg: 60, radius: 2.2, cd: 3 },
      { key: "C", name: "Light Speed", arch: "dash", dmg: 35, radius: 3, cd: 4 },
      { key: "V", name: "Barrage", arch: "blast", dmg: 85, radius: 8, cd: 9 },
    ],
  },
  {
    id: "void", name: "Void", rarity: "legendary", color: 0x7a3cff, glow: 0xc084fc,
    desc: "The alley between streetlights hungers.",
    moves: [
      { key: "Z", name: "Black Hole", arch: "burst", dmg: 40, radius: 7, cd: 4, pull: true },
      { key: "X", name: "Dark Blade", arch: "projectile", dmg: 55, radius: 4, cd: 2 },
      { key: "C", name: "Shadow Step", arch: "dash", dmg: 30, radius: 3, cd: 4 },
      { key: "V", name: "Dark Vortex", arch: "blast", dmg: 100, radius: 9, cd: 11, pull: true },
    ],
  },
  {
    id: "colossus", name: "Colossus", rarity: "legendary", color: 0xffd700, glow: 0xfff3b0,
    desc: "Become the skyline.",
    moves: [
      { key: "Z", name: "Giant Punch", arch: "burst", dmg: 60, radius: 7, cd: 3 },
      { key: "X", name: "Shockwave", arch: "blast", dmg: 70, radius: 9, cd: 6 },
      { key: "C", name: "Ground Slam", arch: "dash", dmg: 45, radius: 4, cd: 5 },
      { key: "V", name: "Transform", arch: "buff", dmg: 0, radius: 0, cd: 20, buffT: 8 },
    ],
  },
  {
    id: "demolition", name: "Demolition", rarity: "epic", color: 0x33374a, glow: 0xff9d2e,
    desc: "Loud. Very, very loud.",
    moves: [
      { key: "Z", name: "Bomb Punch", arch: "burst", dmg: 50, radius: 5.5, cd: 3 },
      { key: "X", name: "Live Bomb", arch: "projectile", dmg: 75, radius: 5.5, cd: 2.5 },
      { key: "C", name: "Blast Dash", arch: "dash", dmg: 40, radius: 3.5, cd: 5 },
      { key: "V", name: "Mega Bomb", arch: "blast", dmg: 125, radius: 11, cd: 12 },
    ],
  },
  {
    id: "frostbite", name: "Frostbite", rarity: "rare", color: 0x9ff0ff, glow: 0xe6feff,
    desc: "Queens, but make it winter.",
    moves: [
      { key: "Z", name: "Ice Spikes", arch: "burst", dmg: 35, radius: 6.5, cd: 3, freeze: true },
      { key: "X", name: "Ice Shard", arch: "projectile", dmg: 45, radius: 4, cd: 2, freeze: true },
      { key: "C", name: "Ice Slide", arch: "dash", dmg: 25, radius: 3, cd: 5 },
      { key: "V", name: "Glacier", arch: "blast", dmg: 80, radius: 10, cd: 10, freeze: true },
    ],
  },
  {
    id: "haze", name: "Haze", rarity: "common", color: 0x9aa3c0, glow: 0xdfe5f5,
    desc: "Now you see me.",
    moves: [
      { key: "Z", name: "Smoke Fist", arch: "burst", dmg: 30, radius: 6, cd: 2.5 },
      { key: "X", name: "Smoke Grab", arch: "projectile", dmg: 40, radius: 4, cd: 2 },
      { key: "C", name: "Smoke Dash", arch: "dash", dmg: 20, radius: 3, cd: 4 },
      { key: "V", name: "Smoke Screen", arch: "buff", dmg: 0, radius: 0, cd: 12, buffT: 3 },
    ],
  },
  {
    id: "recoil", name: "Recoil", rarity: "common", color: 0x52ffa8, glow: 0xbaffdd,
    desc: "Boing. Boing. BOING.",
    moves: [
      { key: "Z", name: "Spring Snipe", arch: "dash", dmg: 35, radius: 3, cd: 2 },
      { key: "X", name: "Spring Leap", arch: "leap", dmg: 0, radius: 0, cd: 1.5 },
      { key: "C", name: "Spring Jump", arch: "jump", dmg: 0, radius: 0, cd: 3 },
      { key: "V", name: "Spin Kick", arch: "burst", dmg: 70, radius: 7, cd: 8 },
    ],
  },
];

const byId = new Map(POWERS.map((p) => [p.id, p]));
export const getPower = (id: string) => byId.get(id) ?? null;

interface PowerEntity {
  group: THREE.Group;
  body: THREE.Mesh;
  aura: THREE.Sprite;
  def: PowerDef | null;
  baseY: number;
  phase: number;
  respawn: number;
}

/** Wild powers that spawn around the city to be picked up for free. */
export class PowerSpawner {
  private scene: THREE.Scene;
  private powers: PowerEntity[] = [];
  private spots: THREE.Vector3[] = [];
  private geoBody = new THREE.SphereGeometry(0.55, 14, 12);
  private geoSwirl = new THREE.TorusGeometry(0.62, 0.09, 8, 22);
  private glowTex: THREE.Texture;

  constructor(scene: THREE.Scene, glowTex: THREE.Texture, count = 7) {
    this.scene = scene;
    this.glowTex = glowTex;
    this.buildSpots();
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(this.geoBody, new THREE.MeshToonMaterial({ color: 0xffffff }));
      const swirl = new THREE.Mesh(this.geoSwirl, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      swirl.rotation.x = Math.PI / 2;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), new THREE.MeshToonMaterial({ color: 0x6b4a2c }));
      stem.position.y = 0.6;
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.14), new THREE.MeshToonMaterial({ color: 0x52ffa8 }));
      leaf.position.set(0.14, 0.7, 0);
      const aura = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      aura.scale.setScalar(4);
      group.add(body, swirl, stem, leaf, aura);
      const spot = this.spots[i % this.spots.length];
      group.position.copy(spot);
      scene.add(group);
      const pe: PowerEntity = { group, body, aura, def: null, baseY: spot.y, phase: Math.random() * 9, respawn: 0 };
      this.roll(pe);
      this.powers.push(pe);
    }
  }

  private buildSpots() {
    const rnd = (() => {
      let s = 424242;
      return () => {
        s = (s * 1103515245 + 12345) >>> 0;
        return s / 4294967296;
      };
    })();
    for (let i = 0; i < 40; i++) {
      if (i % 5 === 0) {
        this.spots.push(new THREE.Vector3(224 + rnd() * 120, 1.1, 224 + rnd() * 120));
        continue;
      }
      const line = STREET_LINES[Math.floor(rnd() * STREET_LINES.length)];
      const along = (rnd() * 2 - 1) * (WORLD_SPAN + 40);
      const axisX = rnd() < 0.5;
      const off = (rnd() < 0.5 ? -1 : 1) * SIDEWALK;
      this.spots.push(axisX ? new THREE.Vector3(along, 1.1, line + off) : new THREE.Vector3(line + off, 1.1, along));
    }
    for (let i = this.spots.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [this.spots[i], this.spots[j]] = [this.spots[j], this.spots[i]];
    }
  }

  private roll(pe: PowerEntity) {
    const def = POWERS[Math.floor(Math.random() * POWERS.length)];
    pe.def = def;
    (pe.body.material as THREE.MeshToonMaterial).color.setHex(def.color);
    const swirl = pe.group.children[1] as THREE.Mesh;
    (swirl.material as THREE.MeshBasicMaterial).color.setHex(def.glow);
    (pe.aura.material as THREE.SpriteMaterial).color.setHex(def.glow);
    pe.group.visible = true;
    pe.respawn = 0;
  }

  update(dt: number, elapsed: number) {
    for (const pe of this.powers) {
      if (!pe.group.visible) {
        pe.respawn -= dt;
        if (pe.respawn <= 0) this.roll(pe);
        continue;
      }
      pe.group.position.y = pe.baseY + Math.sin(elapsed * 2.2 + pe.phase) * 0.35;
      pe.group.rotation.y += dt * 1.6;
      const auraMat = pe.aura.material as THREE.SpriteMaterial;
      auraMat.opacity = 0.4 + Math.sin(elapsed * 5 + pe.phase) * 0.15;
    }
  }

  /** Pick up the power within reach of `pos` (if any). */
  tryTake(pos: THREE.Vector3, radius: number): PowerDef | null {
    for (const pe of this.powers) {
      if (!pe.group.visible || !pe.def) continue;
      const dx = pe.group.position.x - pos.x;
      const dy = pe.group.position.y - pos.y;
      const dz = pe.group.position.z - pos.z;
      if (dx * dx + dy * dy + dz * dz < radius * radius) {
        const def = pe.def;
        pe.group.visible = false;
        pe.def = null;
        pe.respawn = 26 + Math.random() * 20;
        return def;
      }
    }
    return null;
  }

  /** Nearest visible power — for the HUD compass pip. */
  nearest(pos: THREE.Vector3): { def: PowerDef; dist: number; point: THREE.Vector3 } | null {
    let best: PowerEntity | null = null;
    let bestD = Infinity;
    for (const pe of this.powers) {
      if (!pe.group.visible || !pe.def) continue;
      const d = pe.group.position.distanceToSquared(pos);
      if (d < bestD) {
        bestD = d;
        best = pe;
      }
    }
    if (!best || !best.def) return null;
    return { def: best.def, dist: Math.sqrt(bestD), point: best.group.position };
  }

  reset() {
    for (const pe of this.powers) this.roll(pe);
  }

  dispose() {
    for (const pe of this.powers) {
      this.scene.remove(pe.group);
      pe.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) (m.material as THREE.Material).dispose();
      });
      (pe.aura.material as THREE.Material).dispose();
    }
    this.powers.length = 0;
  }
}
