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
  /** Wrap texture applied to every head face (e.g. spider webbing). */
  headTex?: THREE.Texture | null;
  /** Transparent face overlay applied to the FRONT head face only (civ/thug). */
  faceTex?: THREE.Texture | null;
  /** Wrap texture for the torso (spider webbing). */
  torsoTex?: THREE.Texture | null;
  /** Wrap texture for the arms (spider webbing). */
  armTex?: THREE.Texture | null;
  /** Spider: adds 3D white eye lenses + a chest emblem. */
  spider?: boolean;
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

export function toonMat(color: number, map?: THREE.Texture | null, transparent = false): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    map: map ?? undefined,
    gradientMap: getGradient(),
    transparent,
    alphaTest: transparent ? 0.05 : 0,
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

function webGrid(c: CanvasRenderingContext2D, s: number, step: number, color: string) {
  c.strokeStyle = color;
  c.lineWidth = Math.max(1.5, s / 72);
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

let _redWeb: THREE.Texture | null = null;
export function redWebTex(): THREE.Texture {
  if (_redWeb) return _redWeb;
  _redWeb = canvasTex(128, (c, s) => {
    c.fillStyle = "#d81f30";
    c.fillRect(0, 0, s, s);
    webGrid(c, s, 13, "rgba(40,4,12,0.6)");
  });
  return _redWeb;
}

let _blueWeb: THREE.Texture | null = null;
export function blueWebTex(): THREE.Texture {
  if (_blueWeb) return _blueWeb;
  _blueWeb = canvasTex(128, (c, s) => {
    c.fillStyle = "#2040b8";
    c.fillRect(0, 0, s, s);
    webGrid(c, s, 15, "rgba(6,10,40,0.55)");
  });
  return _blueWeb;
}

/** Transparent black spider emblem for the chest plane. */
let _emblem: THREE.Texture | null = null;
export function spiderEmblemTex(): THREE.Texture {
  if (_emblem) return _emblem;
  _emblem = canvasTex(128, (c, s) => {
    c.clearRect(0, 0, s, s);
    const cx = s / 2;
    const cy = s * 0.46;
    c.fillStyle = "#0b0e20";
    c.strokeStyle = "#0b0e20";
    c.lineWidth = s * 0.045;
    c.lineCap = "round";
    // legs
    for (let i = 0; i < 4; i++) {
      const a = -1.1 + i * 0.72;
      const lx = Math.cos(a) * s * 0.3;
      const ly = Math.sin(a) * s * 0.26 - s * 0.04;
      c.beginPath();
      c.moveTo(cx, cy);
      c.quadraticCurveTo(cx + lx * 0.5, cy + ly - s * 0.1, cx + lx, cy + ly);
      c.stroke();
      c.beginPath();
      c.moveTo(cx, cy);
      c.quadraticCurveTo(cx - lx * 0.5, cy + ly - s * 0.1, cx - lx, cy + ly);
      c.stroke();
    }
    // body + head
    c.beginPath();
    c.ellipse(cx, cy + s * 0.05, s * 0.09, s * 0.16, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(cx, cy - s * 0.13, s * 0.07, 0, Math.PI * 2);
    c.fill();
  });
  return _emblem;
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
    c.fillStyle = "#e8e8f0";
    c.fillRect(0, 0, s, s);
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
    arms: 0xffffff,
    legs: 0x2743b0,
    headTex: redWebTex(),
    torsoTex: blueWebTex(),
    armTex: redWebTex(),
    spider: true,
  };
}

export function thugStyle(gang?: { torso: number; arms: number; legs: number }): RigStyle {
  return {
    head: 0xffffff,
    torso: gang?.torso ?? 0x232733,
    arms: gang?.arms ?? 0x2c3140,
    legs: gang?.legs ?? 0x1b1f2b,
    faceTex: thugFaceTex(),
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
    faceTex: civFaceTex(),
  };
}

/* ---------- builder ---------- */

const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf6fcff });
const emblemGeo = new THREE.PlaneGeometry(0.62 * S * 2, 0.72 * S * 2);
let emblemMat: THREE.MeshBasicMaterial | null = null;
function getEmblemMat(): THREE.MeshBasicMaterial {
  if (!emblemMat)
    emblemMat = new THREE.MeshBasicMaterial({ map: spiderEmblemTex(), transparent: true, alphaTest: 0.1, depthWrite: false });
  return emblemMat;
}

export function buildR6Rig(style: RigStyle): Rig {
  const g = new THREE.Group();

  const torsoMat = toonMat(style.torso, style.torsoTex ?? null);
  const armMat = toonMat(style.arms, style.armTex ?? null);
  const legMat = toonMat(style.legs);

  const torso = new THREE.Mesh(geoTorso, torsoMat);
  torso.position.y = 3 * S; // studs 2..4

  // Head: single wrap material, or a 6-material box with the face on the front (+z).
  let head: THREE.Mesh;
  if (style.faceTex) {
    const base = toonMat(style.head);
    const front = toonMat(style.head, style.faceTex, true);
    head = new THREE.Mesh(geoHead, [base, base, base, base, front, base]);
  } else {
    head = new THREE.Mesh(geoHead, toonMat(style.head, style.headTex ?? null));
  }
  head.position.y = 4.6 * S; // studs 4..5.2

  // Spider: 3D white eye lenses on the front of the mask.
  if (style.spider) {
    const eyeGeo = new THREE.BoxGeometry(0.34 * S, 0.62 * S, 0.06 * S);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.3 * S, 4.66 * S, 0.62 * S);
    eyeL.rotation.z = 0.42;
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.3 * S, 4.66 * S, 0.62 * S);
    eyeR.rotation.z = -0.42;
    const emblem = new THREE.Mesh(emblemGeo, getEmblemMat());
    emblem.position.set(0, 3.25 * S, 0.52 * S);
    g.add(eyeL, eyeR, emblem);
  }

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
