import * as THREE from "three";
import { City, makeTextSprite, MAX_ROOF, type Box, type EggSpot } from "./world";
import { Sfx } from "./audio";
import { buildR6Rig, disposeRig, spiderStyle, type Rig, type RigStyle } from "./rig";
import { Crowd, type PunchEvent } from "./npcs";
import { PowerSpawner, POWERS, type PowerDef, type PowerMove } from "./powers";
import {
  Market,
  DEALERS,
  UPGRADES,
  upgradePrice,
  HEAL_PRICE,
  SODA_PRICE,
  HEAL_AMOUNT,
  type DealerSnapshot,
  type Rarity,
} from "./dealers";
import { RARITY } from "./dealers";
import { loadCash, saveCash, syncCash, loadUpgrades, saveUpgrades, syncUpgrades } from "./backend";
import { POST_VERT, POST_FRAG } from "./post";

export type Phase = "menu" | "playing" | "paused" | "won" | "lost";
export type Mode = "free" | "solo";

export interface AnchorPip {
  x: number;
  y: number;
  sky: boolean;
}

export interface PowerHud {
  name: string;
  rarity: Rarity;
  color: string;
  glow: string;
  energy: number;
  maxEnergy: number;
  moves: { key: string; name: string; cd: number; maxCd: number; cost: number }[];
}

export interface HudData {
  score: number;
  combo: number;
  time: number;
  tokens: number;
  tokensTotal: number;
  speed: number;
  alt: number;
  attached: boolean;
  muted: boolean;
  anchor: AnchorPip | null;
  mode: Mode;
  hp: number;
  maxHp: number;
  cash: number;
  power: PowerHud | null;
  powerPip: { x: number; y: number; glow: string; name: string } | null;
  dealerNear: string | null;
  punchCombo: number;
}

export interface PopupData {
  id: number;
  x: number;
  y: number;
  text: string;
  kind: "gold" | "red" | "cyan" | "cash";
}

export interface RunStats {
  score: number;
  tokens: number;
  maxCombo: number;
  bestSwing: number;
  timeLeft: number;
  mode: Mode;
  ko: boolean;
  thugsDown: number;
}

export interface EngineCallbacks {
  onHud: (h: HudData) => void;
  onPopup: (p: PopupData) => void;
  onPhase: (phase: Phase, stats: RunStats | null) => void;
  onShop: (s: DealerSnapshot | null) => void;
  onToast: (msg: string) => void;
}

const R = 0.95;
const GRAV = 30;
const RUN_TIME = 120;
const GOAL = 20;
const STEP = 1 / 120;

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _u = new THREE.Vector3();
const _r = new THREE.Vector3();
const _n = new THREE.Vector3();

function rayBoxT(o: THREE.Vector3, d: THREE.Vector3, b: Box): number {
  const ex = b.hx + 0.4;
  const ez = b.hz + 0.4;
  let tmin = 0;
  let tmax = Infinity;
  for (const axis of ["x", "y", "z"] as const) {
    const oA = o[axis];
    const dA = d[axis];
    let lo: number;
    let hi: number;
    if (axis === "y") {
      lo = b.y0 ?? 0;
      hi = b.top;
    } else if (axis === "x") {
      lo = b.cx - ex;
      hi = b.cx + ex;
    } else {
      lo = b.cz - ez;
      hi = b.cz + ez;
    }
    if (Math.abs(dA) < 1e-9) {
      if (oA < lo || oA > hi) return -1;
    } else {
      let t1 = (lo - oA) / dA;
      let t2 = (hi - oA) / dA;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

/* ---------------- pooled particles ---------------- */
class Particles {
  private points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private n: number;
  private cursor = 0;

  constructor(scene: THREE.Scene, n = 700) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -9999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({ size: 0.42, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(p: THREE.Vector3, count: number, colors: string[], speed = 6, lifeS = 0.5, sizeMul = 2) {
    const c = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      this.vel[i * 3 + 1] = Math.cos(ph) * sp * 0.8 + speed * 0.25;
      this.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      c.set(colors[Math.floor(Math.random() * colors.length)]);
      this.col[i * 3] = c.r;
      this.col[i * 3 + 1] = c.g;
      this.col[i * 3 + 2] = c.b;
      this.life[i] = this.maxLife[i] = lifeS * (0.6 + Math.random() * 0.7);
      this.size[i] = sizeMul;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -9999;
        continue;
      }
      this.vel[i * 3 + 1] -= 14 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

/* ================================================================ */

export class Engine {
  private canvas: HTMLCanvasElement;
  private cbs: EngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private city: City;
  private sfx = new Sfx();
  private particles: Particles;
  private crowd: Crowd;
  private powerSpawner: PowerSpawner;
  private market = new Market();

  phase: Phase = "menu";
  private mode: Mode = "free";
  private disposed = false;
  private raf = 0;
  private last = performance.now();
  private elapsed = 0;
  private acc = 0;

  // player
  private playerRoot = new THREE.Group();
  private player!: THREE.Group;
  private rig!: Rig;
  private pos = new THREE.Vector3(32, R + 0.1, 14);
  private vel = new THREE.Vector3();
  private grounded = true;
  private yaw = 0;
  private pitch = 0.22;
  private locked = false;
  private keys = new Set<string>();
  private mouseWeb = false;
  private glideHeld = false;
  private slideHeld = false;
  private braking = false;

  // touch input (mobile)
  private touchMove = { x: 0, y: 0 };
  private touchWeb = false;
  private touchGlide = false;
  private touchSlide = false;

  // swing
  private attached = false;
  private anchor = new THREE.Vector3();
  private ropeLen = 10;
  private attachT = 0;
  private swingFrom = new THREE.Vector3();
  private cooldown = 0;
  private refireT = 0;
  private touchGroundDuringSwing = false;
  private bestSwing = 0;

  // parkour
  private jumpBufT = 0;
  private jumpCut = false;
  private coyoteT = 0;
  private sliding = false;
  private slideT = 0;
  private slideCool = 0;
  private gliding = false;
  private dashCd = 0;
  private dashT = 0;
  private climbing = false;
  private wallN = new THREE.Vector3();
  private touchWallT = 0;
  private touchWallN = new THREE.Vector3();

  // animation
  private gaitPhase = 0;
  private climbPhase = 0;
  private landSquashT = 0;
  private jumpStretchT = 0;
  private flinchT = 0;
  private attackAnim = 0;
  private hitFlash = 0;
  private punchCooldown = 0;
  private punchArmSide: "L" | "R" = "R";
  private trickAnimT = 0;
  private trickAnimType: "flip" | "spin" = "flip";
  private trickCount = 0;
  private trickAirTime = 0;

  // camera
  private shake = 0;
  private fov = 72;
  private camLook = new THREE.Vector3();
  private camDist = 9;
  private camRoll = 0;
  private fovPunch = 0;

  // comic post-processing (ink outlines + screentone)
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private rt!: THREE.WebGLRenderTarget;
  private postMat!: THREE.ShaderMaterial;
  private slowmoMix = 0;

  // combat
  private punches: PunchEvent[] = [];
  private hp = 100;
  private invulnT = 0;
  private comboT = 0;
  private comboCount = 0;
  private swingHitCd = 0;
  private ko = false;
  private thugsDown = 0;

  // powers
  private currentPower: PowerDef | null = null;
  private powerCd: Record<string, number> = {};
  private energy = 100;
  private maxEnergy = 100;
  private buddhaT = 0;
  private buddhaS = 0;
  private smokeT = 0;
  private powerProjectiles: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; def: PowerDef; move: PowerMove }[] = [];
  private pendingBlasts: { pos: THREE.Vector3; t: number; delay: number; def: PowerDef; move: PowerMove }[] = [];
  private powerFx: { obj: THREE.Object3D; life: number; maxLife: number }[] = [];
  private powerAura: THREE.Sprite | null = null;

  // economy
  private wallet = 0;
  private upgrades: Record<string, number> = {};
  private maxHp = 100;
  private dmgMul = 1;
  private swingBonus = 0;
  private dashCdMul = 1;
  private energyRegen = 14;

  // run state
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private time = RUN_TIME;
  private collected = 0;
  private countdown = 0;

  // world objects
  private tokens: { group: THREE.Group; baseY: number; phase: number; active: boolean; respawn: number }[] = [];
  private glowTex: THREE.Texture;
  private webLine!: THREE.Line;
  private webGlow!: THREE.Line;
  private aimLine!: THREE.Line;
  private blob!: THREE.Mesh;
  private blobMat!: THREE.MeshBasicMaterial;
  private glider!: THREE.Group;
  private gliderS = 0;
  private webShots: { p: THREE.Vector3; v: THREE.Vector3; life: number; mesh: THREE.Mesh; line: THREE.Line }[] = [];
  private webShotGeo = new THREE.SphereGeometry(0.22, 8, 8);
  private webShotCd = 0;

  // dealers
  private dealerRigs: { rig: Rig; group: THREE.Group; idx: number }[] = [];
  private nearDealerIdx = -1;
  shopOpen = false;
  private shopIdx = 0;

  // easter eggs
  private eggsFound = new Set<string>();
  private eggScanT = 0;

  private popupId = 0;
  private trailAcc = 0;
  private currentAnchor: { point: THREE.Vector3; sky: boolean } | null = null;

  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseUp: (e: MouseEvent) => void;
  private onCtx: (e: Event) => void;
  private onLockChange: () => void;
  private onResize: () => void;

  constructor(canvas: HTMLCanvasElement, cbs: EngineCallbacks) {
    this.canvas = canvas;
    this.cbs = cbs;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2400);
    this.camera.position.set(32, 6, 30);
    this.scene.fog = new THREE.FogExp2(0x0a0f2a, 0.0016);

    this.scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a1430, 1.05));
    const dir = new THREE.DirectionalLight(0xfff0d8, 1.15);
    dir.position.set(120, 200, -80);
    this.scene.add(dir);

    this.city = new City();
    this.scene.add(this.city.group);
    this.buildPost();

    this.glowTex = this.makeGlowTexture();
    this.particles = new Particles(this.scene);
    this.crowd = new Crowd(this.scene, this.city);
    this.powerSpawner = new PowerSpawner(this.scene, this.glowTex, 7);

    this.buildPlayer();
    this.buildWebLines();
    this.buildTokens();
    this.buildDealers();
    this.loadPersistence();

    this.onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.rt.setSize(size.x, size.y);
      (this.postMat.uniforms.uRes.value as THREE.Vector2).set(size.x, size.y);
      this.postMat.uniforms.uAspect.value = size.x / size.y;
    };
    this.onKeyDown = (e) => this.keyDown(e);
    this.onKeyUp = (e) => {
      this.keys.delete(e.code);
      if (e.code === "Space") this.jumpCut = true;
      if (e.code === "ControlLeft" || e.code === "ControlRight" || e.code === "KeyC") this.slideHeld = false;
      if (e.code === "KeyE") this.glideHeld = false;
    };
    this.onMouseMove = (e) => {
      if (!this.locked || this.phase !== "playing") return;
      this.yaw -= e.movementX * 0.0023;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0021, -1.25, 1.35);
    };
    this.onMouseDown = (e) => {
      if (this.phase !== "playing" || this.shopOpen) return;
      if (e.button === 0) {
        this.mouseWeb = true;
        this.refireT = 0;
        this.tryWeb();
      } else if (e.button === 1) {
        e.preventDefault();
        this.tryWebShot();
      } else if (e.button === 2) this.glideHeld = true;
    };
    this.onMouseUp = (e) => {
      if (e.button === 0) {
        this.mouseWeb = false;
        if (this.attached) this.detach(true);
      } else if (e.button === 2) this.glideHeld = false;
    };
    this.onCtx = (e) => e.preventDefault();
    this.onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.phase === "playing" && !this.shopOpen) this.pause();
    };

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("contextmenu", this.onCtx);
    document.addEventListener("pointerlockchange", this.onLockChange);

    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  /* ---------------- setup ---------------- */
  private buildPost() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 4 });
    this.rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.postMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: this.rt.depthTexture },
        uRes: { value: new THREE.Vector2(size.x, size.y) },
        uNear: { value: this.camera.near },
        uFar: { value: this.camera.far },
        uTime: { value: 0 },
        uSpeed: { value: 0 },
        uHit: { value: 0 },
        uSlowmo: { value: 0 },
        uAspect: { value: size.x / size.y },
        uOutline: { value: 1.0 },
        uScreen: { value: 0.46 },
        uDotSize: { value: 3.4 },
      },
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthWrite: false,
      depthTest: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    quad.frustumCulled = false;
    this.postScene.add(quad);
  }

  private makeGlowTexture() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const c = cv.getContext("2d")!;
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.4, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  }

  private buildPlayer() {
    this.rig = buildR6Rig(spiderStyle());
    this.player = this.rig.group;
    this.playerRoot.add(this.player);
    this.scene.add(this.playerRoot);

    this.powerAura = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.powerAura.scale.setScalar(5);
    this.powerAura.position.y = 0.2;
    this.powerAura.visible = false;
    this.playerRoot.add(this.powerAura);

    // web-chute (glide)
    const glider = new THREE.Group();
    const canopyGeo = new THREE.ConeGeometry(1.75, 0.72, 12, 1, true);
    const canopy = new THREE.Mesh(canopyGeo, new THREE.MeshBasicMaterial({ color: 0xaef3ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    const ribs = new THREE.Mesh(canopyGeo, new THREE.MeshBasicMaterial({ color: 0x35e0ff, wireframe: true, transparent: true, opacity: 0.6, depthWrite: false }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.035, 6, 26), new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.85 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.36;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: 0xf2fbff }));
    tip.position.y = 0.36;
    glider.add(canopy, ribs, rim, tip);
    glider.position.y = 2.6;
    glider.scale.setScalar(0.001);
    glider.visible = false;
    this.player.add(glider);
    this.glider = glider;

    // blob shadow
    this.blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20), this.blobMat);
    this.blob.rotation.x = -Math.PI / 2;
    this.scene.add(this.blob);
  }

  private buildWebLines() {
    const mk = (color: number, opacity: number, dashed: boolean) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
      const mat = dashed
        ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 1.1, gapSize: 0.8 })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      this.scene.add(line);
      return line;
    };
    this.webGlow = mk(0x35e0ff, 0.4, false);
    this.webLine = mk(0xf2fbff, 0.95, false);
    this.aimLine = mk(0x35e0ff, 0.32, true);
  }

  private buildTokens() {
    for (const spot of this.city.tokenSpots) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), new THREE.MeshBasicMaterial({ color: 0xffcf3f }));
      const shell = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), new THREE.MeshBasicMaterial({ color: 0xffcf3f, wireframe: true, transparent: true, opacity: 0.5 }));
      g.add(core, shell);
      g.position.copy(spot);
      this.scene.add(g);
      this.tokens.push({ group: g, baseY: spot.y, phase: Math.random() * 7, active: true, respawn: 0 });
    }
  }

  private buildDealers() {
    for (let i = 0; i < DEALERS.length; i++) {
      const d = DEALERS[i];
      const spot = this.city.dealerSpots[i];
      const g = new THREE.Group();

      // counter
      const counter = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.15, 1.5), new THREE.MeshLambertMaterial({ color: 0x3a2b20 }));
      counter.position.y = 0.58;
      g.add(counter);
      const top = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.14, 1.8), new THREE.MeshLambertMaterial({ color: 0x5a4430 }));
      top.position.y = 1.22;
      g.add(top);

      // crates of "merch"
      const crateMat = new THREE.MeshLambertMaterial({ color: 0x2c3140 });
      for (const cx of [-1.3, 0, 1.3]) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), crateMat);
        crate.position.set(cx, 1.55, 0);
        g.add(crate);
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: [0xff5c1f, 0x9ff0ff, 0x7a3cff][Math.floor(Math.random() * 3)] }));
        orb.position.set(cx, 2.0, 0);
        g.add(orb);
      }

      // posts + striped canopy
      const postMat = new THREE.MeshLambertMaterial({ color: 0x252c4d });
      for (const px of [-2.1, 2.1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6), postMat);
        post.position.set(px, 1.7, 0.7);
        g.add(post);
      }
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 2.6), new THREE.MeshLambertMaterial({ color: new THREE.Color(d.canopy).getHex() }));
      canopy.position.set(0, 3.4, 0.2);
      canopy.rotation.x = 0.14;
      g.add(canopy);
      const stripes = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.13, 2.6), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
      stripes.position.set(0, 3.36, 0.2);
      stripes.rotation.x = 0.14;
      stripes.scale.set(0.98, 1, 0.5);
      g.add(stripes);

      // neon sign
      const sign = makeTextSprite(`${d.name}'S DEALS`, d.canopy, 26, 4);
      sign.position.set(0, 4.6, 0.4);
      g.add(sign);

      // ground glow
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(d.canopy).getHex(), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(9);
      glow.position.y = 0.3;
      g.add(glow);

      g.position.set(spot.x, 0, spot.z);
      g.rotation.y = Math.atan2(this.city.spawn.x - spot.x, this.city.spawn.z - spot.z);
      this.scene.add(g);

      // the dealer themself, behind the counter
      const style: RigStyle = {
        head: d.palette.head,
        torso: d.palette.torso,
        arms: d.palette.arms,
        legs: d.palette.legs,
        headTex: null,
        cap: d.palette.cap,
      };
      const rig = buildR6Rig(style);
      rig.group.position.set(spot.x - Math.sin(g.rotation.y) * 1.5, 0, spot.z - Math.cos(g.rotation.y) * 1.5);
      rig.group.rotation.y = g.rotation.y + Math.PI;
      this.scene.add(rig.group);
      this.dealerRigs.push({ rig, group: rig.group, idx: i });
    }
  }

  private loadPersistence() {
    this.wallet = loadCash();
    this.upgrades = loadUpgrades();
    this.applyUpgrades();
    void syncCash(this.wallet).then((w) => {
      this.wallet = w;
    });
    void syncUpgrades(this.upgrades).then((u) => {
      this.upgrades = u;
      this.applyUpgrades();
    });
  }

  private applyUpgrades() {
    const lv = (id: string) => this.upgrades[id] ?? 0;
    this.maxHp = 100 + lv("vitality") * 25;
    this.maxEnergy = 100 + lv("surge") * 25;
    this.energyRegen = 14 * (1 + 0.2 * lv("flow"));
    this.dmgMul = 1 + 0.12 * lv("might");
    this.swingBonus = lv("aero") * 1.5;
    this.dashCdMul = Math.pow(0.88, lv("blink"));
    this.hp = Math.min(this.hp || this.maxHp, this.maxHp);
    if (this.hp <= 0) this.hp = this.maxHp;
  }

  /* ---------------- state machine ---------------- */
  private setPhase(p: Phase) {
    this.phase = p;
    this.cbs.onPhase(p, p === "won" || p === "lost" ? this.stats() : null);
  }

  startRun(mode: Mode) {
    this.sfx.ensure();
    this.mode = mode;
    this.resetRun();
    this.setPhase("playing");
    this.lockPointer();
    this.sfx.ui();
  }

  restartRun() {
    this.startRun(this.mode);
  }

  private resetRun() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.bestSwing = 0;
    this.collected = 0;
    this.time = RUN_TIME;
    this.countdown = 3.0;
    this.ko = false;
    this.thugsDown = 0;
    this.hp = this.maxHp;
    this.energy = this.maxEnergy;
    this.powerCd = {};
    this.buddhaT = 0;
    this.buddhaS = 0;
    this.smokeT = 0;
    this.clearPowerProjectiles();
    this.pendingBlasts.length = 0;
    this.pos.copy(this.city.spawn).setY(R + 0.1);
    this.vel.set(0, 0, 0);
    this.attached = false;
    this.grounded = true;
    this.sliding = false;
    this.gliding = false;
    this.climbing = false;
    this.dashCd = 0;
    this.dashT = 0;
    this.comboCount = 0;
    this.comboT = 0;
    this.trickCount = 0;
    this.trickAnimT = 0;
    this.gaitPhase = 0;
    this.climbPhase = 0;
    this.landSquashT = 0;
    this.jumpStretchT = 0;
    this.flinchT = 0;
    this.attackAnim = 0;
    this.hitFlash = 0;
    this.punchCooldown = 0;
    this.punches.length = 0;
    this.gliderS = 0;
    if (this.glider) this.glider.visible = false;
    this.playerRoot.scale.set(1, 1, 1);
    if (this.player) {
      this.player.rotation.set(0, 0, 0);
      this.rig.torso.rotation.set(0, 0, 0);
      this.rig.head.rotation.set(0, 0, 0);
    }
    this.keys.clear();
    this.mouseWeb = false;
    this.glideHeld = false;
    this.slideHeld = false;
    this.yaw = 0;
    this.pitch = 0.22;
    this.camDist = 9;
    this.camRoll = 0;
    this.fovPunch = 0;
    this.camLook.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
    this.camera.position.set(this.pos.x, this.pos.y + 1.4, this.pos.z + 9);
    this.camera.fov = 72;
    this.camera.updateProjectionMatrix();
    this.playerRoot.visible = true;
    this.webLine.visible = false;
    this.webGlow.visible = false;
    this.aimLine.visible = false;
    this.tokens.forEach((t, i) => {
      t.active = true;
      t.respawn = 0;
      t.group.visible = true;
      t.group.position.copy(this.city.tokenSpots[i]);
    });
    this.crowd.reset();
    this.powerSpawner.reset();
    this.shopOpen = false;
    this.cbs.onShop(null);
  }

  pause() {
    if (this.phase !== "playing") return;
    this.keys.clear();
    this.mouseWeb = false;
    this.glideHeld = false;
    this.slideHeld = false;
    this.setPhase("paused");
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  resume() {
    if (this.phase !== "paused") return;
    this.setPhase("playing");
    this.lockPointer();
  }

  toMenu() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.resetRun();
    this.playerRoot.visible = false;
    this.setPhase("menu");
  }

  toggleMute() {
    this.sfx.ensure();
    this.sfx.setMuted(!this.sfx.muted);
  }

  /* ---------------- touch input (mobile) ---------------- */
  touchLook(dx: number, dy: number) {
    this.yaw -= dx * 0.0044;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.004, -1.25, 1.35);
  }
  setTouchMove(x: number, y: number) {
    const m = Math.hypot(x, y);
    const s = m > 1 ? 1 / m : 1;
    this.touchMove.x = x * s;
    this.touchMove.y = y * s;
  }
  setTouchWeb(on: boolean) {
    const was = this.touchWeb;
    this.touchWeb = on;
    if (on) this.tryWeb();
    else if (was && this.attached) this.detach(true);
  }
  setTouchGlide(on: boolean) {
    this.touchGlide = on;
  }
  setTouchSlide(on: boolean) {
    this.touchSlide = on;
  }
  touchJump() {
    if (this.phase !== "playing") return;
    this.jumpBufT = 0.14;
    if (!this.grounded && this.coyoteT <= 0 && !this.attached && !this.gliding && !this.climbing) this.tryTrick("flip");
  }
  touchDash() {
    this.tryDash();
  }
  touchPunch() {
    this.tryPunch();
  }

  private lockPointer() {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    try {
      this.canvas.requestPointerLock();
    } catch {
      /* unsupported */
    }
  }

  private stats(): RunStats {
    return {
      score: this.score,
      tokens: this.collected,
      maxCombo: this.maxCombo,
      bestSwing: Math.round(this.bestSwing),
      timeLeft: Math.max(0, Math.ceil(this.time)),
      mode: this.mode,
      ko: this.ko,
      thugsDown: this.thugsDown,
    };
  }

  private endRun(goalReached: boolean) {
    const won = this.mode === "solo" ? goalReached : false;
    if (won) this.sfx.win();
    else this.sfx.lose();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.setPhase(won ? "won" : "lost");
  }

  /* ---------------- input ---------------- */
  private keyDown(e: KeyboardEvent) {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.ctrlKey && (e.code === "KeyC" || e.code === "KeyW" || e.code === "KeyR") && this.phase === "playing") e.preventDefault();
    this.keys.add(e.code);

    if (e.code === "KeyM" && !e.repeat) this.toggleMute();

    if (this.phase === "menu" && (e.code === "Enter" || e.code === "Space") && !e.repeat) {
      this.startRun("free");
      return;
    }

    if (this.shopOpen) {
      if ((e.code === "KeyT" || e.code === "Escape") && !e.repeat) this.closeShop();
      return;
    }

    if (this.phase === "playing") {
      if (e.code === "Space" && !e.repeat) {
        this.jumpBufT = 0.14;
        if (!this.grounded && this.coyoteT <= 0 && !this.attached && !this.gliding && !this.climbing) this.tryTrick("flip");
      }
      if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !e.repeat) {
        if (!this.grounded && !this.attached && !this.gliding && !this.climbing) this.tryTrick("spin");
      }
      if (e.code === "KeyQ" && !e.repeat) {
        if (this.attached) this.detach(true);
        else this.tryWeb();
      }
      if (e.code === "ControlLeft" || e.code === "ControlRight" || (e.code === "KeyC" && !this.currentPower)) {
        this.slideHeld = true;
      }
      if (e.code === "KeyF" && !e.repeat) this.tryDash();
      if (e.code === "KeyE") this.glideHeld = true;
      if (e.code === "KeyT" && !e.repeat && this.nearDealerIdx >= 0) this.openShop(this.nearDealerIdx);

      if (this.currentPower) {
        if (e.code === "KeyZ" && !e.repeat) this.castPower(0);
        if (e.code === "KeyX" && !e.repeat) this.castPower(1);
        if (e.code === "KeyC" && !e.repeat) this.castPower(2);
        if (e.code === "KeyV" && !e.repeat) this.castPower(3);
        if (e.code === "KeyB" && !e.repeat) this.tryPunch();
      } else {
        if ((e.code === "KeyV" || e.code === "KeyB") && !e.repeat) this.tryPunch();
      }
    }

    if (e.code === "KeyP" && !e.repeat) {
      if (this.phase === "playing") this.pause();
      else if (this.phase === "paused") this.resume();
    }
    if (e.code === "KeyR" && this.phase === "playing" && !e.repeat) {
      this.pos.copy(this.city.spawn).setY(R + 0.1);
      this.vel.set(0, 0, 0);
      this.attached = false;
      this.climbing = false;
      this.camera.position.set(this.pos.x, this.pos.y + 1.4, this.pos.z + 9);
      this.camLook.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
    }
  }

  /* ---------------- web ---------------- */
  private aimDir(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  private tryWeb() {
    if (this.phase !== "playing" || this.countdown > 0 || this.attached || this.cooldown > 0) return;
    const dir = this.aimDir(new THREE.Vector3());
    const hit = this.city.findAnchor(this.pos, dir);
    this.anchor.copy(hit.point);
    const d = this.pos.distanceTo(this.anchor);
    this.ropeLen = THREE.MathUtils.clamp(d * 0.97, 7, 58);
    this.attached = true;
    if (this.climbing) {
      this.climbing = false;
      this.vel.addScaledVector(this.wallN, 4);
    }
    this.attachT = 0;
    this.touchGroundDuringSwing = false;
    this.swingFrom.copy(this.pos);
    this.cooldown = 0.1;
    this.fovPunch = Math.max(this.fovPunch, 2.5);
    this.sfx.thwip();
    this.particles.burst(hit.point, 8, ["#f2fbff", "#aef3ff"], 4, 0.35, 1.6);
  }

  private detach(byUser: boolean) {
    if (!this.attached) return;
    this.attached = false;
    this.cooldown = 0.12;
    const swingDist = this.pos.distanceTo(this.swingFrom);
    if (swingDist > this.bestSwing) this.bestSwing = swingDist;
    if (swingDist > 18) {
      const bonus = Math.round(swingDist * 3) * Math.max(1, this.combo);
      this.score += bonus;
      this.popupAt(_v.set(this.pos.x, this.pos.y + 1.6, this.pos.z), `BIG SWING +${bonus}`, "gold");
    }
    if (byUser) {
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.vel.addScaledVector(fwd, 1.6);
      this.vel.y += 1.1;
      this.fovPunch = Math.max(this.fovPunch, 2.5);
    }
    this.sfx.release();
  }

  private tryWebShot() {
    if (this.phase !== "playing" || this.countdown > 0 || this.webShotCd > 0) return;
    this.webShotCd = 0.22;
    const dir = this.aimDir(new THREE.Vector3());
    const origin = new THREE.Vector3().copy(this.pos);
    origin.y += 0.9;
    origin.addScaledVector(dir, 0.9);
    const mesh = new THREE.Mesh(this.webShotGeo, new THREE.MeshBasicMaterial({ color: 0xf6fcff }));
    mesh.position.copy(origin);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.9 }));
    line.frustumCulled = false;
    this.scene.add(mesh, line);
    this.webShots.push({ p: origin, v: dir.multiplyScalar(48).addScaledVector(this.vel, 0.35), life: 1.05, mesh, line });
    this.sfx.webShot();
    this.attackAnim = 1;
    this.punchArmSide = "R";
    this.particles.burst(origin, 6, ["#f2fbff", "#aef3ff"], 3, 0.3, 1.4);
  }

  private updateWebShots(dt: number) {
    const hand = _v.copy(this.pos);
    hand.y += 0.9;
    for (let i = this.webShots.length - 1; i >= 0; i--) {
      const s = this.webShots[i];
      s.life -= dt;
      s.v.y -= 7 * dt;
      s.p.addScaledVector(s.v, dt);
      let done = false;
      let hit = false;
      if (this.crowd.webAt(s.p.x, s.p.y, s.p.z)) {
        done = true;
        hit = true;
      } else if (s.p.y < 0.15) done = true;
      else {
        for (const b of this.city.boxes) {
          if (s.p.x > b.cx - b.hx && s.p.x < b.cx + b.hx && s.p.z > b.cz - b.hz && s.p.z < b.cz + b.hz && s.p.y > (b.y0 ?? 0) && s.p.y < b.top) {
            done = true;
            break;
          }
        }
      }
      if (done || s.life <= 0) {
        if (hit) {
          this.sfx.webImpact();
          this.particles.burst(s.p, 16, ["#f2fbff", "#ffffff", "#aef3ff"], 6, 0.5, 2);
          this.popupAt(s.p.clone(), "WEBBED", "cyan");
        }
        this.scene.remove(s.mesh, s.line);
        (s.mesh.material as THREE.Material).dispose();
        (s.line.material as THREE.Material).dispose();
        s.line.geometry.dispose();
        this.webShots.splice(i, 1);
        continue;
      }
      s.mesh.position.copy(s.p);
      const arr = s.line.geometry.attributes.position as THREE.BufferAttribute;
      arr.setXYZ(0, hand.x, hand.y, hand.z);
      arr.setXYZ(1, s.p.x, s.p.y, s.p.z);
      arr.needsUpdate = true;
    }
  }

  private clearWebShots() {
    for (const s of this.webShots) {
      this.scene.remove(s.mesh, s.line);
      (s.mesh.material as THREE.Material).dispose();
      (s.line.material as THREE.Material).dispose();
      s.line.geometry.dispose();
    }
    this.webShots.length = 0;
  }

  /* ---------------- parkour actions ---------------- */
  private tryDash() {
    if (this.phase !== "playing" || this.countdown > 0 || this.dashCd > 0) return;
    const fwdH = _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rightH = _t.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const dir = new THREE.Vector3();
    if (this.keys.has("KeyW")) dir.add(fwdH);
    if (this.keys.has("KeyS")) dir.sub(fwdH);
    if (this.keys.has("KeyD")) dir.add(rightH);
    if (this.keys.has("KeyA")) dir.sub(rightH);
    if (dir.lengthSq() === 0) dir.copy(fwdH);
    dir.normalize();
    this.vel.x = dir.x * 34;
    this.vel.z = dir.z * 34;
    if (this.grounded) this.vel.y = Math.max(this.vel.y, 2.4);
    this.sliding = false;
    this.dashCd = 0.9 * this.dashCdMul;
    this.dashT = 0.18;
    this.fovPunch = Math.max(this.fovPunch, 4.5);
    this.shake = Math.min(1, this.shake + 0.18);
    this.sfx.dash();
    this.particles.burst(this.pos, 16, ["#aef3ff", "#35e0ff", "#ffffff"], 9, 0.42, 3);
    this.popupAt(_v.set(this.pos.x, this.pos.y + 1.2, this.pos.z), "DASH!", "cyan");
  }

  private tryTrick(type: "flip" | "spin") {
    if (this.trickAnimT > 0 || this.countdown > 0) return;
    this.trickAnimType = type;
    this.trickAnimT = 0.5;
    this.trickCount++;
    const pts = 120 * this.trickCount;
    this.score += pts;
    this.sfx.flip();
    this.particles.burst(this.pos, 10, type === "flip" ? ["#aef3ff", "#ffffff"] : ["#ff4fd8", "#ffffff"], 6, 0.45, 2);
    this.popupAt(_v.set(this.pos.x, this.pos.y + 1.6, this.pos.z), `${type === "flip" ? "FLIP" : "SPIN"} +${pts}`, "cyan");
    if (this.trickCount === 3 && this.slowmoT <= 0) {
      this.slowmoT = 1.25;
      this.sfx.slowmo();
      this.popupAt(_v.set(this.pos.x, this.pos.y + 2.6, this.pos.z), "SLOW-MO STYLE!", "gold");
    }
  }

  private slowmoT = 0;
  private timeScale = 1;

  private landTricks() {
    if (this.trickCount > 0) {
      if (this.trickCount >= 2) {
        const bank = 200 * this.trickCount;
        this.score += bank;
        this.popupAt(_v.set(this.pos.x, this.pos.y + 1.8, this.pos.z), `TRICK COMBO x${this.trickCount} +${bank}`, "gold");
      }
      this.trickCount = 0;
    }
    this.trickAnimT = 0;
    this.player.rotation.set(0, 0, 0);
    this.trickAirTime = 0;
  }

  /* ---------------- combat ---------------- */
  private tryPunch() {
    if (this.phase !== "playing" || this.countdown > 0 || this.punchCooldown > 0) return;
    this.punchCooldown = 0.34;
    this.attackAnim = 1;
    this.punchArmSide = this.punchArmSide === "R" ? "L" : "R";
    const dir = this.aimDir(new THREE.Vector3());
    const heavy = !this.grounded;
    const dmg = (heavy ? 55 : 32) * this.dmgMul * (this.buddhaT > 0 ? 1.5 : 1);
    this.sfx.punchWhiff();
    this.punches.push({
      x: this.pos.x, y: this.pos.y + 0.3, z: this.pos.z,
      dx: dir.x, dy: dir.y, dz: dir.z,
      dmg, range: heavy ? 4.2 : 3.4, heavy,
    });
  }

  private onPunchHit(heavy: boolean, at: THREE.Vector3) {
    this.comboCount++;
    this.comboT = 2.2;
    const bonus = 40 * Math.min(this.comboCount, 6);
    this.score += bonus;
    this.sfx.punchHit(heavy);
    this.shake = Math.min(1.2, this.shake + (heavy ? 0.4 : 0.22));
    this.fovPunch = Math.max(this.fovPunch, heavy ? 3 : 1.6);
    this.particles.burst(at, heavy ? 18 : 10, ["#ffffff", "#ffcf3f", "#ff2438"], heavy ? 9 : 6, 0.5, 2.6);
    this.popupAt(at, `+${bonus}`, this.comboCount >= 3 ? "gold" : "cyan");
    if (this.comboCount === 3) this.popupAt(_v.set(at.x, at.y + 1.2, at.z), "COMBO!", "gold");
  }

  private onThugKilled(at: THREE.Vector3) {
    const bounty = 250 * Math.max(1, this.combo);
    this.score += bounty;
    this.thugsDown++;
    const cashDrop = 40 + Math.floor(Math.random() * 50);
    this.addCash(cashDrop);
    this.popupAt(at, `+${bounty} BOUNTY`, "gold");
    this.popupAt(_v.set(at.x, at.y + 0.4, at.z), `+$${cashDrop}`, "cash");
    this.particles.burst(at, 26, ["#ffcf3f", "#ffffff", "#ff2438"], 11, 1, 3);
    this.hp = Math.min(this.maxHp, this.hp + 6);
  }

  private onSwingHit(points: number, at: THREE.Vector3) {
    this.score += points * 2;
    this.swingHitCd = 0.4;
    this.shake = Math.min(1.2, this.shake + 0.3);
    this.popupAt(at, `SLAM +${points * 2}`, "cyan");
  }

  private damagePlayer(n: number, from: THREE.Vector3) {
    if (this.invulnT > 0 || this.phase !== "playing") return;
    this.hp = Math.max(0, this.hp - n);
    this.invulnT = 0.9;
    this.hitFlash = 1;
    this.flinchT = 1;
    this.shake = Math.min(1.4, this.shake + 0.5);
    this.sfx.hurt();
    const away = _v.set(this.pos.x - from.x, 0, this.pos.z - from.z);
    if (away.lengthSq() > 0.01) away.normalize().multiplyScalar(13);
    else away.set(0, 0, 13);
    this.vel.x += away.x;
    this.vel.z += away.z;
    this.vel.y = Math.max(this.vel.y, 7);
    this.particles.burst(this.pos, 14, ["#ff2438", "#ffffff"], 8, 0.5, 2.6);
    if (this.hp <= 0) {
      if (this.mode === "free") {
        this.hp = this.maxHp;
        this.pos.copy(this.city.spawn).setY(R + 0.1);
        this.vel.set(0, 0, 0);
        this.attached = false;
        this.climbing = false;
        this.popupAt(_v.set(this.pos.x, this.pos.y + 2, this.pos.z), "RESPAWN", "cyan");
      } else {
        this.ko = true;
        this.endRun(false);
      }
    }
  }

  /* ---------------- powers ---------------- */
  private tintColors(def: PowerDef): string[] {
    const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
    return [hex(def.glow), hex(def.color), "#ffffff"];
  }

  private moveCost(m: PowerMove): number {
    if (m.arch === "buff") return 35;
    if (m.arch === "leap") return 12;
    if (m.arch === "jump") return 10;
    return Math.max(8, Math.round(m.dmg * 0.3));
  }

  castPower(idx: number) {
    const f = this.currentPower;
    if (!f || this.phase !== "playing" || this.countdown > 0 || this.shopOpen) return;
    const mv = f.moves[idx];
    if (!mv) return;
    if ((this.powerCd[mv.key] ?? 0) > 0) {
      this.sfx.fizzle();
      return;
    }
    const cost = this.moveCost(mv);
    if (this.energy < cost) {
      this.sfx.fizzle();
      this.popupAt(_v.set(this.pos.x, this.pos.y + 1.6, this.pos.z), "LOW ENERGY", "red");
      return;
    }
    this.energy -= cost;
    this.powerCd[mv.key] = mv.cd;
    this.executePower(mv, f);
  }

  private emitAoe(pos: THREE.Vector3, radius: number, dmg: number, mv: PowerMove, f: PowerDef) {
    this.punches.push({
      x: pos.x, y: pos.y, z: pos.z,
      dx: 0, dy: 0, dz: 0,
      dmg: dmg * this.dmgMul, range: radius, heavy: true,
      aoe: true, freeze: mv.freeze, pull: mv.pull,
      kbForce: mv.pull ? 6 : 11,
      tint: this.tintColors(f),
    });
  }

  private executePower(mv: PowerMove, f: PowerDef) {
    const dir = this.aimDir(new THREE.Vector3());
    const tint = this.tintColors(f);
    const at = _v.set(this.pos.x, this.pos.y + 0.4, this.pos.z);
    this.attackAnim = 1;

    switch (mv.arch) {
      case "burst":
        this.sfx.powerCast();
        this.shake = Math.min(1.2, this.shake + 0.3);
        this.fovPunch = Math.max(this.fovPunch, 2);
        this.particles.burst(at, 26, tint, 9, 0.5, 2.6);
        this.emitAoe(at, mv.radius, mv.dmg, mv, f);
        break;
      case "beam": {
        this.sfx.powerBeam();
        this.fovPunch = Math.max(this.fovPunch, 3);
        const end = at.clone().addScaledVector(dir, 44);
        this.spawnBeamFx(at, end, f);
        this.particles.burst(end, 14, tint, 6, 0.4, 2);
        this.punches.push({
          x: at.x, y: at.y, z: at.z, dx: dir.x, dy: dir.y, dz: dir.z,
          dmg: mv.dmg * this.dmgMul, range: 46, heavy: true,
          freeze: mv.freeze, pull: mv.pull, tint,
        });
        break;
      }
      case "dash":
        this.sfx.powerDash();
        this.vel.x = dir.x * 34;
        this.vel.z = dir.z * 34;
        if (this.grounded) this.vel.y = Math.max(this.vel.y, 3);
        this.fovPunch = Math.max(this.fovPunch, 4.5);
        this.particles.burst(at, 20, tint, 8, 0.5, 2.4);
        this.punches.push({
          x: at.x + dir.x * 3, y: at.y, z: at.z + dir.z * 3,
          dx: dir.x, dy: 0, dz: dir.z,
          dmg: mv.dmg * this.dmgMul, range: 10, heavy: true,
          freeze: mv.freeze, tint,
        });
        break;
      case "projectile":
        this.sfx.powerCast();
        this.spawnPowerProjectile(mv, f, dir);
        break;
      case "blast":
        this.sfx.powerCast();
        this.pendingBlasts.push({ pos: at.clone(), t: 0, delay: 0.42, def: f, move: mv });
        this.spawnRingFx(at, mv.radius, f);
        break;
      case "leap":
        this.sfx.powerDash();
        this.vel.y = 21;
        this.vel.x += dir.x * 17;
        this.vel.z += dir.z * 17;
        this.jumpStretchT = 1;
        this.particles.burst(at, 14, tint, 6, 0.4, 2);
        break;
      case "jump":
        this.sfx.jump();
        this.vel.y = 16.5;
        this.grounded = false;
        this.jumpStretchT = 1;
        this.particles.burst(at, 10, tint, 5, 0.35, 1.8);
        break;
      case "buff":
        if (f.id === "colossus") {
          this.buddhaT = mv.buffT ?? 8;
          this.sfx.powerBlast();
          this.popupAt(_v.set(this.pos.x, this.pos.y + 2.4, this.pos.z), "COLOSSUS FORM", "gold");
          this.shake = Math.min(1.4, this.shake + 0.5);
          this.particles.burst(at, 40, ["#ffd700", "#fff3b0", "#ffffff"], 10, 0.8, 3);
        } else {
          this.smokeT = mv.buffT ?? 3;
          this.invulnT = Math.max(this.invulnT, mv.buffT ?? 3);
          this.sfx.powerCast();
          this.popupAt(_v.set(this.pos.x, this.pos.y + 2.2, this.pos.z), "SMOKE SCREEN", "cyan");
          this.particles.burst(at, 36, ["#9aa3c0", "#dfe5f5", "#6a739a"], 7, 0.9, 3.4);
        }
        break;
    }
  }

  private spawnPowerProjectile(mv: PowerMove, f: PowerDef, dir: THREE.Vector3) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), new THREE.MeshBasicMaterial({ color: f.glow }));
    const origin = new THREE.Vector3().copy(this.pos);
    origin.y += 0.6;
    origin.addScaledVector(dir, 1);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.powerProjectiles.push({ mesh, vel: dir.clone().multiplyScalar(52).addScaledVector(this.vel, 0.3), life: 1.3, def: f, move: mv });
  }

  private spawnBeamFx(from: THREE.Vector3, to: THREE.Vector3, f: PowerDef) {
    const len = from.distanceTo(to);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, len, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: f.glow, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    mesh.position.copy(from.clone().lerp(to, 0.5));
    mesh.lookAt(to);
    mesh.rotateX(Math.PI / 2);
    this.scene.add(mesh);
    this.powerFx.push({ obj: mesh, life: 0.16, maxLife: 0.16 });
  }

  private spawnRingFx(at: THREE.Vector3, radius: number, f: PowerDef) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.85, radius, 40),
      new THREE.MeshBasicMaterial({ color: f.glow, transparent: true, opacity: 0.75, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.3, at.z);
    this.scene.add(mesh);
    this.powerFx.push({ obj: mesh, life: 0.42, maxLife: 0.42 });
  }

  private equipPower(def: PowerDef, source: "wild" | "dealer") {
    const swapped = this.currentPower && this.currentPower.id !== def.id;
    this.currentPower = def;
    this.energy = this.maxEnergy;
    this.powerCd = {};
    this.sfx.powerEat();
    this.shake = Math.min(1, this.shake + 0.25);
    this.particles.burst(_v.set(this.pos.x, this.pos.y + 1, this.pos.z), 44, this.tintColors(def), 11, 0.9, 3);
    const label = swapped ? `SWAPPED → ${def.name.toUpperCase()}` : source === "dealer" ? `${def.name.toUpperCase()} PURCHASED!` : `${def.name.toUpperCase()} EQUIPPED!`;
    this.popupAt(_v.set(this.pos.x, this.pos.y + 2.4, this.pos.z), label, "gold");
    if (this.powerAura) {
      (this.powerAura.material as THREE.SpriteMaterial).color.setHex(def.glow);
      this.powerAura.visible = true;
    }
  }

  private clearPowerProjectiles() {
    for (const s of this.powerProjectiles) {
      this.scene.remove(s.mesh);
      (s.mesh.material as THREE.Material).dispose();
      s.mesh.geometry.dispose();
    }
    this.powerProjectiles.length = 0;
  }

  private updatePowers(dt: number) {
    this.powerSpawner.update(dt, this.elapsed);
    if (this.phase === "playing" && this.countdown <= 0 && !this.shopOpen) {
      const def = this.powerSpawner.tryTake(this.pos, 2.6);
      if (def) this.equipPower(def, "wild");
    }
    this.energy = Math.min(this.maxEnergy, this.energy + this.energyRegen * dt);
    for (const k of Object.keys(this.powerCd)) this.powerCd[k] = Math.max(0, this.powerCd[k] - dt);
    this.buddhaT = Math.max(0, this.buddhaT - dt);
    this.smokeT = Math.max(0, this.smokeT - dt);

    for (let i = this.powerProjectiles.length - 1; i >= 0; i--) {
      const s = this.powerProjectiles[i];
      s.life -= dt;
      s.vel.y -= 6 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const mp = s.mesh.position;
      let boom = s.life <= 0 || mp.y < 0.2;
      if (!boom) {
        for (const b of this.city.boxes) {
          if (mp.x > b.cx - b.hx && mp.x < b.cx + b.hx && mp.z > b.cz - b.hz && mp.z < b.cz + b.hz && mp.y > (b.y0 ?? 0) && mp.y < b.top) {
            boom = true;
            break;
          }
        }
      }
      if (boom) {
        this.sfx.powerBlast();
        this.shake = Math.min(1.2, this.shake + 0.28);
        this.particles.burst(mp, 22, this.tintColors(s.def), 8, 0.5, 2.4);
        this.emitAoe(mp, s.move.radius, s.move.dmg, s.move, s.def);
        this.scene.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        s.mesh.geometry.dispose();
        this.powerProjectiles.splice(i, 1);
      }
    }

    for (let i = this.pendingBlasts.length - 1; i >= 0; i--) {
      const b = this.pendingBlasts[i];
      b.t += dt;
      if (b.t >= b.delay) {
        this.sfx.powerBlast();
        this.shake = Math.min(1.5, this.shake + 0.5);
        this.fovPunch = Math.max(this.fovPunch, 5);
        this.particles.burst(b.pos, 46, this.tintColors(b.def), 13, 0.8, 3.2);
        this.emitAoe(b.pos, b.move.radius, b.move.dmg, b.move, b.def);
        this.pendingBlasts.splice(i, 1);
      }
    }

    for (let i = this.powerFx.length - 1; i >= 0; i--) {
      const fx = this.powerFx[i];
      fx.life -= dt;
      const mtl = (fx.obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mtl.opacity = Math.max(0, (fx.life / fx.maxLife) * 0.9);
      if (fx.life <= 0) {
        this.scene.remove(fx.obj);
        mtl.dispose();
        (fx.obj as THREE.Mesh).geometry.dispose();
        this.powerFx.splice(i, 1);
      }
    }
  }

  /* ---------------- dealers / shop ---------------- */
  private openShop(idx: number) {
    if (this.phase !== "playing") return;
    this.shopOpen = true;
    this.shopIdx = idx;
    this.sfx.ui();
    // free the cursor so the shop overlay is clickable
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.refreshShop();
  }

  closeShop() {
    if (!this.shopOpen) return;
    this.shopOpen = false;
    this.sfx.ui();
    this.cbs.onShop(null);
    this.lockPointer();
  }

  private refreshShop() {
    this.cbs.onShop(this.market.snapshot(this.shopIdx, this.wallet, this.upgrades));
  }

  buy(kind: "power" | "heal" | "soda" | "upgrade", slot: number) {
    if (!this.shopOpen) return;
    const snap = this.market.snapshot(this.shopIdx, this.wallet, this.upgrades);
    const spend = (n: number) => {
      this.wallet -= n;
      saveCash(this.wallet);
    };
    if (kind === "power") {
      const listing = snap.powers[slot];
      if (!listing || listing.sold) return;
      if (this.wallet < listing.price) {
        this.sfx.denied();
        this.cbs.onToast("NOT ENOUGH CASH");
        return;
      }
      this.market.takePower(this.shopIdx, slot);
      spend(listing.price);
      const def = POWERS_BY_ID.get(listing.powerId);
      if (def) this.equipPower(def, "dealer");
      this.sfx.buy();
    } else if (kind === "heal") {
      if (this.wallet < HEAL_PRICE) {
        this.sfx.denied();
        this.cbs.onToast("NOT ENOUGH CASH");
        return;
      }
      spend(HEAL_PRICE);
      this.hp = Math.min(this.maxHp, this.hp + HEAL_AMOUNT);
      this.sfx.buy();
      this.popupAt(_v.set(this.pos.x, this.pos.y + 1.6, this.pos.z), `+${HEAL_AMOUNT} HP`, "cash");
    } else if (kind === "soda") {
      if (this.wallet < SODA_PRICE) {
        this.sfx.denied();
        this.cbs.onToast("NOT ENOUGH CASH");
        return;
      }
      spend(SODA_PRICE);
      this.energy = this.maxEnergy;
      this.sfx.buy();
      this.popupAt(_v.set(this.pos.x, this.pos.y + 1.6, this.pos.z), "FULL ENERGY", "cyan");
    } else if (kind === "upgrade") {
      const u = snap.upgrades[slot];
      if (!u || u.maxed) return;
      if (this.wallet < u.price) {
        this.sfx.denied();
        this.cbs.onToast("NOT ENOUGH CASH");
        return;
      }
      spend(u.price);
      this.upgrades[u.def.id] = (this.upgrades[u.def.id] ?? 0) + 1;
      saveUpgrades(this.upgrades);
      this.applyUpgrades();
      this.hp = this.maxHp;
      this.sfx.buy();
      this.popupAt(_v.set(this.pos.x, this.pos.y + 1.6, this.pos.z), `${u.def.name} LV${this.upgrades[u.def.id]}`, "gold");
    }
    this.refreshShop();
  }

  private addCash(n: number) {
    if (n <= 0) return;
    this.wallet += n;
    saveCash(this.wallet);
  }

  /* ---------------- physics ---------------- */
  private step(h: number) {
    this.jumpBufT = Math.max(0, this.jumpBufT - h);
    this.coyoteT = this.grounded ? 0.12 : Math.max(0, this.coyoteT - h);
    this.slideCool = Math.max(0, this.slideCool - h);
    this.dashCd = Math.max(0, this.dashCd - h);
    this.dashT = Math.max(0, this.dashT - h);
    this.touchWallT = Math.max(0, this.touchWallT - h);

    const fwdH = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rightH = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (this.keys.has("KeyW")) wish.add(fwdH);
    if (this.keys.has("KeyS")) wish.sub(fwdH);
    if (this.keys.has("KeyD")) wish.add(rightH);
    if (this.keys.has("KeyA")) wish.sub(rightH);
    // virtual joystick (touch): up = forward
    wish.addScaledVector(fwdH, -this.touchMove.y);
    wish.addScaledVector(rightH, this.touchMove.x);
    if (wish.lengthSq() > 0) wish.normalize();
    const joyMag = Math.hypot(this.touchMove.x, this.touchMove.y);
    const hs0 = Math.hypot(this.vel.x, this.vel.z);

    // wall climb
    if (this.climbing) {
      this.handleClimb(h, wish, fwdH, rightH);
      return;
    }
    if (!this.grounded && !this.attached && !this.gliding && this.touchWallT > 0) {
      const into = wish.dot(_n.copy(this.touchWallN).multiplyScalar(-1));
      if (into > 0.3) {
        this.climbing = true;
        this.wallN.copy(this.touchWallN);
        this.vel.set(0, 0, 0);
        this.sliding = false;
        this.sfx.webGrab();
        this.particles.burst(this.pos, 10, ["#f2fbff", "#aef3ff"], 4, 0.4, 1.8);
      }
    }

    // slide
    if (this.sliding) {
      this.slideT += h;
      const slideHeld = this.slideHeld || this.touchSlide;
      if (!this.grounded || this.slideT > 1.15 || (!slideHeld && this.slideT > 0.3) || hs0 < 4.5) {
        this.sliding = false;
        this.slideCool = 0.45;
      }
    } else if ((this.slideHeld || this.touchSlide) && this.grounded && this.slideCool <= 0 && hs0 > 8) {
      this.sliding = true;
      this.slideT = 0;
      const boost = 1 + Math.min(0.35, 4 / Math.max(hs0, 1));
      this.vel.x *= boost;
      this.vel.z *= boost;
      this.sfx.slide();
      this.particles.burst(_v.set(this.pos.x, this.pos.y - R + 0.15, this.pos.z), 12, ["#8a93b8", "#aab3d4", "#5b6488"], 5, 0.5, 2);
    }

    // jump
    if (this.jumpBufT > 0 && (this.grounded || this.coyoteT > 0)) {
      this.sliding = false;
      this.vel.y = 14.6;
      this.grounded = false;
      this.coyoteT = 0;
      this.jumpBufT = 0;
      this.jumpStretchT = 1;
      this.sfx.jump();
      this.particles.burst(_v.set(this.pos.x, this.pos.y - R + 0.1, this.pos.z), 7, ["#aef3ff", "#ffffff"], 3.4, 0.35, 1.6);
    }
    if (this.jumpCut) {
      this.jumpCut = false;
      if (this.vel.y > 5 && !this.grounded) this.vel.y *= 0.55;
    }

    // glide
    this.gliding = false;
    const glideHeld = this.glideHeld || this.touchGlide;
    if (glideHeld && !this.grounded) {
      if (this.attached) this.detach(false);
      this.gliding = true;
      this.sliding = false;
      if (this.gliderS < 0.2) this.sfx.glide();
    }

    if (this.grounded) {
      if (glideHeld) {
        const f = Math.exp(-3.4 * h);
        this.vel.x *= f;
        this.vel.z *= f;
      } else if (this.sliding) {
        this.vel.addScaledVector(wish, 11 * h);
        const f = Math.exp(-0.45 * h);
        this.vel.x *= f;
        this.vel.z *= f;
      } else if (this.dashT <= 0) {
        this.vel.addScaledVector(wish, 48 * h);
        const damp = wish.lengthSq() > 0 ? 2.2 : 9;
        this.vel.x *= Math.exp(-damp * h);
        this.vel.z *= Math.exp(-damp * h);
        const cap = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || joyMag > 0.85 ? 26 : 15;
        const hs = Math.hypot(this.vel.x, this.vel.z);
        if (hs > cap) {
          this.vel.x *= cap / hs;
          this.vel.z *= cap / hs;
        }
      }
    } else {
      this.vel.addScaledVector(wish, (this.gliding ? 30 : 21) * h);
      if (this.gliding) {
        const f = Math.exp(-0.85 * h);
        this.vel.x *= f;
        this.vel.z *= f;
        if (this.vel.y < -5.5) this.vel.y = -5.5;
      }
      const hs = Math.hypot(this.vel.x, this.vel.z);
      const cap = this.attached ? 62 + this.swingBonus : this.dashT > 0 ? 70 : 55;
      if (hs > cap) {
        this.vel.x *= cap / hs;
        this.vel.z *= cap / hs;
      }
    }

    if (this.attached) {
      this.attachT += h;
      this.ropeLen = Math.max(7, this.ropeLen - 6.5 * h);
      this.vel.addScaledVector(fwdH, 23 * h);
    }

    this.vel.y -= GRAV * h;
    this.pos.addScaledVector(this.vel, h);

    // rope constraint
    if (this.attached) {
      const rope = _v.subVectors(this.pos, this.anchor);
      const d = rope.length();
      if (d > this.ropeLen) {
        rope.divideScalar(d);
        this.pos.copy(this.anchor).addScaledVector(rope, this.ropeLen);
        const vr = this.vel.dot(rope);
        if (vr > 0) this.vel.addScaledVector(rope, -vr);
      }
    }

    // buildings
    const prevY = this.pos.y;
    this.touchWallT = 0;
    for (const b of this.city.boxes) {
      const by0 = b.y0 ?? 0;
      const ex = b.hx + R * 0.6;
      const ez = b.hz + R * 0.6;
      const ox = this.pos.x - b.cx;
      const oz = this.pos.z - b.cz;
      if (ox < -ex || ox > ex || oz < -ez || oz > ez || this.pos.y > b.top + R || this.pos.y < by0 - 1) continue;
      const cx = THREE.MathUtils.clamp(this.pos.x, b.cx - b.hx, b.cx + b.hx);
      const cy = THREE.MathUtils.clamp(this.pos.y, by0, b.top);
      const cz = THREE.MathUtils.clamp(this.pos.z, b.cz - b.hz, b.cz + b.hz);
      const dx = this.pos.x - cx;
      const dy = this.pos.y - cy;
      const dz = this.pos.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < R * R) {
        const d = Math.sqrt(d2) || 0.0001;
        const push = (R - d) / d;
        this.pos.x += dx * push;
        this.pos.y += dy * push;
        this.pos.z += dz * push;
        const nx = dx / d;
        const ny = dy / d;
        const nz = dz / d;
        const vn = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz;
        if (vn < 0) {
          this.vel.x -= nx * vn * 1.02;
          this.vel.y -= ny * vn * 1.02;
          this.vel.z -= nz * vn * 1.02;
        }
        if (ny > 0.55 && prevY >= b.top - 0.4) {
          if (!this.grounded) this.land(this.vel.y);
          this.grounded = true;
          this.pos.y = Math.max(this.pos.y, b.top + R);
        } else if (Math.abs(ny) < 0.55) {
          this.touchWallT = 0.14;
          this.touchWallN.set(nx, 0, nz).normalize();
        }
      }
    }

    // ground
    if (this.pos.y < R) {
      if (!this.grounded) this.land(this.vel.y);
      this.pos.y = R;
      if (this.vel.y < 0) this.vel.y = 0;
      this.grounded = true;
    } else {
      // check we still stand on something
      if (this.grounded) {
        let onSomething = this.pos.y <= R + 0.05;
        for (const b of this.city.boxes) {
          if (
            this.pos.x > b.cx - b.hx - 0.3 && this.pos.x < b.cx + b.hx + 0.3 &&
            this.pos.z > b.cz - b.hz - 0.3 && this.pos.z < b.cz + b.hz + 0.3 &&
            Math.abs(this.pos.y - R - b.top) < 0.5
          ) {
            onSomething = true;
            break;
          }
        }
        if (!onSomething) this.grounded = false;
      }
    }

    // hard swing-floor catch
    if (this.attached && this.grounded && this.attachT > 0.5) this.touchGroundDuringSwing = true;
    if (this.attached && this.touchGroundDuringSwing && hs0 < 3) this.detach(false);

    // world bounds
    const B = 420;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -B, B);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -B, B);
  }

  private handleClimb(h: number, wish: THREE.Vector3, fwdH: THREE.Vector3, rightH: THREE.Vector3) {
    this.climbPhase += h * 5;
    const up = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const sideVec = _n.set(this.wallN.z, 0, -this.wallN.x);
    const side = wish.dot(sideVec);
    this.vel.set(0, up * 6.5, 0).addScaledVector(sideVec, side * 5);
    this.pos.addScaledVector(this.vel, h);

    // jump off the wall
    if (this.jumpBufT > 0) {
      this.jumpBufT = 0;
      this.climbing = false;
      this.vel.copy(this.wallN).multiplyScalar(11);
      this.vel.y = 13.5;
      this.grounded = false;
      this.jumpStretchT = 1;
      this.sfx.jump();
      return;
    }

    // let go when not pressing into the wall
    const into = wish.dot(_t.copy(this.wallN).multiplyScalar(-1));
    if (into < -0.2 || (wish.lengthSq() < 0.01 && !this.keys.has("KeyW") && !this.keys.has("KeyS"))) {
      // small hop off
      this.climbing = false;
      this.vel.copy(this.wallN).multiplyScalar(4);
      this.vel.y = Math.max(this.vel.y, 3);
      this.grounded = false;
    }

    // stick to the surface
    let bestD = Infinity;
    let bestN: THREE.Vector3 | null = null;
    for (const b of this.city.boxes) {
      const cx = THREE.MathUtils.clamp(this.pos.x, b.cx - b.hx, b.cx + b.hx);
      const cy = THREE.MathUtils.clamp(this.pos.y, b.y0 ?? 0, b.top);
      const cz = THREE.MathUtils.clamp(this.pos.z, b.cz - b.hz, b.cz + b.hz);
      const d2 = (this.pos.x - cx) ** 2 + (this.pos.y - cy) ** 2 + (this.pos.z - cz) ** 2;
      if (d2 < bestD) {
        bestD = d2;
        bestN = _v.set(this.pos.x - cx, this.pos.y - cy, this.pos.z - cz);
        if (bestN.lengthSq() < 0.001) bestN.copy(this.wallN);
        else bestN.normalize();
      }
    }
    if (bestN) this.wallN.lerp(bestN.clone(), 0.2).normalize();
    const gap = Math.sqrt(Math.max(0, bestD));
    if (gap > R + 0.6) {
      this.climbing = false;
      this.grounded = false;
      return;
    }
    this.pos.addScaledVector(this.wallN, (R - gap) * 0.5);
    void fwdH;
    void rightH;
  }

  private land(fallV: number) {
    this.landTricks();
    const soft = this.gliding;
    this.landSquashT = soft ? 0.5 : Math.min(1, 0.4 + -fallV / 70);
    if (soft) {
      this.sfx.thud(false);
      this.particles.burst(this.pos.clone().setY(this.pos.y - R + 0.2), 10, ["#aef3ff", "#8a93b8"], 3.4, 0.5, 2);
      if (this.combo >= 2) this.popupAt(_v.set(this.pos.x, this.pos.y + 1.4, this.pos.z), "COMBO SAVED", "cyan");
    } else {
      if (fallV < -15) {
        this.sfx.thud(true);
        this.shake = Math.min(1.4, this.shake + -fallV / 45);
        this.particles.burst(this.pos.clone().setY(this.pos.y - R + 0.2), 16, ["#8a93b8", "#5b6488", "#aab3d4"], 7, 0.6, 3);
      } else if (fallV < -6) {
        this.sfx.thud(false);
        this.particles.burst(this.pos.clone().setY(this.pos.y - R + 0.2), 8, ["#6a739a", "#8a93b8"], 4, 0.45, 2);
      }
      if (this.combo > 0) this.popupAt(this.pos, "COMBO LOST", "red");
      this.combo = 0;
    }
  }

  /* ---------------- scoring ---------------- */
  private collectToken(tk: { group: THREE.Group; active: boolean; respawn: number }) {
    tk.active = false;
    tk.group.visible = false;
    tk.respawn = 2.6;
    this.collected++;
    const mult = Math.max(1, this.combo);
    const val = 100 * mult;
    this.score += val;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.sfx.collect(this.combo);
    this.particles.burst(tk.group.position, 18, ["#ffcf3f", "#fff3b0", "#ffffff"], 7, 0.6, 2.4);
    this.popupAt(tk.group.position.clone(), `+${val}`, "gold");
    if (this.collected >= GOAL && this.mode === "solo") this.endRun(true);
  }

  /* ---------------- frame ---------------- */
  private frame() {
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.elapsed += dt;

    const tsTarget = this.slowmoT > 0 ? 0.3 : 1;
    this.timeScale += (tsTarget - this.timeScale) * (1 - Math.exp(-14 * dt));
    if (this.slowmoT > 0) this.slowmoT -= dt;
    const gdt = dt * this.timeScale;

    if (this.phase === "playing" && !this.shopOpen) {
      if (this.countdown > 0) {
        this.countdown -= dt;
        if (this.countdown <= 0) {
          this.countdown = 0;
          this.popupAt(this.pos.clone().add(new THREE.Vector3(0, 2.4, 0)), "SWING!", "cyan");
          this.sfx.thwip();
        }
      } else {
        this.acc += gdt;
        while (this.acc >= STEP) {
          this.step(STEP);
          this.acc -= STEP;
        }
        this.cooldown = Math.max(0, this.cooldown - gdt);
        this.refireT = Math.max(0, this.refireT - gdt);
        this.webShotCd = Math.max(0, this.webShotCd - gdt);
        this.swingHitCd = Math.max(0, this.swingHitCd - gdt);
        if ((this.mouseWeb || this.touchWeb) && !this.attached && this.cooldown <= 0 && this.refireT <= 0) {
          this.tryWeb();
          this.refireT = 0.3;
        }

        // timer (solo only)
        if (this.mode === "solo") {
          this.time -= dt;
          if (this.time <= 0) {
            this.time = 0;
            this.endRun(false);
          }
        }

        // combat timers
        this.invulnT = Math.max(0, this.invulnT - dt);
        this.punchCooldown = Math.max(0, this.punchCooldown - dt);
        this.attackAnim = Math.max(0, this.attackAnim - dt * 3.4);
        this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
        this.trickAnimT = Math.max(0, this.trickAnimT - dt * 2);
        if (this.comboT > 0) {
          this.comboT -= dt;
          if (this.comboT <= 0) this.comboCount = 0;
        }
        if (!this.grounded) this.trickAirTime += dt;
        else this.trickAirTime = 0;

        // tokens
        for (const tk of this.tokens) {
          if (!tk.active) {
            tk.respawn -= dt;
            if (tk.respawn <= 0) {
              tk.active = true;
              tk.group.visible = true;
            }
            continue;
          }
          tk.group.rotation.y += 1.4 * dt;
          tk.group.position.y = tk.baseY + Math.sin(this.elapsed * 2 + tk.phase) * 0.8;
          if (tk.group.position.distanceToSquared(this.pos) < 3.2 * 3.2) this.collectToken(tk);
        }

        // easter eggs
        this.eggScanT -= dt;
        if (this.eggScanT <= 0) {
          this.eggScanT = 0.5;
          for (const egg of this.city.eggSpots) {
            if (this.eggsFound.has(egg.id)) continue;
            if (this.pos.distanceToSquared(egg.pos) < egg.r * egg.r) {
              this.eggsFound.add(egg.id);
              this.score += 500;
              this.sfx.sparkle();
              if (egg.id === "tung") this.sfx.tung();
              this.popupAt(_v.set(this.pos.x, this.pos.y + 2.2, this.pos.z), `SECRET! ${egg.label} +500`, "gold");
              this.particles.burst(this.pos, 30, ["#ffcf3f", "#ffffff", "#ff4fd8"], 10, 0.9, 3);
            }
          }
        }
      }

      // crowd + powers + market always tick while playing
      this.market.tick(dt);
      this.updatePowers(dt);
      this.updateWebShots(dt);
      this.crowd.update(dt, {
        active: this.countdown <= 0,
        playerPos: this.pos,
        playerVel: this.vel,
        swingHitCd: this.swingHitCd,
        invuln: this.invulnT > 0,
        elapsed: this.elapsed,
        punches: this.punches,
        damagePlayer: (n, from) => this.damagePlayer(n, from),
        onPunchHit: (heavy, at) => this.onPunchHit(heavy, at),
        onThugKilled: (at) => this.onThugKilled(at),
        onSwingHit: (pts, at) => this.onSwingHit(pts, at),
        onCoin: (at) => {
          this.addCash(5);
          this.score += 25;
          this.popupAt(at, "+$5", "cash");
        },
        onHeal: (at) => {
          this.hp = Math.min(this.maxHp, this.hp + 30);
          this.popupAt(at, "+30 HP", "cyan");
        },
        particles: this.particles,
        sfx: this.sfx,
      });
    } else {
      // menu / paused / shop: keep the city breathing
      this.updatePowers(dt * 0.4);
    }

    // dealer proximity
    this.nearDealerIdx = -1;
    if (this.phase === "playing" && !this.shopOpen) {
      let bestD = 5.2 * 5.2;
      for (let i = 0; i < this.city.dealerSpots.length; i++) {
        const sp = this.city.dealerSpots[i];
        const d2 = (sp.x - this.pos.x) ** 2 + (sp.z - this.pos.z) ** 2;
        if (d2 < bestD) {
          bestD = d2;
          this.nearDealerIdx = i;
        }
      }
    }

    const speed = this.vel.length();
    this.updateVisuals(dt, speed);
    this.updateCamera(dt, speed);

    // ambient animation
    if (this.city.ufo) {
      this.city.ufo.rotation.y += dt * 0.5;
      this.city.ufo.position.y = 118 + Math.sin(this.elapsed * 0.6) * 6;
    }
    if (this.city.tung) this.city.tung.rotation.y = Math.sin(this.elapsed * 0.8) * 0.3;
    const pulse = 0.55 + 0.45 * Math.sin(this.elapsed * 3.1);
    this.city.beaconMat.color.setRGB(0.55 + pulse * 0.45, 0.1 + pulse * 0.17, 0.16 + pulse * 0.17);

    this.sfx.setWind(Math.min(1, speed / 50));
    this.particles.update(dt);

    // ---- comic post pass: ink outlines + screentone ----
    this.slowmoMix += ((this.slowmoT > 0 ? 1 : 0) - this.slowmoMix) * (1 - Math.exp(-8 * dt));
    const u = this.postMat.uniforms;
    u.uTime.value = this.elapsed;
    u.uSpeed.value = THREE.MathUtils.clamp((speed - 12) / 42, 0, 1);
    u.uHit.value = this.hitFlash;
    u.uSlowmo.value = this.slowmoMix;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);

    if (this.phase === "playing") this.emitHud();
  }

  /* ---------------- visuals ---------------- */
  private updateVisuals(dt: number, speed: number) {
    const k = 1 - Math.exp(-13 * dt);
    const hs = Math.hypot(this.vel.x, this.vel.z);

    // root placement + facing
    this.playerRoot.position.set(this.pos.x, this.pos.y - R, this.pos.z);
    let targetYaw = this.yaw;
    if (this.climbing) targetYaw = Math.atan2(-this.wallN.x, -this.wallN.z);
    else if (this.attached || hs > 2.5) targetYaw = Math.atan2(this.vel.x, this.vel.z);
    let dy = targetYaw - this.playerRoot.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.playerRoot.rotation.y += dy * k;

    // gait phase (distance-driven)
    if (this.grounded && hs > 0.6) this.gaitPhase += hs * dt * 1.35;
    if (this.climbing) this.climbPhase += (Math.abs(this.vel.y) * 1.1 + 2.5) * dt;
    this.landSquashT = Math.max(0, this.landSquashT - dt * 4.2);
    this.jumpStretchT = Math.max(0, this.jumpStretchT - dt * 5);
    this.flinchT = Math.max(0, this.flinchT - dt * 3);

    this.applyPose(dt);

    // punch overlay
    if (this.attackAnim > 0 && !this.attached) {
      const punch = Math.sin(Math.min(1, this.attackAnim) * Math.PI);
      const arm = this.punchArmSide === "R" ? this.rig.armR : this.rig.armL;
      arm.rotation.x = -1.5 * punch;
      arm.rotation.z = 0;
      this.rig.torso.rotation.y = 0.5 * punch * (this.punchArmSide === "R" ? 1 : -1);
    }

    // hit flash
    const flash = this.invulnT > 0.6 ? 0.9 : this.hitFlash * 0.7;
    (this.rig.torso.material as THREE.MeshToonMaterial).emissive.setRGB(flash, flash * 0.1, flash * 0.1);
    (this.rig.head.material as THREE.MeshToonMaterial).emissive.setRGB(flash * 0.6, 0, 0);

    // squash & stretch + Buddha
    const squash = Math.sin(Math.PI * Math.min(1, this.landSquashT)) * 0.32;
    const stretch = Math.sin(Math.PI * Math.min(1, this.jumpStretchT)) * 0.14;
    let sy = 1 - squash + stretch;
    let sxz = 1 + squash * 0.9 - stretch * 0.5;
    if (this.sliding) {
      sy = 0.58;
      sxz = 1.12;
    }
    this.buddhaS += ((this.buddhaT > 0 ? 1 : 0) - this.buddhaS) * Math.min(1, k * 1.6);
    const buddhaF = 1 + this.buddhaS * 1.2;
    this.playerRoot.scale.y += (sy * buddhaF - this.playerRoot.scale.y) * Math.min(1, k * 2.2);
    this.playerRoot.scale.x += (sxz * buddhaF - this.playerRoot.scale.x) * Math.min(1, k * 2.2);
    this.playerRoot.scale.z = this.playerRoot.scale.x;

    // trick rotation on inner rig
    if (this.trickAnimT > 0) {
      const t = THREE.MathUtils.clamp(1 - this.trickAnimT / 0.5, 0, 1);
      const ang = t * Math.PI * 2;
      if (this.trickAnimType === "flip") this.player.rotation.x = ang;
      else this.player.rotation.z = ang;
    } else {
      this.player.rotation.x *= 0.75;
      this.player.rotation.z *= 0.75;
    }

    // power aura
    if (this.powerAura) {
      this.powerAura.visible = !!this.currentPower;
      if (this.powerAura.visible) {
        const p = 4.6 + Math.sin(this.elapsed * 6) * 0.5;
        this.powerAura.scale.setScalar(p * buddhaF);
        (this.powerAura.material as THREE.SpriteMaterial).opacity = 0.4 + Math.sin(this.elapsed * 6) * 0.12;
      }
    }

    // slide dust
    if (this.sliding && speed > 6) {
      this.trailAcc += dt * 40;
      if (this.trailAcc > 1) {
        this.trailAcc = 0;
        this.particles.burst(_v.set(this.pos.x - this.vel.x * 0.05, this.pos.y - R + 0.12, this.pos.z - this.vel.z * 0.05), 2, ["#8a93b8", "#aab3d4"], 2.2, 0.4, 1.4);
      }
    }

    // glider
    const gTarget = this.gliding ? 1 : 0.001;
    this.gliderS += (gTarget - this.gliderS) * (1 - Math.exp(-(this.gliding ? 15 : 20) * dt));
    this.glider.visible = this.gliderS > 0.02;
    if (this.glider.visible) {
      const s = this.gliderS * (this.gliding ? 1 + Math.sin(this.elapsed * 11) * 0.02 : 1);
      this.glider.scale.set(s, s * 0.94, s);
      this.glider.rotation.z = Math.sin(this.elapsed * 2.6) * 0.09 * this.gliderS;
      this.glider.rotation.x = THREE.MathUtils.clamp(this.vel.y * 0.014, -0.28, 0.3) * this.gliderS;
    }

    // blob shadow
    let surfY = 0;
    for (const b of this.city.boxes) {
      if (b.y0 !== undefined) continue;
      if (this.pos.x > b.cx - b.hx && this.pos.x < b.cx + b.hx && this.pos.z > b.cz - b.hz && this.pos.z < b.cz + b.hz && b.top < this.pos.y && b.top > surfY) surfY = b.top;
    }
    const drop = this.pos.y - R - surfY;
    this.blob.visible = drop < 46;
    this.blob.position.set(this.pos.x, surfY + 0.07, this.pos.z);
    this.blobMat.opacity = Math.max(0.06, 0.42 - drop * 0.009);
    const bs = 1 + drop * 0.012;
    this.blob.scale.set(bs, bs, 1);

    // web lines
    const hand = _v.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
    if (this.attached) {
      this.setLine(this.webLine, hand, this.anchor);
      this.setLine(this.webGlow, hand, this.anchor);
      this.webLine.visible = this.webGlow.visible = true;
      this.aimLine.visible = false;
      this.currentAnchor = null;
    } else {
      this.webLine.visible = this.webGlow.visible = false;
      if (this.cooldown <= 0 && this.phase === "playing" && !this.shopOpen) {
        const dir = this.aimDir(new THREE.Vector3());
        const hit = this.city.findAnchor(this.pos, dir);
        this.currentAnchor = hit;
        this.setLine(this.aimLine, hand, hit.point);
        this.aimLine.visible = true;
      } else {
        this.aimLine.visible = false;
      }
    }

    // dealers idle + face the player when close
    for (const d of this.dealerRigs) {
      const sp = this.city.dealerSpots[d.idx];
      const dx = this.pos.x - sp.x;
      const dz = this.pos.z - sp.z;
      const near = dx * dx + dz * dz < 90;
      const ty = near ? Math.atan2(dx, dz) : d.group.rotation.y;
      let ddy = ty - d.group.rotation.y;
      while (ddy > Math.PI) ddy -= Math.PI * 2;
      while (ddy < -Math.PI) ddy += Math.PI * 2;
      d.group.rotation.y += ddy * Math.min(1, dt * 4);
      const bob = Math.sin(this.elapsed * 2 + d.idx) * 0.06;
      d.rig.armL.rotation.x = bob;
      d.rig.armR.rotation.x = -bob;
      d.rig.head.rotation.y = Math.sin(this.elapsed * 0.7 + d.idx * 2) * 0.2;
    }
  }

  private applyPose(dt: number) {
    const r = this.rig;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const k = 1 - Math.exp(-13 * dt);
    const sin = Math.sin;
    const ph = this.gaitPhase;

    let aLx = 0, aRx = 0, aLz = 0.08, aRz = -0.08, lLx = 0, lRx = 0, lLy = 0, lRy = 0, torsoX = 0, torsoY = 0, headX = 0;
    let rootBob = 0;

    if (this.climbing) {
      const cp = this.climbPhase;
      aLx = -2.5 + sin(cp) * 0.45;
      aRx = -2.5 + sin(cp + Math.PI) * 0.45;
      aLz = 0.35;
      aRz = -0.35;
      lLx = 0.7 + sin(cp + Math.PI) * 0.55;
      lRx = 0.7 + sin(cp) * 0.55;
      torsoX = 0.25;
      headX = -0.5;
    } else if (this.attached) {
      aLx = -2.9;
      aRx = -2.9;
      aLz = 0.25;
      aRz = -0.25;
      const trail = Math.min(1, hs / 34);
      lLx = 0.5 + trail * 0.9;
      lRx = 0.35 + trail * 0.9;
      lLy = 0.15;
      lRy = -0.15;
      torsoX = 0.5 + trail * 0.35;
      headX = -0.55;
    } else if (this.sliding) {
      aLx = -0.5;
      aRx = 0.9;
      aRz = -0.4;
      lLx = -1.15;
      lRx = -0.35;
      torsoX = 0.55;
      headX = -0.2;
    } else if (this.gliding) {
      aLx = -2.5;
      aRx = -2.5;
      aLz = 0.5;
      aRz = -0.5;
      const sway = sin(this.elapsed * 3) * 0.18;
      lLx = 0.25 + sway;
      lRx = 0.25 - sway;
      torsoX = 0.12;
      headX = -0.3;
    } else if (!this.grounded) {
      if (this.dashT > 0) {
        aLx = 1.9;
        aRx = 1.9;
        lLx = 0.7;
        lRx = 0.4;
        torsoX = 1.1;
        headX = -0.5;
      } else if (this.vel.y > 2) {
        aLx = -1.1;
        aRx = -1.1;
        lLx = 0.85;
        lRx = 0.45;
        torsoX = -0.15;
        headX = -0.2;
      } else if (this.vel.y < -4) {
        aLx = -0.5;
        aRx = -0.5;
        aLz = 0.5;
        aRz = -0.5;
        lLx = 0.3;
        lRx = 0.3;
        lLy = 0.25;
        lRy = -0.25;
        torsoX = 0.1;
      } else {
        aLx = -0.8;
        aRx = -0.8;
        lLx = 0.6;
        lRx = 0.35;
      }
    } else if (hs > 0.6) {
      const amp = Math.min(1, hs / 12);
      const sw = sin(ph);
      const sw2 = sin(ph + Math.PI);
      aLx = sw * 0.95 * amp;
      aRx = sw2 * 0.95 * amp;
      lLx = sw2 * 0.85 * amp;
      lRx = sw * 0.85 * amp;
      lLy = sw2 * 0.12 * amp;
      lRy = sw * 0.12 * amp;
      torsoY = sw * 0.12 * amp;
      torsoX = Math.min(0.5, hs * 0.02);
      rootBob = Math.abs(sin(ph)) * 0.14 * amp;
      headX = -torsoX * 0.4;
    } else {
      const br = sin(this.elapsed * 2.2) * 0.05;
      aLx = br;
      aRx = -br;
      torsoX = 0.03;
      headX = sin(this.elapsed * 0.6) * 0.06 - this.pitch * 0.25;
    }

    // flinch
    if (this.flinchT > 0) {
      const fl = this.flinchT;
      torsoX -= 0.5 * fl;
      headX += 0.4 * fl;
      aLx += 0.7 * fl;
      aRx += 0.7 * fl;
    }

    const lerp = (cur: number, target: number, kk: number) => cur + (target - cur) * kk;
    r.armL.rotation.x = lerp(r.armL.rotation.x, aLx, k);
    r.armR.rotation.x = lerp(r.armR.rotation.x, aRx, k);
    r.armL.rotation.z = lerp(r.armL.rotation.z, aLz, k);
    r.armR.rotation.z = lerp(r.armR.rotation.z, aRz, k);
    r.legL.rotation.x = lerp(r.legL.rotation.x, lLx, k);
    r.legR.rotation.x = lerp(r.legR.rotation.x, lRx, k);
    r.legL.rotation.y = lerp(r.legL.rotation.y, lLy, k);
    r.legR.rotation.y = lerp(r.legR.rotation.y, lRy, k);
    if (this.attackAnim <= 0) {
      r.torso.rotation.x = lerp(r.torso.rotation.x, torsoX, k);
      r.torso.rotation.y = lerp(r.torso.rotation.y, torsoY, k);
    }
    r.head.rotation.x = lerp(r.head.rotation.x, headX, k);
    void rootBob;
  }

  private setLine(line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) {
    const attr = line.geometry.attributes.position as THREE.BufferAttribute;
    attr.setXYZ(0, a.x, a.y, a.z);
    attr.setXYZ(1, b.x, b.y, b.z);
    attr.needsUpdate = true;
    line.computeLineDistances();
  }

  /* ---------------- camera ---------------- */
  private updateCamera(dt: number, speed: number) {
    const cp = Math.cos(this.pitch);
    const f3 = _f.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    const right = _t.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const look = _d.set(
      this.pos.x + THREE.MathUtils.clamp(this.vel.x * 0.16, -6, 6),
      this.pos.y + 1.6,
      this.pos.z + THREE.MathUtils.clamp(this.vel.z * 0.16, -6, 6)
    );
    if (this.attached) {
      look.x += (this.anchor.x - this.pos.x) * 0.09;
      look.y += (this.anchor.y - this.pos.y) * 0.05;
      look.z += (this.anchor.z - this.pos.z) * 0.09;
    }
    this.camLook.lerp(look, 1 - Math.exp(-10 * dt));

    const distT = THREE.MathUtils.clamp(8.8 + speed * 0.09, 8.8, 15.5) + (this.attached ? 0.7 : 0);
    this.camDist += (distT - this.camDist) * (1 - Math.exp(-5 * dt));

    const ideal = _u.copy(this.camLook).addScaledVector(f3, -this.camDist);
    ideal.y -= Math.sin(this.pitch) * this.camDist * 0.38;
    ideal.y = Math.max(ideal.y, 0.85);

    const dir = _r.subVectors(ideal, this.camLook);
    const rayLen = dir.length();
    if (rayLen > 0.001) {
      dir.divideScalar(rayLen);
      let tMin = rayLen;
      for (const b of this.city.boxes) {
        if (Math.abs(b.cx - this.camLook.x) > rayLen + b.hx + 1) continue;
        if (Math.abs(b.cz - this.camLook.z) > rayLen + b.hz + 1) continue;
        const tt = rayBoxT(this.camLook, dir, b);
        if (tt >= 0 && tt < tMin) tMin = tt;
      }
      if (dir.y < -1e-6) {
        const tg = (0.6 - this.camLook.y) / dir.y;
        if (tg > 0 && tg < tMin) tMin = tg;
      }
      ideal.copy(this.camLook).addScaledVector(dir, Math.max(2.2, tMin - 0.55));
    }

    const dIdeal = ideal.distanceToSquared(this.camLook);
    const dCur = this.camera.position.distanceToSquared(this.camLook);
    this.camera.position.lerp(ideal, 1 - Math.exp((dIdeal < dCur ? -30 : -12) * dt));

    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.5;
      this.shake *= Math.exp(-6 * dt);
    }

    const sideVel = this.vel.x * right.x + this.vel.z * right.z;
    const rollT = this.grounded ? 0 : THREE.MathUtils.clamp(-sideVel * 0.011, -0.16, 0.16);
    this.camRoll += (rollT - this.camRoll) * (1 - Math.exp(-6 * dt));

    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camRoll) > 0.001) this.camera.rotateZ(this.camRoll);

    this.fovPunch *= Math.exp(-7 * dt);
    const targetFov = 72 + Math.min(26, Math.max(0, speed - 10) * 0.62) + (this.attached ? 2 : 0) + this.fovPunch;
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-6 * dt));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  /* ---------------- HUD ---------------- */
  private popupAt(worldPos: THREE.Vector3, text: string, kind: PopupData["kind"]) {
    const v = worldPos.clone().project(this.camera);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    this.cbs.onPopup({ id: ++this.popupId, x, y, text, kind });
  }

  private buildPowerHud(): PowerHud | null {
    const f = this.currentPower;
    if (!f) return null;
    const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
    return {
      name: f.name,
      rarity: f.rarity,
      color: hex(f.color),
      glow: hex(f.glow),
      energy: Math.round(this.energy),
      maxEnergy: this.maxEnergy,
      moves: f.moves.map((mv) => ({
        key: mv.key,
        name: mv.name,
        cd: this.powerCd[mv.key] ?? 0,
        maxCd: mv.cd,
        cost: this.moveCost(mv),
      })),
    };
  }

  private emitHud() {
    let anchor: AnchorPip | null = null;
    if (this.currentAnchor) {
      const v = this.currentAnchor.point.clone().project(this.camera);
      if (v.z < 1) {
        anchor = {
          x: (v.x * 0.5 + 0.5) * window.innerWidth,
          y: (-v.y * 0.5 + 0.5) * window.innerHeight,
          sky: this.currentAnchor.sky,
        };
      }
    }
    let powerPip: HudData["powerPip"] = null;
    const near = this.powerSpawner.nearest(this.pos);
    if (near && near.dist > 14) {
      const v = near.point.clone().project(this.camera);
      if (v.z < 1) {
        powerPip = {
          x: THREE.MathUtils.clamp((v.x * 0.5 + 0.5) * window.innerWidth, 60, window.innerWidth - 60),
          y: THREE.MathUtils.clamp((-v.y * 0.5 + 0.5) * window.innerHeight, 90, window.innerHeight - 140),
          glow: `#${near.def.glow.toString(16).padStart(6, "0")}`,
          name: near.def.name,
        };
      }
    }
    this.cbs.onHud({
      score: this.score,
      combo: this.combo,
      time: Math.max(0, Math.ceil(this.time)),
      tokens: this.collected,
      tokensTotal: GOAL,
      speed: this.vel.length(),
      alt: Math.max(0, this.pos.y - R),
      attached: this.attached,
      muted: this.sfx.muted,
      anchor,
      mode: this.mode,
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      cash: this.wallet,
      power: this.buildPowerHud(),
      powerPip,
      dealerNear: this.nearDealerIdx >= 0 ? DEALERS[this.nearDealerIdx].name : null,
      punchCombo: this.comboCount,
    });
  }

  getWallet(): number {
    return this.wallet;
  }

  getRarityLabel(r: Rarity): string {
    return RARITY[r].label;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("contextmenu", this.onCtx);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.clearWebShots();
    this.clearPowerProjectiles();
    for (const fx of this.powerFx) {
      this.scene.remove(fx.obj);
      ((fx.obj as THREE.Mesh).material as THREE.Material).dispose();
      (fx.obj as THREE.Mesh).geometry.dispose();
    }
    this.powerFx.length = 0;
    this.powerSpawner.dispose();
    this.crowd.dispose();
    for (const d of this.dealerRigs) disposeRig(d.rig);
    this.rt.dispose();
    this.rt.depthTexture?.dispose();
    this.postMat.dispose();
    this.renderer.dispose();
  }
}

const POWERS_BY_ID = new Map<string, PowerDef>(POWERS.map((p) => [p.id, p]));
