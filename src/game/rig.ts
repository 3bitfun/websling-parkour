import * as THREE from "three";

/** Classic R6 blocky character rig (Roblox proportions). */
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
  /** lens color for the spider eyes; defaults to white */
  eye?: number;
  headTex?: THREE.Texture | null;
  torsoTex?: THREE.Texture | null;
  armTex?: THREE.Texture | null;
  spider?: boolean;
  /** small blocky hat / cap color */
  cap?: number | null;
}

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d")!;
  draw(c);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Spider mask: big white eyes + faint webbing on a red head. */
function spiderHeadTex() {
  return canvasTex(128, 128, (c) => {
    c.fillStyle = "#e6273a";
    c.fillRect(0, 0, 128, 128);
    // webbing
    c.strokeStyle = "rgba(60,8,16,0.55)";
    c.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      c.beginPath();
      c.moveTo(i * 16, 0);
      c.lineTo(i * 16, 128);
      c.stroke();
    }
    for (let j = 0; j <= 8; j++) {
      c.beginPath();
      c.moveTo(0, j * 16);
      c.quadraticCurveTo(64, j * 16 - 8, 128, j * 16);
      c.stroke();
    }
    // eyes (front face is the last quarter of a box UV wrap: x 96..128)
    for (const ex of [102, 118]) {
      c.fillStyle = "#0a0f22";
      c.beginPath();
      c.ellipse(ex, 56, 11, 17, ex < 110 ? -0.25 : 0.25, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#f6fcff";
      c.beginPath();
      c.ellipse(ex, 56, 8, 14, ex < 110 ? -0.25 : 0.25, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/** Spider torso: blue with red chest panel + black spider emblem. */
function spiderTorsoTex() {
  return canvasTex(128, 128, (c) => {
    c.fillStyle = "#2b53d9";
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = "#e6273a";
    c.fillRect(96, 8, 32, 40);
    // spider emblem on front (x 96..128)
    c.fillStyle = "#0a0f22";
    c.beginPath();
    c.ellipse(112, 30, 5, 8, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(112, 19, 3.4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#0a0f22";
    c.lineWidth = 2.4;
    c.lineCap = "round";
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(112 + s * 3, 22 + i * 5);
        c.quadraticCurveTo(112 + s * 11, 20 + i * 5, 112 + s * 13, 12 + i * 7);
        c.stroke();
      }
    }
  });
}

function spiderArmTex() {
  return canvasTex(64, 128, (c) => {
    c.fillStyle = "#e6273a";
    c.fillRect(0, 0, 64, 128);
    c.strokeStyle = "rgba(60,8,16,0.5)";
    c.lineWidth = 2;
    for (let j = 0; j <= 8; j++) {
      c.beginPath();
      c.moveTo(0, j * 16);
      c.quadraticCurveTo(32, j * 16 - 6, 64, j * 16);
      c.stroke();
    }
    c.fillStyle = "#2b53d9";
    c.fillRect(0, 96, 64, 32);
  });
}

/** Plain blocky face for civilians / dealers. */
function faceTex(skin: number, smile = true) {
  const hex = `#${skin.toString(16).padStart(6, "0")}`;
  return canvasTex(128, 128, (c) => {
    c.fillStyle = hex;
    c.fillRect(0, 0, 128, 128);
    // front face = x 96..128
    c.fillStyle = "#171a2e";
    c.fillRect(101, 48, 6, 12);
    c.fillRect(117, 48, 6, 12);
    if (smile) {
      c.strokeStyle = "#171a2e";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(112, 66, 8, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
    } else {
      c.fillStyle = "#171a2e";
      c.fillRect(105, 72, 14, 3);
    }
  });
}

export function spiderStyle(): RigStyle {
  return {
    head: 0xe6273a,
    torso: 0x2b53d9,
    arms: 0xe6273a,
    legs: 0x2b53d9,
    eye: 0xf6fcff,
    headTex: spiderHeadTex(),
    torsoTex: spiderTorsoTex(),
    armTex: spiderArmTex(),
    spider: true,
  };
}

const CIV_SKINS = [0xf2c99a, 0xc98e5a, 0x8a5a34, 0xf7dcc0, 0xa9713f];
const CIV_SHIRTS = [0x3f7f5f, 0x7f4f9f, 0x9f6f2f, 0x2f6f9f, 0x9f3f4f, 0x4f4f8f, 0xb0b6cc];
const CIV_PANTS = [0x2e3350, 0x3a3f5e, 0x27304a, 0x494f6e];

export function civilianStyle(r: () => number): RigStyle {
  return {
    head: CIV_SKINS[Math.floor(r() * CIV_SKINS.length)],
    torso: CIV_SHIRTS[Math.floor(r() * CIV_SHIRTS.length)],
    arms: CIV_SHIRTS[Math.floor(r() * CIV_SHIRTS.length)],
    legs: CIV_PANTS[Math.floor(r() * CIV_PANTS.length)],
    headTex: faceTex(CIV_SKINS[Math.floor(r() * CIV_SKINS.length)]),
    cap: r() < 0.35 ? [0xff2438, 0x35e0ff, 0xffcf3f, 0x232b52][Math.floor(r() * 4)] : null,
  };
}

export function thugStyle(gangColor: number): RigStyle {
  return {
    head: 0xd9b48a,
    torso: gangColor,
    arms: 0x33374a,
    legs: 0x23263a,
    headTex: faceTex(0xd9b48a, false),
    cap: 0x11131f,
  };
}

export function buildR6Rig(style: RigStyle): Rig {
  const S = 0.42; // stud scale
  const group = new THREE.Group();

  const grad = (() => {
    const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
    const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  })();
  const toon = (color: number, tex: THREE.Texture | null | undefined) =>
    new THREE.MeshToonMaterial(tex ? { color, gradientMap: grad, map: tex } : { color, gradientMap: grad });

  // torso 2x2x1 studs
  const torso = new THREE.Mesh(new THREE.BoxGeometry(2 * S, 2 * S, 1 * S), toon(style.torso, style.torsoTex));
  torso.position.y = 3 * S;
  group.add(torso);

  // head 1.2 studs, sits on top
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.2 * S, 1.2 * S, 1.2 * S), toon(style.head, style.headTex));
  head.position.y = 4.6 * S;
  group.add(head);

  if (style.cap) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3 * S, 0.35 * S, 1.3 * S), toon(style.cap, null));
    cap.position.y = 5.3 * S;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(1.2 * S, 0.12 * S, 0.55 * S), toon(style.cap, null));
    brim.position.set(0, 5.16 * S, 0.72 * S);
    group.add(cap, brim);
  }

  // spider: 3D eye lenses on the front of the mask
  if (style.spider) {
    const eyeMat = new THREE.MeshBasicMaterial({ color: style.eye ?? 0xf6fcff });
    const eyeGeo = new THREE.BoxGeometry(0.34 * S, 0.62 * S, 0.06 * S);
    for (const ex of [-0.26 * S, 0.26 * S]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(ex, 4.66 * S, 0.62 * S);
      eye.rotation.z = ex < 0 ? 0.22 : -0.22;
      group.add(eye);
    }
  }

  const limb = (w: number, h: number, mat: THREE.Material, x: number, y: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  };

  const armMat = toon(style.arms, style.armTex);
  const legMat = toon(style.legs, null);
  const armL = limb(1 * S, 2 * S, armMat, -1.5 * S, 4 * S);
  const armR = limb(1 * S, 2 * S, armMat, 1.5 * S, 4 * S);
  const legL = limb(1 * S, 2 * S, legMat, -0.5 * S, 2 * S);
  const legR = limb(1 * S, 2 * S, legMat, 0.5 * S, 2 * S);

  // blocky shoes
  const shoeMat = toon(0x171a2e, null);
  for (const leg of [legL, legR]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(1.05 * S, 0.4 * S, 1.35 * S), shoeMat);
    shoe.position.set(0, -1.95 * S, 0.12 * S);
    leg.add(shoe);
  }

  return { group, head, torso, armL, armR, legL, legR };
}

export function disposeRig(rig: Rig) {
  rig.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      const mmt = mesh.material;
      if (Array.isArray(mmt)) mmt.forEach((x) => x.dispose());
      else (mmt as THREE.Material).dispose();
    }
  });
}
