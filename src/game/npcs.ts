import * as THREE from "three";
import type { City } from "./world";
import { SIDEWALK, STREET_LINES } from "./world";
import { buildR6Rig, civStyle, thugStyle, type Rig } from "./rig";
import type { Sfx } from "./audio";

export interface PunchEvent {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  dmg: number;
  range: number;
  heavy: boolean;
}

export interface CrowdApi {
  active: boolean;
  playerPos: THREE.Vector3;
  invuln: boolean;
  elapsed: number;
  punches: PunchEvent[];
  damagePlayer(n: number, from: THREE.Vector3): void;
  onPunchHit(heavy: boolean, pos: THREE.Vector3): void;
  onThugKilled(pos: THREE.Vector3): void;
  particles: { burst(p: THREE.Vector3, n: number, colors: string[], speed?: number, life?: number, size?: number): void };
  sfx: Sfx;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Civ {
  rig: Rig;
  axisX: boolean;
  line: number;
  side: number;
  along: number;
  target: number;
  speed: number;
  pause: number;
  phase: number;
}

interface Thug {
  rig: Rig;
  spawn: THREE.Vector3;
  hp: number;
  dead: boolean;
  respawnT: number;
  flash: number;
  stagger: number;
  windup: number;
  lungeT: number;
  lungeDir: THREE.Vector3;
  attackCd: number;
  rockCd: number;
  patrolT: THREE.Vector3;
  kb: THREE.Vector3;
  phase: number;
  webT: number;
  cocoon: THREE.Mesh;
}

interface Rock {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  active: boolean;
  life: number;
}

const CIV_COUNT = 46;
const THUG_COUNT = 18;
const THUG_HP = 100;

export class Crowd {
  private scene: THREE.Scene;
  private city: City;
  private civs: Civ[] = [];
  private thugs: Thug[] = [];
  private rocks: Rock[] = [];
  private thugSpawns: THREE.Vector3[] = [];
  private geoRock = new THREE.SphereGeometry(0.34, 8, 8);
  private matRock = new THREE.MeshToonMaterial({ color: 0x8d93a8 });
  private geoCocoon = new THREE.IcosahedronGeometry(1.25, 1);
  private matCocoon = new THREE.MeshBasicMaterial({
    color: 0xf2fbff,
    transparent: true,
    opacity: 0.42,
    wireframe: false,
    depthWrite: false,
  });
  private disposed = false;

  constructor(scene: THREE.Scene, city: City) {
    this.scene = scene;
    this.city = city;
    const rnd = mulberry(8118);

    // ---- civilians ----
    for (let i = 0; i < CIV_COUNT; i++) {
      const rig = buildR6Rig(civStyle(rnd));
      const scale = 0.82 + rnd() * 0.22;
      rig.group.scale.setScalar(scale);
      const axisX = rnd() < 0.5;
      const line = STREET_LINES[Math.floor(rnd() * STREET_LINES.length)];
      const side = rnd() < 0.5 ? -1 : 1;
      const along = (rnd() * 2 - 1) * 240;
      const civ: Civ = {
        rig,
        axisX,
        line,
        side,
        along,
        target: (rnd() * 2 - 1) * 240,
        speed: 1.1 + rnd() * 1.5,
        pause: rnd() * 3,
        phase: rnd() * 6,
      };
      this.placeCiv(civ);
      scene.add(rig.group);
      this.civs.push(civ);
    }

    // ---- thug spawn points: street corners + low rooftops ----
    const cornerPool: THREE.Vector3[] = [];
    for (const sx of STREET_LINES) {
      for (const sz of STREET_LINES) {
        cornerPool.push(new THREE.Vector3(sx + SIDEWALK, 0, sz + SIDEWALK));
        cornerPool.push(new THREE.Vector3(sx - SIDEWALK, 0, sz - SIDEWALK));
      }
    }
    const roofPool = city.boxes.filter((b) => b.top < 58).map((b) => new THREE.Vector3(b.cx, b.top, b.cz));
    for (let i = 0; i < THUG_COUNT; i++) {
      const useRoof = i % 3 === 0 && roofPool.length > 0;
      const pool = useRoof ? roofPool : cornerPool;
      this.thugSpawns.push(pool[Math.floor(rnd() * pool.length)].clone());
    }

    for (let i = 0; i < THUG_COUNT; i++) {
      const rig = buildR6Rig(thugStyle());
      rig.group.scale.setScalar(1.06);
      const cocoon = new THREE.Mesh(this.geoCocoon, this.matCocoon);
      cocoon.position.y = 1.1;
      cocoon.visible = false;
      rig.group.add(cocoon);
      const t: Thug = {
        rig,
        spawn: this.thugSpawns[i],
        hp: THUG_HP,
        dead: false,
        respawnT: 0,
        flash: 0,
        stagger: 0,
        windup: 0,
        lungeT: 0,
        lungeDir: new THREE.Vector3(),
        attackCd: 1 + rnd() * 2,
        rockCd: 2 + rnd() * 3,
        patrolT: this.thugSpawns[i].clone(),
        kb: new THREE.Vector3(),
        phase: rnd() * 6,
        webT: 0,
        cocoon,
      };
      rig.group.position.copy(t.spawn);
      scene.add(rig.group);
      this.thugs.push(t);
    }

    // ---- rock pool ----
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(this.geoRock, this.matRock);
      mesh.visible = false;
      scene.add(mesh);
      this.rocks.push({ mesh, vel: new THREE.Vector3(), active: false, life: 0 });
    }
  }

  private placeCiv(c: Civ) {
    if (c.axisX) c.rig.group.position.set(c.along, 0, c.line + c.side * SIDEWALK);
    else c.rig.group.position.set(c.line + c.side * SIDEWALK, 0, c.along);
  }

  reset() {
    for (const t of this.thugs) {
      t.hp = THUG_HP;
      t.dead = false;
      t.respawnT = 0;
      t.flash = 0;
      t.stagger = 0;
      t.windup = 0;
      t.lungeT = 0;
      t.attackCd = 1.5;
      t.rockCd = 3;
      t.kb.set(0, 0, 0);
      t.webT = 0;
      t.cocoon.visible = false;
      t.rig.group.position.copy(t.spawn);
      t.rig.group.visible = true;
      t.rig.group.scale.setScalar(1.06);
    }
    for (const r of this.rocks) {
      r.active = false;
      r.mesh.visible = false;
    }
  }

  /** Stick the nearest thug to the point in a web cocoon. Returns true on hit. */
  webAt(x: number, y: number, z: number): boolean {
    let best: Thug | null = null;
    let bestD = 2.9 * 2.9;
    for (const t of this.thugs) {
      if (t.dead || t.webT > 0) continue;
      const tp = t.rig.group.position;
      const dx = tp.x - x;
      const dy = tp.y + 1.1 - y;
      const dz = tp.z - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best) return false;
    best.webT = 5;
    best.windup = 0;
    best.lungeT = 0;
    best.stagger = 0;
    best.cocoon.visible = true;
    return true;
  }

  private groundAt(x: number, z: number): number {
    let g = 0;
    for (const b of this.city.boxes) {
      if (x > b.cx - b.hx && x < b.cx + b.hx && z > b.cz - b.hz && z < b.cz + b.hz && b.top > g) g = b.top;
    }
    return g;
  }

  private throwRock(t: Thug, api: CrowdApi) {
    const rock = this.rocks.find((r) => !r.active);
    if (!rock) return;
    rock.active = true;
    rock.life = 4;
    rock.mesh.visible = true;
    const from = _v1.copy(t.rig.group.position);
    from.y += 1.6;
    rock.mesh.position.copy(from);
    const lead = _v2.copy(api.playerPos).addScaledVector(_v3.set(0, 0, 0), 0);
    const dx = lead.x - from.x;
    const dz = lead.z - from.z;
    const dist = Math.hypot(dx, dz);
    const tFlight = Math.max(0.4, dist / 17);
    rock.vel.set(dx / tFlight, (api.playerPos.y + 0.6 - from.y) / tFlight + 0.5 * 20 * tFlight, dz / tFlight);
    api.sfx.rockThrow();
  }

  update(dt: number, api: CrowdApi) {
    const pp = api.playerPos;

    /* ---- punches ---- */
    for (const p of api.punches) {
      let hitAny = false;
      for (const t of this.thugs) {
        if (t.dead) continue;
        const tp = t.rig.group.position;
        const dx = tp.x - p.x;
        const dy = tp.y + 1 - p.y;
        const dz = tp.z - p.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > p.range * p.range) continue;
        const d = Math.sqrt(d2) || 1;
        const dot = (dx * p.dx + dy * p.dy + dz * p.dz) / d;
        if (dot < 0.25) continue;
        hitAny = true;
        // a webbed thug is helpless — one punch finishes it
        t.hp -= t.webT > 0 ? 999 : p.dmg;
        t.flash = 1;
        t.stagger = 0.42;
        t.windup = 0;
        t.lungeT = 0;
        t.kb.set(p.dx, 0.15, p.dz).multiplyScalar(9);
        api.particles.burst(_v1.set(tp.x, tp.y + 1.2, tp.z), 12, ["#ffffff", "#ffcf3f", "#ff2438"], 7, 0.45, 2.4);
        if (t.hp <= 0) {
          t.dead = true;
          t.webT = 0;
          t.cocoon.visible = false;
          t.respawnT = 16;
          t.rig.group.visible = false;
          api.particles.burst(_v1.set(tp.x, tp.y + 1, tp.z), 34, ["#ff2438", "#ffcf3f", "#ffffff", "#2c3140"], 12, 1, 3);
          api.sfx.thugDie();
          api.onThugKilled(_v1.set(tp.x, tp.y + 1.4, tp.z).clone());
        } else {
          api.sfx.punchHit(p.heavy);
        }
      }
      if (hitAny) api.onPunchHit(p.heavy, _v1.set(p.x + p.dx * 1.4, p.y + p.dy * 1.4, p.z + p.dz * 1.4).clone());
    }
    api.punches.length = 0;

    /* ---- civilians ---- */
    for (const c of this.civs) {
      const gpos = c.rig.group.position;
      const far = Math.abs(gpos.x - pp.x) + Math.abs(gpos.z - pp.z) > 190;
      if (far) continue;
      if (c.pause > 0) {
        c.pause -= dt;
        c.rig.legL.rotation.x *= 0.85;
        c.rig.legR.rotation.x *= 0.85;
        c.rig.armL.rotation.x *= 0.85;
        c.rig.armR.rotation.x *= 0.85;
        continue;
      }
      const d = c.target - c.along;
      const step = c.speed * dt;
      if (Math.abs(d) < step) {
        c.along = c.target;
        c.pause = Math.random() < 0.35 ? 1 + Math.random() * 2.5 : 0;
        c.target = (Math.random() * 2 - 1) * 240;
      } else {
        c.along += Math.sign(d) * step;
      }
      this.placeCiv(c);
      const dir = Math.sign(d) || 1;
      const faceYaw = c.axisX ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
      c.rig.group.rotation.y += (faceYaw - c.rig.group.rotation.y) * Math.min(1, 8 * dt);
      c.phase += c.speed * dt * 3.1;
      const sw = Math.sin(c.phase) * 0.62;
      c.rig.legL.rotation.x = sw;
      c.rig.legR.rotation.x = -sw;
      c.rig.armL.rotation.x = -sw * 0.5;
      c.rig.armR.rotation.x = sw * 0.5;
      c.rig.group.position.y = Math.abs(Math.sin(c.phase)) * 0.05;
    }

    /* ---- thugs ---- */
    for (const t of this.thugs) {
      if (t.dead) {
        t.respawnT -= dt;
        if (t.respawnT <= 0) {
          t.dead = false;
          t.hp = THUG_HP;
          t.rig.group.visible = true;
          t.rig.group.position.copy(t.spawn);
          t.rig.group.scale.setScalar(0.01);
        }
        continue;
      }
      const gpos = t.rig.group.position;
      if (t.rig.group.scale.x < 1.05) t.rig.group.scale.setScalar(Math.min(1.06, t.rig.group.scale.x + dt * 2.4));
      t.flash = Math.max(0, t.flash - dt * 4);
      const torsoMat = t.rig.torso.material as THREE.MeshToonMaterial;
      torsoMat.emissive.setRGB(t.flash * 0.9, t.flash * 0.2, t.flash * 0.2);

      const dx = pp.x - gpos.x;
      const dy = pp.y - gpos.y;
      const dz = pp.z - gpos.z;
      const dh = Math.hypot(dx, dz);
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // webbed: trapped in the cocoon, struggling until it wears off
      if (t.webT > 0) {
        t.webT -= dt;
        t.rig.group.rotation.z = Math.sin(api.elapsed * 26) * 0.07;
        t.cocoon.rotation.y += dt * 2;
        const pulse = 1 + Math.sin(api.elapsed * 12) * 0.04;
        t.cocoon.scale.setScalar(pulse);
        if (t.webT <= 0) {
          t.cocoon.visible = false;
          t.rig.group.rotation.z = 0;
          t.cocoon.scale.setScalar(1);
        }
        continue;
      }

      // knockback decay
      if (t.kb.lengthSq() > 0.01) {
        gpos.addScaledVector(t.kb, dt);
        t.kb.multiplyScalar(Math.exp(-7 * dt));
        gpos.y = Math.max(gpos.y, this.groundAt(gpos.x, gpos.z));
      }

      if (t.stagger > 0) {
        t.stagger -= dt;
        t.rig.group.rotation.z = Math.sin(api.elapsed * 40) * 0.12;
        t.rig.armL.rotation.z = 1.1;
        t.rig.armR.rotation.z = -1.1;
        continue;
      }
      t.rig.group.rotation.z *= 0.8;

      // face the player when aware
      if (dist < 40 && dh > 0.1) {
        const want = Math.atan2(dx, dz);
        let dyw = want - t.rig.group.rotation.y;
        while (dyw > Math.PI) dyw -= Math.PI * 2;
        while (dyw < -Math.PI) dyw += Math.PI * 2;
        t.rig.group.rotation.y += dyw * Math.min(1, 9 * dt);
      }

      if (!api.active) {
        this.thugIdle(t, dt, api);
        continue;
      }

      if (t.windup > 0) {
        t.windup -= dt;
        gpos.x += Math.sin(api.elapsed * 55) * 0.02;
        t.rig.group.scale.y = 1.06 * (1 - (0.45 - Math.max(t.windup, 0)) * 0.35);
        t.rig.armL.rotation.x = -0.7;
        t.rig.armR.rotation.x = -0.7;
        if (t.windup <= 0) {
          t.lungeT = 0.32;
          t.lungeDir.set(dx, 0, dz).normalize();
          api.sfx.lunge();
        }
        continue;
      }
      if (t.lungeT > 0) {
        t.lungeT -= dt;
        gpos.addScaledVector(t.lungeDir, 25 * dt);
        gpos.y = this.groundAt(gpos.x, gpos.z);
        t.rig.legL.rotation.x = 1.1;
        t.rig.legR.rotation.x = -0.7;
        t.rig.armL.rotation.x = -1.5;
        t.rig.armR.rotation.x = -1.5;
        if (dist < 1.7 && !api.invuln) {
          api.damagePlayer(12, gpos);
          t.lungeT = 0;
        }
        if (t.lungeT <= 0) {
          t.attackCd = 2.3;
          t.rig.group.scale.y = 1.06;
        }
        continue;
      }

      t.attackCd -= dt;
      t.rockCd -= dt;

      if (dh < 3.6 && Math.abs(dy) < 2.4 && t.attackCd <= 0) {
        t.windup = 0.45;
        api.sfx.grunt();
      } else if (dist > 9 && dist < 46 && t.rockCd <= 0) {
        this.throwRock(t, api);
        t.rockCd = 2.8 + Math.random() * 2.4;
      } else {
        this.thugIdle(t, dt, api);
      }
    }

    /* ---- rocks ---- */
    for (const r of this.rocks) {
      if (!r.active) continue;
      r.life -= dt;
      r.vel.y -= 20 * dt;
      r.mesh.position.addScaledVector(r.vel, dt);
      r.mesh.rotation.x += 6 * dt;
      const gp = r.mesh.position;
      const ground = this.groundAt(gp.x, gp.z) + 0.32;
      let kill = r.life <= 0;
      if (gp.y < ground) {
        api.particles.burst(_v1.copy(gp), 6, ["#8d93a8", "#aab3d4"], 3, 0.35, 1.6);
        api.sfx.rockLand();
        kill = true;
      } else if (api.active && !api.invuln && gp.distanceTo(pp) < 1.35) {
        api.damagePlayer(8, gp);
        api.particles.burst(_v1.copy(gp), 8, ["#ff2438", "#ffffff"], 5, 0.4, 2);
        kill = true;
      }
      if (kill) {
        r.active = false;
        r.mesh.visible = false;
      }
    }
  }

  private thugIdle(t: Thug, dt: number, api: CrowdApi) {
    const gpos = t.rig.group.position;
    const d = _v1.copy(t.patrolT).sub(gpos);
    d.y = 0;
    if (d.length() < 0.6) {
      t.patrolT.set(
        t.spawn.x + (Math.random() - 0.5) * 8,
        t.spawn.y,
        t.spawn.z + (Math.random() - 0.5) * 8
      );
      t.rig.legL.rotation.x *= 0.8;
      t.rig.legR.rotation.x *= 0.8;
      return;
    }
    d.normalize();
    gpos.addScaledVector(d, 1.6 * dt);
    gpos.y = this.groundAt(gpos.x, gpos.z);
    const want = Math.atan2(d.x, d.z);
    let dyw = want - t.rig.group.rotation.y;
    while (dyw > Math.PI) dyw -= Math.PI * 2;
    while (dyw < -Math.PI) dyw += Math.PI * 2;
    t.rig.group.rotation.y += dyw * Math.min(1, 6 * dt);
    t.phase += dt * 5.2;
    const sw = Math.sin(t.phase) * 0.5;
    t.rig.legL.rotation.x = sw;
    t.rig.legR.rotation.x = -sw;
    t.rig.armL.rotation.x = -sw * 0.4;
    t.rig.armR.rotation.x = sw * 0.4;
    void api;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const rigs = [...this.civs.map((c) => c.rig), ...this.thugs.map((t) => t.rig)];
    for (const r of rigs) {
      this.scene.remove(r.group);
      r.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) (m.material as THREE.Material).dispose();
      });
    }
    for (const r of this.rocks) this.scene.remove(r.mesh);
    this.geoRock.dispose();
    this.matRock.dispose();
  }
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
