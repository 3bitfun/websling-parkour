import * as THREE from "three";

export interface Box {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  top: number;
  /** bottom of the solid volume (skybridges float; towers start at 0) */
  y0?: number;
}

export interface EggSpot {
  id: string;
  pos: THREE.Vector3;
  r: number;
  label: string;
}

export interface AnchorHit {
  point: THREE.Vector3;
  sky: boolean;
}

const GRID = 9; // 9x9 blocks
const SPACING = 64;
const PAD = 44; // building pad width inside a block
export const WORLD_SPAN = ((GRID - 1) / 2) * SPACING; // 256
export const MAX_ROOF = 66;
export const STREET_LINES = [-224, -160, -96, -32, 32, 96, 160, 224];
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
    // tile spans one city block; streets live on tile edges
    c.fillStyle = "#171c33";
    c.fillRect(0, 0, s, s);
    const rnd = mulberry(31);
    for (let i = 0; i < 240; i++) {
      c.fillStyle = rnd() < 0.5 ? "#131830" : "#1c2240";
      c.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
    // building pad
    const pad = (PAD / SPACING) * s;
    const off = (s - pad) / 2;
    c.fillStyle = "#0c1124";
    c.fillRect(off, off, pad, pad);
    c.strokeStyle = "#232b52";
    c.lineWidth = 2;
    c.strokeRect(off, off, pad, pad);
    // lane dashes along street centers (tile edges -> draw at 0 and s)
    c.fillStyle = "rgba(230,190,80,0.55)";
    for (let y = 4; y < s; y += 14) {
      c.fillRect(0, y, 2.4, 7);
      c.fillRect(s - 1.2, y, 1.2, 7);
      c.fillRect(y, 0, 7, 2.4);
      c.fillRect(y, s - 1.2, 7, 1.2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1600 / SPACING, 1600 / SPACING);
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
    // faux glyphs
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

export class City {
  group = new THREE.Group();
  boxes: Box[] = [];
  tokenSpots: THREE.Vector3[] = [];
  coinSpots: THREE.Vector3[] = [];
  healSpots: THREE.Vector3[] = [];
  eggs: EggSpot[] = [];
  ufo: THREE.Group | null = null;
  spawn = new THREE.Vector3(32, 0, 14);
  beaconMat: THREE.MeshBasicMaterial;

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
        const centerDist = Math.max(Math.abs(cx), Math.abs(cz));
        const tall = centerDist < 100 ? 26 : centerDist < 180 ? 10 : -8;
        if (rnd() < 0.3) {
          // twin towers
          const splitX = rnd() < 0.5;
          for (let k = 0; k < 2; k++) {
            const w = PAD / 2 - 2;
            const h = Math.min(MAX_ROOF, Math.max(14, 20 + rnd() * 34 + tall));
            const bx = splitX ? cx + (k === 0 ? -PAD / 4 - 1 : PAD / 4 + 1) : cx;
            const bz = splitX ? cz : cz + (k === 0 ? -PAD / 4 - 1 : PAD / 4 + 1);
            this.boxes.push({
              cx: bx,
              cz: bz,
              hx: splitX ? w / 2 + 1 : PAD / 2 - 1,
              hz: splitX ? PAD / 2 - 1 : w / 2 + 1,
              top: h,
            });
          }
        } else {
          const h = Math.min(MAX_ROOF, Math.max(12, 18 + rnd() * 40 + tall));
          const hx = PAD / 2 - 1 - rnd() * 4;
          const hz = PAD / 2 - 1 - rnd() * 4;
          this.boxes.push({ cx, cz, hx, hz, top: h });
        }
      }
    }

    // ---- skybridges: connect the two tallest towers in each quadrant ----
    const quad = (sx: number, sz: number) =>
      this.boxes
        .filter((b) => Math.sign(b.cx || 1) === sx && Math.sign(b.cz || 1) === sz && b.top > 30)
        .sort((a, b) => b.top - a.top)
        .slice(0, 2);
    const bridgePairs: Box[][] = [quad(-1, -1), quad(-1, 1), quad(1, -1), quad(1, 1)].filter((p) => p.length === 2);
    for (const [a, b] of bridgePairs) {
      const hb = Math.min(a.top, b.top) - 3.5;
      const y0 = hb - 0.7;
      // L-shaped two-segment bridge via the corner (a.cx, b.cz)
      const seg1: Box = {
        cx: (a.cx + b.cx) / 2,
        cz: a.cz,
        hx: Math.abs(b.cx - a.cx) / 2 + 1,
        hz: 2.6,
        top: hb + 1.1,
        y0,
      };
      const seg2: Box = {
        cx: b.cx,
        cz: (a.cz + b.cz) / 2,
        hx: 2.6,
        hz: Math.abs(b.cz - a.cz) / 2 + 1,
        top: hb + 1.1,
        y0,
      };
      this.boxes.push(seg1, seg2);
    }

    // ---- instanced towers ----
    const winTex = windowTexture();
    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    bGeo.translate(0, 0.5, 0);
    const bMat = new THREE.MeshLambertMaterial({
      map: winTex,
      emissiveMap: winTex,
      emissive: new THREE.Color(0xffc873),
      emissiveIntensity: 0.75,
    });
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const tints = ["#2b3a6e", "#3a2f66", "#27476b", "#33315e", "#233a5e", "#3d2b55"];
    const towerBoxes = this.boxes.filter((b) => b.y0 === undefined);
    const bridgeBoxes = this.boxes.filter((b) => b.y0 !== undefined);

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

    // skybridges: plain dark hull with a neon underslung strip
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
    const tallBoxes = this.boxes.filter((b) => b.top > 30);
    const signCount = Math.min(30, tallBoxes.length);
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
      if (face === 0) {
        p.set(b.cx, y, b.cz + b.hz + 0.35);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
      } else if (face === 1) {
        p.set(b.cx, y, b.cz - b.hz - 0.35);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      } else if (face === 2) {
        p.set(b.cx + b.hx + 0.35, y, b.cz);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      } else {
        p.set(b.cx - b.hx - 0.35, y, b.cz);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
      }
      sc.set(w, h, 1);
      m.compose(p, q, sc);
      signs.setMatrixAt(i, m);
      col.set(neons[Math.floor(rnd() * neons.length)]);
      signs.setColorAt(i, col);
    }
    signs.instanceMatrix.needsUpdate = true;
    if (signs.instanceColor) signs.instanceColor.needsUpdate = true;
    this.group.add(signs);

    // ---- antennas + red beacons ----
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

    // ---- water tanks ----
    const tankCount = 26;
    const tankGeo = new THREE.CylinderGeometry(1.7, 1.9, 3.4, 10);
    tankGeo.translate(0, 1.7, 0);
    const tankMat = new THREE.MeshLambertMaterial({ color: 0x4a3b52 });
    const tanks = new THREE.InstancedMesh(tankGeo, tankMat, tankCount);
    for (let i = 0; i < tankCount; i++) {
      const b = this.boxes[Math.floor(rnd() * this.boxes.length)];
      m.makeScale(1, 1, 1);
      m.setPosition(b.cx + (rnd() - 0.5) * b.hx, b.top, b.cz + (rnd() - 0.5) * b.hz);
      tanks.setMatrixAt(i, m);
    }
    tanks.instanceMatrix.needsUpdate = true;
    this.group.add(tanks);

    // ---- street lamps ----
    const lamps: THREE.Vector3[] = [];
    const streets = STREET_LINES;
    for (const sx of streets) {
      for (let z = -240; z <= 240; z += 80) {
        if (rnd() < 0.7) lamps.push(new THREE.Vector3(sx + 8.5, 0, z));
      }
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
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshLambertMaterial({ map: groundTexture() })
    );
    ground.rotation.x = -Math.PI / 2;
    this.group.add(ground);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color("#04071c") },
          midColor: { value: new THREE.Color("#1b1e4e") },
          glowColor: { value: new THREE.Color("#ff5c7a") },
        },
        vertexShader: `
          varying vec3 vDir;
          void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
        `,
        fragmentShader: `
          uniform vec3 topColor; uniform vec3 midColor; uniform vec3 glowColor;
          varying vec3 vDir;
          void main(){
            float h = clamp(vDir.y, -0.1, 1.0);
            vec3 col = mix(midColor, topColor, pow(clamp(h * 1.4, 0.0, 1.0), 0.6));
            float band = exp(-abs(h - 0.02) * 7.0);
            col += glowColor * band * 0.4;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    );
    this.group.add(sky);

    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(550 * 3);
    for (let i = 0; i < 550; i++) {
      const th = rnd() * Math.PI * 2;
      const ph = rnd() * Math.PI * 0.46;
      const r = 840;
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = r * Math.cos(ph) + 30;
      starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xbfd9ff, size: 1.7, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })
    );
    this.group.add(stars);

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

    // ---- token spots: arcs above the streets ----
    const srnd = mulberry(4242);
    for (let i = 0; i < 20; i++) {
      const vertical = i % 2 === 0;
      const street = streets[Math.floor(srnd() * streets.length)];
      const along = (srnd() * 2 - 1) * 230;
      const y = 13 + srnd() * 30;
      const jitter = (srnd() - 0.5) * 6;
      this.tokenSpots.push(
        vertical ? new THREE.Vector3(street + jitter, y, along) : new THREE.Vector3(along, y, street + jitter)
      );
    }

    // ---- coin spots: street-level trails + rooftop stashes ----
    const crnd = mulberry(9001);
    for (let i = 0; i < 50; i++) {
      const street = STREET_LINES[Math.floor(crnd() * STREET_LINES.length)];
      const along = (crnd() * 2 - 1) * 240;
      const j = (crnd() - 0.5) * 7;
      this.coinSpots.push(
        crnd() < 0.5 ? new THREE.Vector3(street + j, 1.6, along) : new THREE.Vector3(along, 1.6, street + j)
      );
    }
    const roofBoxes = this.boxes.filter((b) => b.y0 === undefined && b.top > 16);
    for (let i = 0; i < 30; i++) {
      const b = roofBoxes[Math.floor(crnd() * roofBoxes.length)];
      this.coinSpots.push(new THREE.Vector3(b.cx + (crnd() - 0.5) * b.hx, b.top + 2, b.cz + (crnd() - 0.5) * b.hz));
      if (i < 12) {
        this.healSpots.push(new THREE.Vector3(b.cx - (crnd() - 0.5) * b.hx, b.top + 1.4, b.cz - (crnd() - 0.5) * b.hz));
      }
    }

    // ---- landmark: the BIG SPIDER on the tallest tower ----
    const tallest = [...towerBoxes].sort((a, b) => b.top - a.top)[0];
    if (tallest) {
      const sp = new THREE.Group();
      const redM = new THREE.MeshLambertMaterial({ color: 0xe6273a, emissive: 0x40101a });
      const darkM = new THREE.MeshLambertMaterial({ color: 0x141833 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(4.2, 16, 14), redM);
      body.scale.set(1, 0.82, 1.25);
      body.position.y = 5.5;
      const headM = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 14), redM);
      headM.position.set(0, 8.6, 4.4);
      const eyeM = new THREE.MeshBasicMaterial({ color: 0xf4fbff });
      const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), eyeM);
      e1.scale.set(0.7, 1.2, 0.5);
      e1.position.set(-1, 9, 6.6);
      const e2 = e1.clone();
      e2.position.x = 1;
      sp.add(body, headM, e1, e2);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7, 0.7), darkM);
        leg.position.set(Math.cos(a) * 5.5, 3.2, Math.sin(a) * 5.5);
        leg.rotation.z = Math.cos(a) * 0.55;
        leg.rotation.x = -Math.sin(a) * 0.55;
        sp.add(leg);
      }
      sp.position.set(tallest.cx, tallest.top, tallest.cz);
      sp.rotation.y = 0.6;
      this.group.add(sp);
      this.eggs.push({ id: "spider", pos: new THREE.Vector3(tallest.cx, tallest.top + 13, tallest.cz), r: 14, label: "THE BIG SPIDER" });
    }

    // ---- landmark: UFO hovering in the northwest sky ----
    {
      const ufo = new THREE.Group();
      const hull = new THREE.Mesh(
        new THREE.CylinderGeometry(7, 13, 3.4, 24),
        new THREE.MeshLambertMaterial({ color: 0x8d93a8, emissive: 0x11141f })
      );
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(5, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x7ef0ff, transparent: true, opacity: 0.6 })
      );
      dome.position.y = 1.6;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(3, 9, 26, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x52ffa8, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
      );
      beam.position.y = -14.6;
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffcf3f });
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), k % 2 ? ringMat : new THREE.MeshBasicMaterial({ color: 0xff2438 }));
        bulb.position.set(Math.cos(a) * 11, -0.6, Math.sin(a) * 11);
        ufo.add(bulb);
      }
      ufo.add(hull, dome, beam);
      ufo.position.set(-236, 118, -236);
      this.ufo = ufo;
      this.group.add(ufo);
      this.eggs.push({ id: "ufo", pos: new THREE.Vector3(-236, 116, -236), r: 24, label: "UNIDENTIFIED SWINGING OBJECT" });
    }

    // ---- landmark: giant rubber duck on an eastern roof ----
    const duckRoof = roofBoxes.find((b) => b.cx > 60 && b.cz > -40 && b.cz < 80 && b.top > 20 && b.top < 46) ?? roofBoxes[3];
    if (duckRoof) {
      const duck = new THREE.Group();
      const yM = new THREE.MeshLambertMaterial({ color: 0xffcf3f, emissive: 0x2a2005 });
      const oM = new THREE.MeshLambertMaterial({ color: 0xff9d2e });
      const bodyD = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 14), yM);
      bodyD.scale.set(1, 0.8, 1.3);
      bodyD.position.y = 3.6;
      const headD = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 14), yM);
      headD.position.set(0, 9, 3.4);
      const beak = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 2.6), oM);
      beak.position.set(0, 8.6, 6.4);
      const eyeDM = new THREE.MeshBasicMaterial({ color: 0x0d1024 });
      const de1 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), eyeDM);
      de1.position.set(-1.5, 10.2, 5.4);
      const de2 = de1.clone();
      de2.position.x = 1.5;
      duck.add(bodyD, headD, beak, de1, de2);
      duck.position.set(duckRoof.cx, duckRoof.top, duckRoof.cz);
      duck.rotation.y = -0.8;
      this.group.add(duck);
      this.eggs.push({ id: "duck", pos: new THREE.Vector3(duckRoof.cx, duckRoof.top + 12, duckRoof.cz), r: 12, label: "RUBBER DUCKIE SUPREMACY" });
    }

    // ---- landmark: TUNG TUNG TUNG SAHUR, guardian of the far corner ----
    {
      const tung = new THREE.Group();
      const wood = new THREE.MeshLambertMaterial({ color: 0x9c6b3f, emissive: 0x1c0f06 });
      const woodDark = new THREE.MeshLambertMaterial({ color: 0x6e4a2b });
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(12, 1.6, 12), new THREE.MeshLambertMaterial({ color: 0x1b2242, emissive: 0x35e0ff, emissiveIntensity: 0.25 }));
      pedestal.position.y = 0.8;
      const torsoT = new THREE.Mesh(new THREE.BoxGeometry(3.4, 10, 2.4), wood);
      torsoT.position.y = 6.8;
      const headT = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 12), wood);
      headT.scale.set(1, 1.15, 1);
      headT.position.y = 13.6;
      const eyeT = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const pupilT = new THREE.MeshBasicMaterial({ color: 0x0d1024 });
      const tw1 = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), eyeT);
      tw1.position.set(-0.9, 14.2, 1.9);
      const tw2 = tw1.clone();
      tw2.position.x = 0.9;
      const tp1 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), pupilT);
      tp1.position.set(-0.9, 14.2, 2.5);
      const tp2 = tp1.clone();
      tp2.position.x = 0.9;
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.4), pupilT);
      mouth.position.set(0, 12.6, 2.2);
      const armL = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 1), woodDark);
      armL.position.set(-2.6, 8.4, 0.6);
      armL.rotation.z = 0.5;
      const armR = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 1), woodDark);
      armR.position.set(2.8, 9.6, 1.2);
      armR.rotation.z = -1.1;
      const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 7, 10), woodDark);
      bat.position.set(4.6, 12, 1.6);
      bat.rotation.z = -0.5;
      const legL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.4, 1.2), woodDark);
      legL.position.set(-1, 1.9, 0);
      const legR = legL.clone();
      legR.position.x = 1;
      tung.add(pedestal, torsoT, headT, tw1, tw2, tp1, tp2, mouth, armL, armR, bat, legL, legR);
      tung.position.set(246, 0, 246);
      tung.rotation.y = -2.3;
      this.group.add(tung);
      const label = makeTextSprite("TUNG TUNG TUNG SAHUR");
      label.position.set(246, 21, 246);
      this.group.add(label);
      this.eggs.push({ id: "tung", pos: new THREE.Vector3(246, 8, 246), r: 18, label: "TUNG TUNG TUNG SAHUR" });
    }
  }

  /** Best web anchor: closest rooftop point to a desired point ahead+above, else sky anchor. */
  findAnchor(pos: THREE.Vector3, dir: THREE.Vector3): AnchorHit {
    const desired = new THREE.Vector3().copy(pos).addScaledVector(dir, 27);
    desired.y += 17;
    let best: THREE.Vector3 | null = null;
    let bestScore = Infinity;
    const cand = new THREE.Vector3();
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
      const toCand = _v1.copy(cand).sub(pos);
      if (toCand.dot(dir) < 0) s += 2600;
      if (cand.y < pos.y - 4) s += 400;
      if (s < bestScore) {
        bestScore = s;
        best = cand.clone();
      }
    }
    const far = best === null || best.distanceTo(pos) > 80;
    if (far) {
      const sky = new THREE.Vector3().copy(pos).addScaledVector(dir, 30);
      sky.y = Math.max(pos.y + 14, Math.min(sky.y + 16, pos.y + 46));
      return { point: sky, sky: true };
    }
    return { point: best!, sky: false };
  }
}

const _v1 = new THREE.Vector3();

function makeTextSprite(text: string): THREE.Sprite {
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
  c.fillStyle = "#ffcf3f";
  c.fillText(text, 512, 84);
  const tex = new THREE.CanvasTexture(cv);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
  sprite.scale.set(46, 7.2, 1);
  return sprite;
}
