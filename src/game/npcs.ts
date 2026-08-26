import * as THREE from "three";
import { City, STREET_LINES, SIDEWALK, WORLD_SPAN } from "./world";
import { buildR6Rig, civilianStyle, thugStyle, disposeRig, type Rig } from "./rig";
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
  /** radial AoE — ignores the forward cone, knocks outward from origin */
  aoe?: boolean;
  /** freeze the thug (reuses the helpless/webbed state) */
  freeze?: boolean;
  /** drag thugs toward the caster instead of away */
  pull?: boolean;
  kbForce?: number;
  tint?: string[];
}

export interface CrowdApi {
  active: boolean;
  playerPos: THREE.Vector3;
  playerVel: THREE.Vector3;
  swingHitCd: number;
  invuln: boolean;
  elapsed: number;
  punches: PunchEvent[];
  damagePlayer(n: number, from: THREE.Vector3): void;
  onPunchHit(heavy: boolean, pos: THREE.Vector3): void;
  onThugKilled(pos: THREE.Vector3): void;
  onSwingHit(points: number, pos: THREE.Vector3): void;
  onCoin(pos: THREE.Vector3): void;
  onHeal(pos: THREE.Vector3): void;
  particles: { burst(p: THREE.Vector3, n: number, colors: string[], speed?: number, life?: number, size?: number): void };
  sfx: Sfx;
}

interface Gang {
  name: string;
  color: string;
  torso: number;
  hpMul: number;
  dmg: number;
  aggro: number;
}
const GANGS: Gang[] = [
  { name: "KING COBRAS", color: "#52ffa8", torso: 0x1e4d3a, hpMul: 1, dmg: 10, aggro: 26 },
  { name: "VOLT JACKALS", color: "#ffcf3f", torso: 0x4d401e, hpMul: 1.15, dmg: 12, aggro: 30 },
  { name: "NEON VIPERS", color: "#ff4fd8", torso: 0x4d1e44, hpMul: 1.3, dmg: 14, aggro: 34 },
  { name: "CRIMSON KINGS", color: "#ff2438", torso: 0x4d1e22, hpMul: 1.6, dmg: 18, aggro: 40 },
];

interface Civ {
  rig: Rig;
  axisX: boolean;
  line: number;
  side: number;
  along: number;
  target: number;
  speed: number;
  phase: number;
}

interface Thug {
  rig: Rig;
  gang: Gang;
  spawn: THREE.Vector3;
  hp: number;
  maxHp: number;
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
  hpBar: THREE.Mesh;
  swingCd: number;
}

interface Rock {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  life: number;
}

interface Coin {
  mesh: THREE.Group;
  baseY: number;
  phase: number;
  taken: boolean;
}

interface Heal {
  mesh: THREE.Group;
  baseY: number;
  phase: number;
  taken: boolean;
  respawn: number;
}

const THUG_HP = 60;
const CIV_COUNT = 30;
const THUG_COUNT = 14;
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Crowd {
  private scene: THREE.Scene;
  private city: City;
  private civs: Civ[] = [];
  private thugs: Thug[] = [];
  private rocks: Rock[] = [];
  private coins: Coin[] = [];
  private heals: Heal[] = [];
  private thugSpawns: THREE.Vector3[] = [];
  private geoRock = new THREE.SphereGeometry(0.34, 8, 8);
  private matRock = new THREE.MeshToonMaterial({ color: 0x8d93a8 });
  private geoCocoon = new THREE.IcosahedronGeometry(1.25, 1);
  private matCocoon = new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.42, depthWrite: false });
  private disposed = false;

  constructor(scene: THREE.Scene, city: City) {
    this.scene = scene;
    this.city = city;
    const rnd = (() => {
      let s = 987654;
      return () => {
        s = (s * 1103515245 + 12345) >>> 0;
        return s / 4294967296;
      };
    })();

    // civilians
    for (let i = 0; i < CIV_COUNT; i++) {
      const rig = buildR6Rig(civilianStyle(rnd));
      const axisX = rnd() < 0.5;
      const line = STREET_LINES[Math.floor(rnd() * STREET_LINES.length)];
      const side = rnd() < 0.5 ? -1 : 1;
      const along = (rnd() * 2 - 1) * 330;
      const civ: Civ = { rig, axisX, line, side, along, target: (rnd() * 2 - 1) * 330, speed: 1.4 + rnd() * 1.4, phase: rnd() * 7 };
      rig.group.position.set(axisX ? along : line + side * SIDEWALK, 0, axisX ? line + side * SIDEWALK : along);
      scene.add(rig.group);
      this.civs.push(civ);
    }

    // thugs — gangs by city quadrant
    for (let i = 0; i < THUG_COUNT; i++) {
      const line = STREET_LINES[Math.floor(rnd() * STREET_LINES.length)];
      const along = (rnd() * 2 - 1) * 300;
      const off = (rnd() < 0.5 ? -1 : 1) * SIDEWALK;
      const sp = rnd() < 0.5 ? new THREE.Vector3(along, 0, line + off) : new THREE.Vector3(line + off, 0, along);
      this.thugSpawns.push(sp);
    }
    const geoBand = new THREE.BoxGeometry(1.24 * 0.42, 0.14, 1.24 * 0.42);
    const geoHp = new THREE.PlaneGeometry(1.1, 0.12);
    for (let i = 0; i < THUG_COUNT; i++) {
      const sp = this.thugSpawns[i];
      const region = (sp.x >= 0 ? 1 : 0) + (sp.z >= 0 ? 2 : 0);
      const gang = GANGS[region % GANGS.length];
      const rig = buildR6Rig(thugStyle(gang.torso));
      rig.group.scale.setScalar(1.06);
      const band = new THREE.Mesh(geoBand, new THREE.MeshBasicMaterial({ color: new THREE.Color(gang.color).getHex() }));
      band.position.y = 4.6 * 0.42 + 0.16;
      rig.group.add(band);
      const cocoon = new THREE.Mesh(this.geoCocoon, this.matCocoon);
      cocoon.position.y = 1.1;
      cocoon.visible = false;
      rig.group.add(cocoon);
      const hpBar = new THREE.Mesh(geoHp, new THREE.MeshBasicMaterial({ color: new THREE.Color(gang.color), transparent: true, opacity: 0.9, depthWrite: false }));
      hpBar.position.y = 5.6 * 0.42;
      hpBar.renderOrder = 20;
      rig.group.add(hpBar);
      const maxHp = Math.round(THUG_HP * gang.hpMul);
      const t: Thug = {
        rig, gang, spawn: sp.clone(), hp: maxHp, maxHp,
        dead: false, respawnT: 0, flash: 0, stagger: 0, windup: 0, lungeT: 0,
        lungeDir: new THREE.Vector3(), attackCd: 1 + rnd() * 2, rockCd: 2 + rnd() * 3,
        patrolT: sp.clone(), kb: new THREE.Vector3(), phase: rnd() * 6, webT: 0, cocoon, hpBar, swingCd: 0,
      };
      rig.group.position.copy(sp);
      scene.add(rig.group);
      this.thugs.push(t);
    }

    // coins
    const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 16);
    const coinMat = new THREE.MeshBasicMaterial({ color: 0xffcf3f });
    const coinEdge = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
    for (const spot of city.coinSpots) {
      const g = new THREE.Group();
      const c = new THREE.Mesh(coinGeo, coinMat);
      c.rotation.z = Math.PI / 2;
      g.add(c);
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 20), coinEdge).rotateY(Math.PI / 2));
      g.position.copy(spot);
      scene.add(g);
      this.coins.push({ mesh: g, baseY: spot.y, phase: Math.random() * 7, taken: false });
    }

    // heals
    const healCore = new THREE.MeshBasicMaterial({ color: 0x52ffa8 });
    for (const spot of city.healSpots) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), healCore));
      const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const bar2 = bar1.clone();
      bar2.rotation.z = Math.PI / 2;
      g.add(bar1, bar2);
      g.position.copy(spot);
      scene.add(g);
      this.heals.push({ mesh: g, baseY: spot.y, phase: Math.random() * 7, taken: false, respawn: 0 });
    }
  }

  private groundAt(x: number, z: number): number {
    let g = 0;
    for (const b of this.city.boxes) {
      if (b.y0 !== undefined) continue;
      if (x > b.cx - b.hx && x < b.cx + b.hx && z > b.cz - b.hz && z < b.cz + b.hz && b.top > g) g = b.top;
    }
    return g;
  }

  /** web a thug near a point — returns true if one was caught */
  webAt(x: number, y: number, z: number): boolean {
    let hit = false;
    for (const t of this.thugs) {
      if (t.dead || t.webT > 0) continue;
      const tp = t.rig.group.position;
      const d2 = (tp.x - x) ** 2 + (tp.y + 1 - y) ** 2 + (tp.z - z) ** 2;
      if (d2 < 4.4 * 4.4) {
        t.webT = 3;
        t.cocoon.visible = true;
        t.windup = 0;
        t.lungeT = 0;
        hit = true;
      }
    }
    return hit;
  }

  update(dt: number, api: CrowdApi) {
    const pp = api.playerPos;

    /* ---- civilians: stroll, flee danger ---- */
    for (const c of this.civs) {
      const gpos = c.rig.group.position;
      const far = Math.abs(gpos.x - pp.x) + Math.abs(gpos.z - pp.z) > 260;
      if (far) {
        c.rig.group.visible = false;
        continue;
      }
      c.rig.group.visible = true;
      const scared = Math.abs(gpos.x - pp.x) < 9 && Math.abs(gpos.z - pp.z) < 9;
      if (scared) {
        const away = _v1.set(gpos.x - pp.x, 0, gpos.z - pp.z).normalize();
        c.along += (c.axisX ? away.x : away.z) * 6.5 * dt;
      } else {
        const d = c.target - c.along;
        if (Math.abs(d) < 1) c.target = (Math.random() * 2 - 1) * 330;
        c.along += Math.sign(d) * c.speed * dt;
      }
      if (c.axisX) gpos.set(c.along, 0, c.line + c.side * SIDEWALK);
      else gpos.set(c.line + c.side * SIDEWALK, 0, c.along);
      gpos.y = this.groundAt(gpos.x, gpos.z);
      const walking = scared ? 6.5 : c.speed;
      const ph = api.elapsed * walking * 1.35 + c.phase;
      const sw = Math.sin(ph) * 0.55;
      c.rig.legL.rotation.x = sw;
      c.rig.legR.rotation.x = -sw;
      c.rig.armL.rotation.x = -sw * 0.8;
      c.rig.armR.rotation.x = sw * 0.8;
      const dir = c.axisX ? Math.sign(c.target - c.along) || 1 : 0;
      const targetYaw = c.axisX ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : c.target > c.along ? 0 : Math.PI;
      c.rig.group.rotation.y += (targetYaw - c.rig.group.rotation.y) * Math.min(1, dt * 5);
    }

    /* ---- punches & powers ---- */
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
        if (!p.aoe) {
          const dot = (dx * p.dx + dy * p.dy + dz * p.dz) / d;
          if (dot < 0.25) continue;
        }
        hitAny = true;
        t.hp -= t.webT > 0 ? 999 : p.dmg;
        t.flash = 1;
        t.stagger = 0.42;
        t.windup = 0;
        t.lungeT = 0;
        if (p.aoe) {
          const mag = (p.kbForce ?? 9) * (p.pull ? -1.6 : 1);
          t.kb.set((dx / d) * mag, p.pull ? 0.05 : 0.35, (dz / d) * mag);
        } else {
          t.kb.set(p.dx, 0.15, p.dz).multiplyScalar(p.kbForce ?? 9);
        }
        if (p.freeze) {
          t.webT = Math.max(t.webT, 2.2);
          t.cocoon.visible = true;
        }
        api.particles.burst(_v1.set(tp.x, tp.y + 1.2, tp.z), 12, p.tint ?? ["#ffffff", "#ffcf3f", "#ff2438"], 7, 0.45, 2.4);
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

    /* ---- swing-through damage ---- */
    const pSpeed = Math.hypot(api.playerVel.x, api.playerVel.z);
    if (api.active && pSpeed > 15 && api.swingHitCd <= 0) {
      for (const t of this.thugs) {
        if (t.dead) continue;
        const tp = t.rig.group.position;
        const d2 = (tp.x - pp.x) ** 2 + (tp.y + 1 - pp.y) ** 2 + (tp.z - pp.z) ** 2;
        if (d2 < 3.4 * 3.4) {
          const dmg = Math.round(20 + pSpeed * 1.4);
          t.hp -= dmg;
          t.flash = 1;
          t.stagger = 0.5;
          t.kb.set(api.playerVel.x, 6, api.playerVel.z).multiplyScalar(0.5);
          api.particles.burst(_v1.set(tp.x, tp.y + 1.4, tp.z), 18, ["#ffffff", "#aef3ff", "#ffcf3f"], 9, 0.5, 2.6);
          if (t.hp <= 0) {
            t.dead = true;
            t.webT = 0;
            t.cocoon.visible = false;
            t.respawnT = 16;
            t.rig.group.visible = false;
            api.sfx.thugDie();
            api.onThugKilled(_v1.set(tp.x, tp.y + 1.4, tp.z).clone());
          } else {
            api.sfx.punchHit(true);
          }
          api.onSwingHit(dmg, _v1.set(tp.x, tp.y + 2, tp.z).clone());
          break;
        }
      }
    }

    /* ---- thugs ---- */
    for (const t of this.thugs) {
      if (t.dead) {
        t.respawnT -= dt;
        if (t.respawnT <= 0) {
          t.dead = false;
          t.hp = t.maxHp;
          t.webT = 0;
          t.cocoon.visible = false;
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
      const hpPct = Math.max(0, t.hp / t.maxHp);
      t.hpBar.scale.x = hpPct;
      t.hpBar.visible = hpPct < 0.999;
      t.hpBar.lookAt(pp.x, gpos.y + t.hpBar.position.y, pp.z);
      t.swingCd = Math.max(0, t.swingCd - dt);

      // knockback
      if (t.kb.lengthSq() > 0.01) {
        gpos.addScaledVector(t.kb, dt);
        t.kb.multiplyScalar(Math.exp(-6 * dt));
      }

      // webbed / frozen — helpless
      if (t.webT > 0) {
        t.webT -= dt;
        t.cocoon.visible = t.webT > 0;
        t.cocoon.rotation.y += dt * 2;
        gpos.y = this.groundAt(gpos.x, gpos.z);
        t.rig.legL.rotation.x = 0.2;
        t.rig.legR.rotation.x = -0.15;
        t.rig.armL.rotation.x = 0.5;
        t.rig.armR.rotation.x = 0.5;
        continue;
      }

      const dx = pp.x - gpos.x;
      const dz = pp.z - gpos.z;
      const dh = Math.hypot(dx, dz);
      const dy = pp.y - gpos.y;
      const dist = Math.hypot(dh, dy);

      if (t.stagger > 0) {
        t.stagger -= dt;
        t.rig.group.rotation.z = Math.sin(api.elapsed * 40) * 0.12;
        continue;
      }
      t.rig.group.rotation.z *= 0.85;

      gpos.y = this.groundAt(gpos.x, gpos.z);

      // lunge attack in progress
      if (t.lungeT > 0) {
        t.lungeT -= dt;
        gpos.addScaledVector(t.lungeDir, dt);
        t.rig.armL.rotation.x = -1.5;
        t.rig.armR.rotation.x = -1.5;
        if (dh < 1.7 && !api.invuln) {
          api.damagePlayer(t.gang.dmg, gpos);
          t.lungeT = 0;
        }
        if (t.lungeT <= 0) {
          t.attackCd = 2.3;
          t.rig.group.scale.y = 1.06;
        }
        continue;
      }

      // face the player when aware
      if (dist < t.gang.aggro && dh > 0.1) {
        const ty = Math.atan2(dx, dz);
        let ddy = ty - t.rig.group.rotation.y;
        while (ddy > Math.PI) ddy -= Math.PI * 2;
        while (ddy < -Math.PI) ddy += Math.PI * 2;
        t.rig.group.rotation.y += ddy * Math.min(1, dt * 8);
      }

      // windup
      if (t.windup > 0) {
        t.windup -= dt;
        t.rig.armR.rotation.x = -2.4;
        t.rig.group.scale.y = 1.06 + (0.45 - t.windup) * 0.12;
        if (t.windup <= 0) {
          t.lungeT = 0.34;
          t.lungeDir.set(dx / (dh || 1), 0, dz / (dh || 1)).multiplyScalar(13);
          api.sfx.lunge();
        }
        continue;
      }

      t.attackCd -= dt;
      t.rockCd -= dt;

      if (dh < 3.6 && Math.abs(dy) < 2.4 && t.attackCd <= 0 && api.active) {
        t.windup = 0.45;
        api.sfx.grunt();
      } else if (dh > 9 && dh < t.gang.aggro + 8 && t.rockCd <= 0 && api.active && Math.abs(dy) < 10) {
        this.throwRock(t, api);
        t.rockCd = 2.8 + Math.random() * 2.4;
      } else {
        // chase or patrol
        let mx = 0;
        let mz = 0;
        if (dist < t.gang.aggro && api.active) {
          if (dh > 2.2) {
            mx = (dx / dh) * 4.2;
            mz = (dz / dh) * 4.2;
          }
        } else {
          const pdx = t.patrolT.x - gpos.x;
          const pdz = t.patrolT.z - gpos.z;
          const pd = Math.hypot(pdx, pdz);
          if (pd < 2) {
            t.patrolT.set(t.spawn.x + (Math.random() - 0.5) * 26, 0, t.spawn.z + (Math.random() - 0.5) * 26);
          } else {
            mx = (pdx / pd) * 1.6;
            mz = (pdz / pd) * 1.6;
          }
        }
        gpos.x += mx * dt;
        gpos.z += mz * dt;
        const sp = Math.hypot(mx, mz);
        const ph = api.elapsed * (3 + sp * 1.4) + t.phase;
        const sw = Math.sin(ph) * Math.min(1, sp / 3) * 0.7;
        t.rig.legL.rotation.x = sw;
        t.rig.legR.rotation.x = -sw;
        t.rig.armL.rotation.x = -sw * 0.8;
        t.rig.armR.rotation.x = sw * 0.8;
      }
    }

    /* ---- rocks ---- */
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.life -= dt;
      r.v.y -= 22 * dt;
      r.mesh.position.addScaledVector(r.v, dt);
      r.mesh.rotation.x += dt * 9;
      const rp = r.mesh.position;
      let done = r.life <= 0 || rp.y < 0.3;
      if (!done && !api.invuln) {
        const d2 = (rp.x - pp.x) ** 2 + (rp.y - pp.y) ** 2 + (rp.z - pp.z) ** 2;
        if (d2 < 1.6 * 1.6) {
          api.damagePlayer(8, rp);
          done = true;
        }
      }
      if (done) {
        api.sfx.rockLand();
        api.particles.burst(rp, 6, ["#8d93a8", "#aab3d4"], 3, 0.35, 1.6);
        this.scene.remove(r.mesh);
        this.rocks.splice(i, 1);
      }
    }

    /* ---- coins ---- */
    for (const c of this.coins) {
      if (c.taken) continue;
      c.mesh.rotation.y += dt * 2.6;
      c.mesh.position.y = c.baseY + Math.sin(api.elapsed * 2.4 + c.phase) * 0.25;
      if (!api.active) continue;
      const cp = c.mesh.position;
      const d2 = (cp.x - pp.x) ** 2 + (cp.y - pp.y) ** 2 + (cp.z - pp.z) ** 2;
      if (d2 < 2.4 * 2.4) {
        c.taken = true;
        c.mesh.visible = false;
        api.sfx.cash();
        api.particles.burst(cp, 10, ["#ffcf3f", "#fff3b0", "#ffffff"], 5, 0.45, 2);
        api.onCoin(_v2.copy(cp));
      }
    }

    /* ---- heals ---- */
    for (const h of this.heals) {
      if (h.taken) {
        h.respawn -= dt;
        if (h.respawn <= 0) {
          h.taken = false;
          h.mesh.visible = true;
        }
        continue;
      }
      h.mesh.rotation.y += dt * 1.8;
      h.mesh.position.y = h.baseY + Math.sin(api.elapsed * 2 + h.phase) * 0.3;
      if (!api.active) continue;
      const hp = h.mesh.position;
      const d2 = (hp.x - pp.x) ** 2 + (hp.y - pp.y) ** 2 + (hp.z - pp.z) ** 2;
      if (d2 < 2.4 * 2.4) {
        h.taken = true;
        h.mesh.visible = false;
        h.respawn = 45;
        api.sfx.heal();
        api.particles.burst(hp, 16, ["#52ffa8", "#ffffff"], 6, 0.5, 2.2);
        api.onHeal(_v2.copy(hp));
      }
    }
  }

  private throwRock(t: Thug, api: CrowdApi) {
    const gpos = t.rig.group.position;
    const mesh = new THREE.Mesh(this.geoRock, this.matRock);
    mesh.position.set(gpos.x, gpos.y + 2.4, gpos.z);
    const v = new THREE.Vector3(api.playerPos.x - gpos.x, api.playerPos.y - gpos.y, api.playerPos.z - gpos.z);
    const dist = v.length() || 1;
    v.divideScalar(dist).multiplyScalar(Math.min(30, 12 + dist * 0.5));
    v.y += dist * 0.24;
    this.scene.add(mesh);
    this.rocks.push({ mesh, v, life: 3 });
    api.sfx.rockThrow();
    t.rig.armR.rotation.x = -2.2;
  }

  reset() {
    for (const t of this.thugs) {
      t.hp = t.maxHp;
      t.dead = false;
      t.webT = 0;
      t.cocoon.visible = false;
      t.rig.group.visible = true;
      t.rig.group.position.copy(t.spawn);
      t.rig.group.scale.setScalar(1.06);
    }
    for (const c of this.coins) {
      c.taken = false;
      c.mesh.visible = true;
    }
    for (const h of this.heals) {
      h.taken = false;
      h.mesh.visible = true;
    }
    for (const r of this.rocks) this.scene.remove(r.mesh);
    this.rocks.length = 0;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const c of this.civs) {
      this.scene.remove(c.rig.group);
      disposeRig(c.rig);
    }
    for (const t of this.thugs) {
      this.scene.remove(t.rig.group);
      disposeRig(t.rig);
    }
    for (const r of this.rocks) this.scene.remove(r.mesh);
    for (const c of this.coins) this.scene.remove(c.mesh);
    for (const h of this.heals) this.scene.remove(h.mesh);
  }
}
