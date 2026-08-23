import * as THREE from "three";

/** Classic R6 blocky character rig (Roblox proportions: 5-stud figure). */
export interface Rig {
  group: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
}

export interface RigStyle {
  head: number;
  torso: number;
  arms: number;
  legs: number;
  headTex?: THREE.Texture | null;
  torsoTex?: THREE.Texture | null;
}

/* ---------- shared resources ---------- */

const S = 0.42; // 1 stud in meters

let gradientMap: THREE.DataTexture | null = null;
function getGradient(): THREE.DataTexture {
  if (!gradientMap) {
    const data = new Uint8Array([70, 70, 70, 255, 140, 140, 140, 255, 255, 255, 255, 255]);
    gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

export function toonMat(color: number, map?: THREE.Texture | null): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    map: map ?? undefined,
    gradientMap: getGradient(),
  });
}

const geoHead = new THREE.BoxGeometry(1.2 * S, 1.2 * S, 1.2 * S);
const geoTorso = new THREE.BoxGeometry(2 * S, 2 * S, 1 * S);
const geoArm = new THREE.BoxGeometry(1 * S, 2 * S, 1 * S);
const geoLeg = new THREE.BoxGeometry(1 * S, 2 * S, 1 * S);

/* ---------- canvas textures ---------- */

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  draw(cv.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.anisotropy = 2;
  return t;
}

function webLines(c: CanvasRenderingContext2D, s: number, step: number, color: string) {
  c.strokeStyle = color;
  c.lineWidth = Math.max(1.5, s / 64);
  for (let i = 0; i <= s; i += step) {
    c.beginPath();
    c.moveTo(i, 0);
    c.lineTo(i, s);
    c.stroke();
    c.beginPath();
    c.moveTo(0, i);
    c.lineTo(s, i);
    c.stroke();
  }
}

let _spiderHead: THREE.Texture | null = null;
export function spiderHeadTex(): THREE.Texture {
  if (_spiderHead) return _spiderHead;
  _spiderHead = canvasTex(128, (c, s) => {
    c.fillStyle = "#e6273a";
    c.fillRect(0, 0, s, s);
    webLines(c, s, 14, "rgba(20,8,14,0.65)");
    // big white lenses (front face)
    c.fillStyle = "#f4fbff";
    c.save();
    c.translate(s * 0.3, s * 0.46);
    c.rotate(-0.32);
    c.beginPath();
    c.ellipse(0, 0, s * 0.155, s * 0.21, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.save();
    c.translate(s * 0.7, s * 0.46);
    c.rotate(0.32);
    c.beginPath();
    c.ellipse(0, 0, s * 0.155, s * 0.21, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.strokeStyle = "rgba(10,10,20,0.8)";
    c.lineWidth = 3;
    c.save();
    c.translate(s * 0.3, s * 0.46);
    c.rotate(-0.32);
    c.beginPath();
    c.ellipse(0, 0, s * 0.155, s * 0.21, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    c.save();
    c.translate(s * 0.7, s * 0.46);
    c.rotate(0.32);
    c.beginPath();
    c.ellipse(0, 0, s * 0.155, s * 0.21, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  });
  return _spiderHead;
}

let _spiderTorso: THREE.Texture | null = null;
export function spiderTorsoTex(): THREE.Texture {
  if (_spiderTorso) return _spiderTorso;
  _spiderTorso = canvasTex(128, (c, s) => {
    c.fillStyle = "#2447c9";
    c.fillRect(0, 0, s, s);
    webLines(c, s, 15, "rgba(8,10,30,0.55)");
    // spider emblem
    c.fillStyle = "#0d1024";
    const cx = s / 2;
    const cy = s * 0.42;
    c.beginPath();
    c.ellipse(cx, cy, s * 0.05, s * 0.09, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(cx, cy - s * 0.1, s * 0.035, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#0d1024";
    c.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const a = -0.9 + i * 0.6;
      c.beginPath();
      c.moveTo(cx, cy);
      c.quadraticCurveTo(cx + Math.cos(a) * s * 0.14, cy + Math.sin(a) * s * 0.1 - s * 0.05, cx + Math.cos(a) * s * 0.22, cy + Math.sin(a) * s * 0.2);
      c.stroke();
      c.beginPath();
      c.moveTo(cx, cy);
      c.quadraticCurveTo(cx - Math.cos(a) * s * 0.14, cy + Math.sin(a) * s * 0.1 - s * 0.05, cx - Math.cos(a) * s * 0.22, cy + Math.sin(a) * s * 0.2);
      c.stroke();
    }
    // red side panels
    c.fillStyle = "#e6273a";
    c.fillRect(0, 0, s * 0.08, s);
    c.fillRect(s * 0.92, 0, s * 0.08, s);
  });
  return _spiderTorso;
}

let _civFace: THREE.Texture | null = null;
export function civFaceTex(): THREE.Texture {
  if (_civFace) return _civFace;
  _civFace = canvasTex(64, (c, s) => {
    c.clearRect(0, 0, s, s);
    c.fillStyle = "rgba(15,12,18,0.95)";
    c.beginPath();
    c.arc(s * 0.34, s * 0.42, s * 0.055, 0, Math.PI * 2);
    c.arc(s * 0.66, s * 0.42, s * 0.055, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(15,12,18,0.9)";
    c.lineWidth = s * 0.045;
    c.lineCap = "round";
    c.beginPath();
    c.arc(s * 0.5, s * 0.56, s * 0.16, 0.25, Math.PI - 0.25);
    c.stroke();
  });
  return _civFace;
}

let _thugFace: THREE.Texture | null = null;
export function thugFaceTex(): THREE.Texture {
  if (_thugFace) return _thugFace;
  _thugFace = canvasTex(64, (c, s) => {
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, s, s);
    // angry glowing eyes
    c.fillStyle = "#ff2438";
    c.save();
    c.translate(s * 0.33, s * 0.44);
    c.rotate(0.35);
    c.fillRect(-s * 0.11, -s * 0.035, s * 0.22, s * 0.07);
    c.restore();
    c.save();
    c.translate(s * 0.67, s * 0.44);
    c.rotate(-0.35);
    c.fillRect(-s * 0.11, -s * 0.035, s * 0.22, s * 0.07);
    c.restore();
    // scowl
    c.strokeStyle = "#1a1020";
    c.lineWidth = s * 0.05;
    c.lineCap = "round";
    c.beginPath();
    c.arc(s * 0.5, s * 0.78, s * 0.14, Math.PI + 0.35, -0.35);
    c.stroke();
  });
  return _thugFace;
}

/* ---------- styles ---------- */

export function spiderStyle(): RigStyle {
  return {
    head: 0xffffff,
    torso: 0xffffff,
    arms: 0xd21f2e,
    legs: 0xd21f2e,
    headTex: spiderHeadTex(),
    torsoTex: spiderTorsoTex(),
  };
}

export function thugStyle(): RigStyle {
  return {
    head: 0x9aa0b8,
    torso: 0x232733,
    arms: 0x2c3140,
    legs: 0x1b1f2b,
    headTex: thugFaceTex(),
  };
}

const CIV_TORSO = [0x3f8cff, 0xff9d2e, 0x52ffa8, 0xff4fd8, 0xffcf3f, 0x7ee0ff, 0xc084fc, 0xff6b6b];
const CIV_LEGS = [0x2b3350, 0x3a3f55, 0x24304a, 0x4a3b52, 0x20343f];
const CIV_SKIN = [0xffd9b0, 0xe8b48a, 0xc68b59, 0x8d5a3b, 0xf5c9a0];

export function civStyle(rnd: () => number): RigStyle {
  return {
    head: CIV_SKIN[Math.floor(rnd() * CIV_SKIN.length)],
    torso: CIV_TORSO[Math.floor(rnd() * CIV_TORSO.length)],
    arms: CIV_SKIN[Math.floor(rnd() * CIV_SKIN.length)],
    legs: CIV_LEGS[Math.floor(rnd() * CIV_LEGS.length)],
    headTex: civFaceTex(),
  };
}

/* ---------- builder ---------- */

export function buildR6Rig(style: RigStyle): Rig {
  const g = new THREE.Group();

  const headMat = toonMat(style.head, style.headTex ?? null);
  const torsoMat = toonMat(style.torso, style.torsoTex ?? null);
  const armMat = toonMat(style.arms);
  const legMat = toonMat(style.legs);

  const torso = new THREE.Mesh(geoTorso, torsoMat);
  torso.position.y = 3 * S; // studs 2..4

  const head = new THREE.Mesh(geoHead, headMat);
  head.position.y = 4.6 * S; // studs 4..5.2

  const limb = (geo: THREE.BoxGeometry, mat: THREE.Material) => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -S; // hang one limb-length below the pivot
    pivot.add(mesh);
    return pivot;
  };

  const armL = limb(geoArm, armMat);
  armL.position.set(-1.5 * S, 4 * S, 0);
  const armR = limb(geoArm, armMat);
  armR.position.set(1.5 * S, 4 * S, 0);
  const legL = limb(geoLeg, legMat);
  legL.position.set(-0.5 * S, 2 * S, 0);
  const legR = limb(geoLeg, legMat);
  legR.position.set(0.5 * S, 2 * S, 0);

  g.add(torso, head, armL, armR, legL, legR);
  return { group: g, head, torso, armL, armR, legL, legR };
}

export const R6_HEIGHT = 5.2 * S; // ~2.18 m
