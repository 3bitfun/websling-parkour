import * as THREE from "three";

export interface Box {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  top: number;
  /** bottom of solid volume (skybridges float; towers start at 0) */
  y0?: number;
}

export interface EggSpot {
  id: string;
  pos: THREE.Vector3;
  r: number;
  label: string;
}

const GRID = 12;
const SPACING = 64;
const PAD = 44;
const GROUND_SIZE = 1280;
export const WORLD_SPAN = ((GRID - 1) / 2) * SPACING; // 352
export const MAX_ROOF = 66;
export const STREET_LINES: number[] = [];
for (let k = -GRID / 2 + 1; k < GRID / 2; k++) STREET_LINES.push(k * SPACING);
export const SIDEWALK = 8.5;

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

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d")!;
  draw(c, size);
  const t = new THREE.CanvasTexture(cv);
  t.anisotropy = 4;
  return t;
}

function windowTexture() {
  return canvasTex(256, (c, s) => {
    c.fillStyle = "#0a0f22";
    c.fillRect(0, 0, s, s);
    const cols = 12;
    const rows = 26;
    const cw = s / cols;
    const rh = s / rows;
    const warm = ["#ffd98c", "#ffc46b", "#ffe9b0", "#a8d8ff", "#ffd98c"];
    const rnd = mulberry(77);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lit = rnd() < 0.42;
        c.fillStyle = lit ? warm[Math.floor(rnd() * warm.length)] : "#111733";
        c.globalAlpha = lit ? 0.55 + rnd() * 0.45 : 1;
        c.fillRect(i * cw + cw * 0.22, j * rh + rh * 0.2, cw * 0.56, rh * 0.52);
      }
    }
    c.globalAlpha = 1;
  });
}

function groundTexture() {
  const t = canvasTex(128, (c, s) => {
    c.fillStyle = "#171c33";
    c.fillRect(0, 0, s, s);
    const rnd = mulberry(31);
    for (let i = 0; i < 240; i++) {
      c.fillStyle = rnd() < 0.5 ? "#131830" : "#1c2240";
      c.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
    const pad = (PAD / SPACING) * s;
    const off = (s - pad) / 2;
    c.fillStyle = "#0c1124";
    c.fillRect(off, off, pad, pad);
    c.strokeStyle = "#232b52";
    c.lineWidth = 2;
    c.strokeRect(off, off, pad, pad);
    c.fillStyle = "rgba(230,190,80,0.55)";
    for (let y = 4; y < s; y += 14) {
      c.fillRect(0, y, 2.4, 7);
      c.fillRect(s - 1.2, y, 1.2, 7);
      c.fillRect(y, 0, 7, 2.4);
      c.fillRect(y, s - 1.2, 7, 1.2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(GROUND_SIZE / SPACING, GROUND_SIZE / SPACING);
  return t;
}

function signTexture() {
  return canvasTex(128, (c, s) => {
    const rnd = mulberry(99);
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, s, s);
    c.fillStyle = "rgba(10,12,30,0.88)";
    c.fillRect(6, 6, s - 12, s - 12);
    c.fillStyle = "#ffffff";
    for (let r = 0; r < 3; r++) {
      let x = 16;
      while (x < s - 26) {
        const w = 8 + rnd() * 22;
        if (rnd() < 0.75) c.fillRect(x, 24 + r * 32, w, 16);
        x += w + 8;
      }
    }
  });
}

export function makeTextSprite(text: string, color = "#ffcf3f", w = 46, h = 7.2): THREE.Sprite {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 160;
  const c = cv.getContext("2d")!;
  c.font = "900 88px 'Bangers', 'Impact', sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineWidth = 18;
  c.strokeStyle = "#04071c";
  c.strokeText(text, 512, 84);
  c.fillStyle = color;
  c.fillText(text, 512, 84);
  const tex = new THREE.CanvasTexture(cv);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
  sprite.scale.set(w, h, 1);
  return sprite;
}

export class City {
  group = new THREE.Group();
  boxes: Box[] = [];
  tokenSpots: THREE.Vector3[] = [];
  coinSpots: THREE.Vector3[] = [];
  healSpots: THREE.Vector3[] = [];
  dealerSpots: THREE.Vector3[] = [
    new THREE.Vector3(24, 0, -40),
    new THREE.Vector3(-96, 0, -40),
    new THREE.Vector3(160, 0, 88),
    new THREE.Vector3(256, 0, 280),
  ];
  eggSpots: EggSpot[] = [];
  spawn = new THREE.Vector3(32, 0, 14);
  beaconMat: THREE.MeshBasicMaterial;
  ufo: THREE.Group | null = null;
  tung: THREE.Group | null = null;

  constructor() {
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff4455 });
    this.build();
  }

  private build() {
    const rnd = mulberry(20260214);
    const half = (GRID - 1) / 2;

    // ---- building layout ----
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const cx = (i - half) * SPACING;
        const cz = (j - half) * SPACING;
        if (cx >= 224 && cz >= 224) continue; // Unisphere park corner
        const centerDist = Math.max(Math.abs(cx), Math.abs(cz));
        const tall = centerDist < 120 ? 26 : centerDist < 220 ? 10 : -8;
        if (rnd() < 0.3) {
          const splitX = rnd() < 0.5;
          for (let k = 0; k < 2; k++) {
            const w = PAD / 2 - 2;
            const h = Math.min(MAX_ROOF, Math.max(14, 20 + rnd() * 34 + tall));
            const bx = splitX ? cx + (k === 0 ? -PAD / 4 - 1 : PAD / 4 + 1) : cx;
            const bz = splitX ? cz : cz + (k === 0 ? -PAD / 4 - 1 : PAD / 4 + 1);
            this.boxes.push({ cx: bx, cz: bz, hx: splitX ? w / 2 + 1 : PAD / 2 - 1, hz: splitX ? PAD / 2 - 1 : w / 2 + 1, top: h });
          }
        } else {
          const h = Math.min(MAX_ROOF, Math.max(12, 18 + rnd() * 40 + tall));
          this.boxes.push({ cx, cz, hx: PAD / 2 - 1 - rnd() * 4, hz: PAD / 2 - 1 - rnd() * 4, top: h });
        }
      }
    }

    // ---- skybridges (floating — collidable, walkable) ----
    for (let k = 0; k < 10; k++) {
      const a = this.boxes[Math.floor(rnd() * this.boxes.length)];
      const near = this.boxes.filter(
        (b) => b !== a && Math.abs(b.cx - a.cx) + Math.abs(b.cz - a.cz) < 110 && Math.abs(b.cx - a.cx) < 110 && Math.abs(b.cz - a.cz) < 110
      );
      if (!near.length) continue;
      const b = near[Math.floor(rnd() * near.length)];
      const horiz = Math.abs(b.cx - a.cx) > Math.abs(b.cz - a.cz);
      const y = Math.min(a.top, b.top) - 7 - rnd() * 4;
      if (y < 10) continue;
      this.boxes.push({
        cx: (a.cx + b.cx) / 2,
        cz: (a.cz + b.cz) / 2,
        hx: horiz ? Math.abs(b.cx - a.cx) / 2 + 1 : 2.4,
        hz: horiz ? 2.4 : Math.abs(b.cz - a.cz) / 2 + 1,
        top: y + 0.8,
        y0: y - 0.8,
      });
    }

    // ---- instanced towers ----
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const tints = ["#2b3a6e", "#3a2f66", "#27476b", "#33315e", "#233a5e", "#3d2b55"];
    const towerBoxes = this.boxes.filter((b) => b.y0 === undefined);
    const bridgeBoxes = this.boxes.filter((b) => b.y0 !== undefined);

    const winTex = windowTexture();
    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    bGeo.translate(0, 0.5, 0);
    const bMat = new THREE.MeshLambertMaterial({ map: winTex, emissiveMap: winTex, emissive: new THREE.Color(0xffc873), emissiveIntensity: 0.75 });
    const towers = new THREE.InstancedMesh(bGeo, bMat, towerBoxes.length);
    towerBoxes.forEach((b, idx) => {
      m.makeScale(b.hx * 2, b.top, b.hz * 2);
      m.setPosition(b.cx, 0, b.cz);
      towers.setMatrixAt(idx, m);
      col.set(tints[Math.floor(rnd() * tints.length)]).offsetHSL(0, 0, (rnd() - 0.5) * 0.06);
      towers.setColorAt(idx, col);
    });
    towers.instanceMatrix.needsUpdate = true;
    if (towers.instanceColor) towers.instanceColor.needsUpdate = true;
    this.group.add(towers);

    if (bridgeBoxes.length > 0) {
      const brMat = new THREE.MeshLambertMaterial({ color: 0x1b2242 });
      const bridges = new THREE.InstancedMesh(bGeo, brMat, bridgeBoxes.length);
      bridgeBoxes.forEach((b, idx) => {
        const h = b.top - (b.y0 ?? 0);
        m.makeScale(b.hx * 2, h, b.hz * 2);
        m.setPosition(b.cx, b.y0 ?? 0, b.cz);
        bridges.setMatrixAt(idx, m);
      });
      bridges.instanceMatrix.needsUpdate = true;
      this.group.add(bridges);
      const stripMat = new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.85 });
      const strips = new THREE.InstancedMesh(bGeo, stripMat, bridgeBoxes.length);
      bridgeBoxes.forEach((b, idx) => {
        m.makeScale(b.hx * 2 + 0.3, 0.35, b.hz * 2 + 0.3);
        m.setPosition(b.cx, (b.y0 ?? 0) - 0.4, b.cz);
        strips.setMatrixAt(idx, m);
      });
      strips.instanceMatrix.needsUpdate = true;
      this.group.add(strips);
    }

    // ---- neon billboards ----
    const tallBoxes = this.boxes.filter((b) => b.top > 30 && b.y0 === undefined);
    const signCount = Math.min(34, tallBoxes.length);
    const signGeo = new THREE.PlaneGeometry(1, 1);
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture() });
    const signs = new THREE.InstancedMesh(signGeo, signMat, signCount);
    const neons = ["#35e0ff", "#ff4fd8", "#ff2438", "#52ffa8", "#ffcf3f"];
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (let i = 0; i < signCount; i++) {
      const b = tallBoxes[Math.floor(rnd() * tallBoxes.length)];
      const face = Math.floor(rnd() * 4);
      const y = b.top * (0.45 + rnd() * 0.35);
      const w = 9 + rnd() * 6;
      const h = 4 + rnd() * 2.5;
      if (face === 0) { p.set(b.cx, y, b.cz + b.hz + 0.35); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0); }
      else if (face === 1) { p.set(b.cx, y, b.cz - b.hz - 0.35); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); }
      else if (face === 2) { p.set(b.cx + b.hx + 0.35, y, b.cz); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); }
      else { p.set(b.cx - b.hx - 0.35, y, b.cz); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2); }
      sc.set(w, h, 1);
      m.compose(p, q, sc);
      signs.setMatrixAt(i, m);
      col.set(neons[Math.floor(rnd() * neons.length)]);
      signs.setColorAt(i, col);
    }
    signs.instanceMatrix.needsUpdate = true;
    if (signs.instanceColor) signs.instanceColor.needsUpdate = true;
    this.group.add(signs);

    // ---- antennas + beacons ----
    const antCount = Math.min(46, tallBoxes.length);
    const antGeo = new THREE.BoxGeometry(0.5, 1, 0.5);
    antGeo.translate(0, 0.5, 0);
    const antMat = new THREE.MeshLambertMaterial({ color: 0x1c2340 });
    const ants = new THREE.InstancedMesh(antGeo, antMat, antCount);
    const beaconGeo = new THREE.SphereGeometry(0.5, 8, 8);
    const beacons = new THREE.InstancedMesh(beaconGeo, this.beaconMat, antCount);
    for (let i = 0; i < antCount; i++) {
      const b = tallBoxes[i % tallBoxes.length];
      const ah = 5 + rnd() * 9;
      const ox = (rnd() - 0.5) * b.hx;
      const oz = (rnd() - 0.5) * b.hz;
      m.makeScale(1, ah, 1);
      m.setPosition(b.cx + ox, b.top, b.cz + oz);
      ants.setMatrixAt(i, m);
      m.makeScale(1, 1, 1);
      m.setPosition(b.cx + ox, b.top + ah + 0.4, b.cz + oz);
      beacons.setMatrixAt(i, m);
    }
    ants.instanceMatrix.needsUpdate = true;
    beacons.instanceMatrix.needsUpdate = true;
    this.group.add(ants, beacons);

    // ---- street lamps ----
    const lamps: THREE.Vector3[] = [];
    for (const sx of STREET_LINES) {
      for (let z = -320; z <= 320; z += 80) if (rnd() < 0.7) lamps.push(new THREE.Vector3(sx + 8.5, 0, z));
    }
    const poleGeo = new THREE.CylinderGeometry(0.14, 0.18, 7, 6);
    poleGeo.translate(0, 3.5, 0);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x252c4d });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, lamps.length);
    const headGeo = new THREE.SphereGeometry(0.42, 8, 8);
    const headMat = new THREE.MeshBasicMaterial({ color: 0x9ff0ff });
    const heads = new THREE.InstancedMesh(headGeo, headMat, lamps.length);
    lamps.forEach((lp, i) => {
      m.makeScale(1, 1, 1);
      m.setPosition(lp.x, 0, lp.z);
      poles.setMatrixAt(i, m);
      m.setPosition(lp.x, 7.1, lp.z);
      heads.setMatrixAt(i, m);
    });
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    this.group.add(poles, heads);

    // ---- ground / sky / stars / moon ----
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), new THREE.MeshLambertMaterial({ map: groundTexture() }));
    ground.rotation.x = -Math.PI / 2;
    this.group.add(ground);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color("#04071c") },
          midColor: { value: new THREE.Color("#1b1e4e") },
          glowColor: { value: new THREE.Color("#ff5c7a") },
        },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          uniform vec3 topColor; uniform vec3 midColor; uniform vec3 glowColor; varying vec3 vDir;
          void main(){
            float h = clamp(vDir.y, -0.1, 1.0);
            vec3 c = mix(midColor, topColor, pow(clamp(h * 1.4, 0.0, 1.0), 0.6));
            c += glowColor * exp(-abs(h - 0.02) * 7.0) * 0.4;
            gl_FragColor = vec4(c, 1.0);
          }`,
      })
    );
    this.group.add(sky);

    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(550 * 3);
    for (let i = 0; i < 550; i++) {
      const th = rnd() * Math.PI * 2;
      const ph = rnd() * Math.PI * 0.46;
      const r = 1380;
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = r * Math.cos(ph) + 30;
      starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    this.group.add(
      new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbfd9ff, size: 1.7, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }))
    );

    const moonTex = canvasTex(128, (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
      g.addColorStop(0, "rgba(255,244,214,1)");
      g.addColorStop(0.32, "rgba(255,236,190,0.95)");
      g.addColorStop(0.42, "rgba(255,220,170,0.28)");
      g.addColorStop(1, "rgba(255,220,170,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    });
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, transparent: true }));
    moon.position.set(340, 320, -560);
    moon.scale.setScalar(150);
    this.group.add(moon);

    // ---- pickup spots ----
    const srnd = mulberry(4242);
    for (let i = 0; i < 20; i++) {
      const vertical = i % 2 === 0;
      const street = STREET_LINES[Math.floor(srnd() * STREET_LINES.length)];
      const along = (srnd() * 2 - 1) * 300;
      const y = 13 + srnd() * 30;
      const jitter = (srnd() - 0.5) * 6;
      this.tokenSpots.push(vertical ? new THREE.Vector3(street + jitter, y, along) : new THREE.Vector3(along, y, street + jitter));
    }
    for (let i = 0; i < 70; i++) {
      const street = STREET_LINES[Math.floor(srnd() * STREET_LINES.length)];
      const along = (srnd() * 2 - 1) * 330;
      const vertical = srnd() < 0.5;
      const off = (srnd() - 0.5) * 10;
      this.coinSpots.push(vertical ? new THREE.Vector3(street + off, 1.2, along) : new THREE.Vector3(along, 1.2, street + off));
    }
    for (let i = 0; i < 10; i++) {
      const b = this.boxes[Math.floor(srnd() * this.boxes.length)];
      if (b.y0 !== undefined) continue;
      this.healSpots.push(new THREE.Vector3(b.cx + (srnd() - 0.5) * b.hx, b.top + 1.4, b.cz + (srnd() - 0.5) * b.hz));
    }

    this.buildLandmarks();
  }

  private buildLandmarks() {
    // giant spider statue at the spawn plaza
    const statue = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x2b53d9, emissive: 0x101c4a });
    const body = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 14), mat);
    body.position.y = 7;
    body.scale.set(1, 1.25, 0.9);
    statue.add(body);
    const headM = new THREE.Mesh(new THREE.SphereGeometry(1.8, 14, 12), mat);
    headM.position.set(0, 11, 1.6);
    statue.add(headM);
    const legGeo = new THREE.CylinderGeometry(0.28, 0.16, 9, 6);
    for (let i = 0; i < 8; i++) {
      const leg = new THREE.Mesh(legGeo, mat);
      const side = i < 4 ? -1 : 1;
      const k = i % 4;
      leg.position.set(side * (2.2 + k * 0.3), 5.5, -2.4 + k * 1.6);
      leg.rotation.z = side * (0.7 + k * 0.08);
      leg.rotation.y = side * (k - 1.5) * 0.25;
      statue.add(leg);
    }
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf6fcff });
    for (const ex of [-0.7, 0.7]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.2), eyeMat);
      eye.position.set(ex, 11.3, 3.1);
      statue.add(eye);
    }
    const sign = makeTextSprite("SPIDER-BASE", "#35e0ff", 30, 4.7);
    sign.position.set(0, 15.5, 0);
    statue.add(sign);
    statue.position.set(32, 0, 30);
    this.group.add(statue);

    // Unisphere-style globe in the park corner
    const globe = new THREE.Group();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(13, 20, 16),
      new THREE.MeshBasicMaterial({ color: 0x6a739a, wireframe: true, transparent: true, opacity: 0.6 })
    );
    sphere.position.y = 20;
    globe.add(sphere);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(16, 0.4, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffcf3f, transparent: true, opacity: 0.8 }));
    ring.position.y = 20;
    ring.rotation.x = Math.PI / 2.4;
    globe.add(ring);
    globe.position.set(288, 0, 288);
    this.group.add(globe);

    // UFO hovering mid-map
    const ufo = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, 2.4, 20), new THREE.MeshLambertMaterial({ color: 0x4a5578 }));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0.7 }));
    dome.position.y = 1.2;
    ufo.add(disc, dome);
    for (let i = 0; i < 8; i++) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff4fd8 : 0x52ffa8 }));
      const a = (i / 8) * Math.PI * 2;
      light.position.set(Math.cos(a) * 8.4, -0.6, Math.sin(a) * 8.4);
      ufo.add(light);
    }
    ufo.position.set(-120, 118, 60);
    this.ufo = ufo;
    this.group.add(ufo);
    this.eggSpots.push({ id: "ufo", pos: new THREE.Vector3(-120, 120, 60), r: 14, label: "UFO SPOTTED!" });

    // Tung Tung Tung Sahur — the drum man of the northwest corner
    const tung = new THREE.Group();
    const drumMat = new THREE.MeshToonMaterial({ color: 0x8a5a2c });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.2, 4.4, 14), drumMat);
    drum.position.y = 2.2;
    drum.rotation.z = Math.PI / 2;
    tung.add(drum);
    const skinMat = new THREE.MeshBasicMaterial({ color: 0xf2e2c0 });
    for (const sx of [-2.25, 2.25]) {
      const skin = new THREE.Mesh(new THREE.CircleGeometry(2.2, 14), skinMat);
      skin.position.set(sx, 2.2, 0);
      skin.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      tung.add(skin);
    }
    const stickMat = new THREE.MeshToonMaterial({ color: 0xd9c9a0 });
    for (const skx of [-1.4, 1.4]) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6), stickMat);
      stick.position.set(skx, 4.6, 1.2);
      stick.rotation.x = 0.7;
      tung.add(stick);
    }
    const tungSign = makeTextSprite("TUNG TUNG TUNG SAHUR", "#ffcf3f", 40, 6.2);
    tungSign.position.set(0, 8.5, 0);
    tung.add(tungSign);
    tung.position.set(-320, 0, -320);
    this.tung = tung;
    this.group.add(tung);
    this.eggSpots.push({ id: "tung", pos: new THREE.Vector3(-320, 3, -320), r: 12, label: "TUNG TUNG TUNG SAHUR!" });

    // rooftop billboard secret
    this.eggSpots.push({ id: "billboard", pos: new THREE.Vector3(32, MAX_ROOF + 10, -32), r: 10, label: "BILLBOARD SURFER!" });
  }

  /** Best web anchor: rooftop point ahead+above, else sky anchor. */
  findAnchor(pos: THREE.Vector3, dir: THREE.Vector3): { point: THREE.Vector3; sky: boolean } {
    const desired = new THREE.Vector3().copy(pos).addScaledVector(dir, 27);
    desired.y += 17;
    let best: THREE.Vector3 | null = null;
    let bestScore = Infinity;
    const cand = new THREE.Vector3();
    const toCand = new THREE.Vector3();
    for (const b of this.boxes) {
      const dx = b.cx - pos.x;
      const dz = b.cz - pos.z;
      if (dx * dx + dz * dz > 95 * 95) continue;
      cand.set(
        THREE.MathUtils.clamp(desired.x, b.cx - b.hx, b.cx + b.hx),
        b.top + 0.6,
        THREE.MathUtils.clamp(desired.z, b.cz - b.hz, b.cz + b.hz)
      );
      let s = cand.distanceToSquared(desired);
      toCand.copy(cand).sub(pos);
      if (toCand.dot(dir) < 0) s += 2600;
      if (cand.y < pos.y - 4) s += 400;
      if (s < bestScore) {
        bestScore = s;
        best = cand.clone();
      }
    }
    if (best === null || best.distanceTo(pos) > 80) {
      const skyA = new THREE.Vector3().copy(pos).addScaledVector(dir, 30);
      skyA.y = Math.max(pos.y + 14, Math.min(skyA.y + 16, pos.y + 46));
      return { point: skyA, sky: true };
    }
    return { point: best, sky: false };
  }
}
