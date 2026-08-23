import * as THREE from "three";
import { City, WORLD_SPAN, type Box } from "./world";
import { Sfx } from "./audio";
import { createRoomTransport, randomPid, type NetPacket, type NetStatus, type RoomTransport } from "./net";

export type Phase = "menu" | "playing" | "paused" | "won" | "lost";
export type Mode = "solo" | "free" | "versus";

export interface Standing {
  pid: string;
  name: string;
  color: string;
  score: number;
  tokens: number;
  you: boolean;
}

export interface AnchorPip {
  x: number;
  y: number;
  ok: boolean;
  sky: boolean;
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
  countdown: number;
  standings: Standing[];
  roomCode: string | null;
}

export interface PopupData {
  id: number;
  x: number;
  y: number;
  text: string;
  kind: "gold" | "cyan" | "red";
}

export interface RunStats {
  score: number;
  tokens: number;
  maxCombo: number;
  bestSwing: number;
  timeLeft: number;
  mode: Mode;
  placement: number;
  standings: Standing[];
}

export interface EngineCallbacks {
  onHud: (h: HudData) => void;
  onPopup: (p: PopupData) => void;
  onPhase: (phase: Phase, stats: RunStats | null) => void;
  onRoster: (list: Standing[]) => void;
  onNetStatus: (s: NetStatus) => void;
}

interface Rig {
  group: THREE.Group;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
}

interface Ghost extends Rig {
  pid: string;
  name: string;
  color: string;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  attached: boolean;
  anchor: THREE.Vector3;
  grounded: boolean;
  score: number;
  combo: number;
  tokens: number;
  lastSeen: number;
  webLine: THREE.Line;
  tag: THREE.Sprite;
  glowSprite: THREE.Sprite;
  fade: number;
}

const GOAL = 20;
const RUN_TIME = 120;
const R = 0.9; // player collision radius
const GRAV = 30;
const STEP = 1 / 120;

interface Token {
  group: THREE.Group;
  baseY: number;
  phase: number;
  active: boolean;
  respawn: number;
}

/* ---------------- particles ---------------- */
class Particles {
  max = 460;
  pos: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  baseCol: Float32Array;
  col: Float32Array;
  geo = new THREE.BufferGeometry();
  points: THREE.Points;
  cursor = 0;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.max * 3).fill(-9999);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    this.baseCol = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(p: THREE.Vector3, count: number, colors: string[], speed: number, life = 0.7, up = 0) {
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      c.set(colors[Math.floor(Math.random() * colors.length)]);
      this.baseCol[idx * 3] = c.r;
      this.baseCol[idx * 3 + 1] = c.g;
      this.baseCol[idx * 3 + 2] = c.b;
      this.pos[idx * 3] = p.x;
      this.pos[idx * 3 + 1] = p.y;
      this.pos[idx * 3 + 2] = p.z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.35 + Math.random() * 0.75);
      this.vel[idx * 3] = Math.sin(ph) * Math.cos(th) * s;
      this.vel[idx * 3 + 1] = Math.cos(ph) * s * 0.7 + up;
      this.vel[idx * 3 + 2] = Math.sin(ph) * Math.sin(th) * s;
      this.life[idx] = this.maxLife[idx] = life * (0.6 + Math.random() * 0.6);
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -9999;
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      this.vel[i * 3 + 1] -= 7 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.col[i * 3] = this.baseCol[i * 3] * f;
      this.col[i * 3 + 1] = this.baseCol[i * 3 + 1] * f;
      this.col[i * 3 + 2] = this.baseCol[i * 3 + 2] * f;
    }
    (this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }
}

/* ---------------- engine ---------------- */
export class Engine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private city = new City();
  private sfx = new Sfx();
  private cbs: EngineCallbacks;
  private canvas: HTMLCanvasElement;

  private raf = 0;
  private last = 0;
  private acc = 0;
  private elapsed = 0;
  private disposed = false;

  phase: Phase = "menu";
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private bestSwing = 0;
  private time = RUN_TIME;
  private collected = 0;
  private lastTickSec = -1;

  // player physics
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private grounded = false;
  private attached = false;
  private anchor = new THREE.Vector3();
  private anchorSky = false;
  private ropeLen = 20;
  private attachT = 0;
  private cooldown = 0;
  private swingFrom = new THREE.Vector3();
  private touchGroundDuringSwing = false;

  // camera / input
  private yaw = 0;
  private pitch = 0.22;
  private shake = 0;
  private fov = 72;
  private camLook = new THREE.Vector3();
  private camDist = 9;
  private camRoll = 0;
  private fovPunch = 0;

  // mode / net
  private mode: Mode = "solo";
  private countdown = 0;
  private placement = 1;
  private finalStandings: Standing[] = [];
  private rosterCache: Standing[] = [];
  private rosterAcc = 0;
  private transport: RoomTransport | null = null;
  private roomCode: string | null = null;
  private pid = randomPid();
  private netName = "SPIDER";
  private netColor = "#52ffa8";
  private ghosts = new Map<string, Ghost>();
  private netAcc = 0;
  private keys = new Set<string>();
  private mouseWeb = false;
  private braking = false;
  private locked = false;

  // scene objects
  private player!: THREE.Group;
  private rig!: Rig;
  private blob!: THREE.Mesh;
  private blobMat!: THREE.MeshBasicMaterial;
  private webLine!: THREE.Line;
  private webGlow!: THREE.Line;
  private aimLine!: THREE.Line;
  private particles: Particles;
  private tokens: Token[] = [];
  private glowTex: THREE.Texture;
  private popupId = 0;
  private trailAcc = 0;
  private currentAnchor: { point: THREE.Vector3; sky: boolean } | null = null;

  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseUp: (e: MouseEvent) => void;
  private onLockChange: () => void;
  private onResize: () => void;
  private onCtx: (e: Event) => void;
  private onVis: () => void;
  private onCanvasClick: () => void;

  constructor(canvas: HTMLCanvasElement, cbs: EngineCallbacks) {
    this.canvas = canvas;
    this.cbs = cbs;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.scene.fog = new THREE.Fog(0x191743, 130, 720);

    const hemi = new THREE.HemisphereLight(0x8fb5ff, 0x2a1740, 1.0);
    const dir = new THREE.DirectionalLight(0xffe2b0, 1.15);
    dir.position.set(160, 260, -120);
    this.scene.add(hemi, dir);
    this.scene.add(this.city.group);

    this.glowTex = this.makeGlowTexture();
    this.particles = new Particles(this.scene);
    this.buildPlayer();
    this.buildWebLines();
    this.buildTokens();

    this.onResize = () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    };
    this.onKeyDown = (e) => this.keyDown(e);
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onMouseMove = (e) => {
      if (!this.locked || this.phase !== "playing") return;
      this.yaw -= e.movementX * 0.0023;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0021, -1.05, 0.6);
    };
    this.onMouseDown = (e) => {
      if (this.phase !== "playing") return;
      if (e.button === 0) {
        this.mouseWeb = true;
        this.tryWeb();
      } else if (e.button === 2) this.braking = true;
    };
    this.onMouseUp = (e) => {
      if (e.button === 0) {
        this.mouseWeb = false;
        if (this.attached) this.detach(true);
      } else if (e.button === 2) this.braking = false;
    };
    this.onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.phase === "playing") this.pause();
    };
    this.onCtx = (e) => e.preventDefault();
    this.onVis = () => {
      if (document.hidden && this.phase === "playing") this.pause();
    };
    this.onCanvasClick = () => {
      if (this.phase === "playing" && !this.locked) this.canvas.requestPointerLock();
    };

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("visibilitychange", this.onVis);
    canvas.addEventListener("contextmenu", this.onCtx);
    canvas.addEventListener("click", this.onCanvasClick);

    this.resetRun();
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /* ---------------- setup ---------------- */
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

  private toonMat(color: number) {
    const data = new Uint8Array([70, 70, 70, 255, 140, 140, 140, 255, 255, 255, 255, 255]);
    const grad = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    grad.minFilter = THREE.NearestFilter;
    grad.magFilter = THREE.NearestFilter;
    grad.needsUpdate = true;
    return new THREE.MeshToonMaterial({ color, gradientMap: grad });
  }

  private buildRig(bodyColor: number, accentColor: number): Rig {
    const g = new THREE.Group();
    const accent = this.toonMat(accentColor);
    const body = this.toonMat(bodyColor);
    const dark = this.toonMat(0x111735);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.42, 4, 10), body);
    torso.position.y = 0.98;
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.315, 0.2, 4, 10), accent);
    chest.position.y = 1.24;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), accent);
    head.position.y = 1.68;
    head.scale.set(0.92, 1.05, 0.95);
    const eyeGeo = new THREE.SphereGeometry(0.11, 10, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf4fbff });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.scale.set(0.75, 1.15, 0.45);
    eyeL.position.set(-0.1, 1.71, 0.2);
    eyeL.rotation.set(0, -0.3, -0.25);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.1;
    eyeR.rotation.set(0, 0.3, 0.25);
    const eyeLineL = new THREE.Mesh(eyeGeo, dark);
    eyeLineL.scale.set(0.85, 1.25, 0.4);
    eyeLineL.position.set(-0.1, 1.71, 0.185);
    eyeLineL.rotation.copy(eyeL.rotation);
    const eyeLineR = eyeLineL.clone();
    eyeLineR.position.x = 0.1;
    eyeLineR.rotation.copy(eyeR.rotation);

    const limb = (w: number, l: number, mat: THREE.Material) => {
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(w, l, 4, 8), mat);
      mesh.position.y = -(l / 2 + w);
      pivot.add(mesh);
      return pivot;
    };
    const armL = limb(0.085, 0.42, accent);
    armL.position.set(-0.4, 1.42, 0);
    const armR = limb(0.085, 0.42, accent);
    armR.position.set(0.4, 1.42, 0);
    const legL = limb(0.105, 0.48, body);
    legL.position.set(-0.16, 0.82, 0);
    const legR = limb(0.105, 0.48, body);
    legR.position.set(0.16, 0.82, 0);
    const bootGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const bootL = new THREE.Mesh(bootGeo, accent);
    bootL.position.y = -0.66;
    bootL.scale.set(1, 0.8, 1.3);
    const bootR = bootL.clone();
    legL.add(bootL);
    legR.add(bootR);

    // spider emblem
    const spider = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), dark);
    spider.scale.set(1, 1.6, 0.5);
    spider.position.set(0, 1.3, 0.3);

    g.add(torso, chest, head, eyeLineL, eyeLineR, eyeL, eyeR, spider, armL, armR, legL, legR);
    return { group: g, armL, armR, legL, legR };
  }

  private buildPlayer() {
    this.rig = this.buildRig(0x2b53d9, 0xe6273a);
    this.player = this.rig.group;
    this.scene.add(this.player);

    this.blobMat = new THREE.MeshBasicMaterial({ color: 0x02030c, transparent: true, opacity: 0.4, depthWrite: false });
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.85, 20), this.blobMat);
    this.blob.rotation.x = -Math.PI / 2;
    this.scene.add(this.blob);
  }

  /** Shared swing / fall / run posing for the player and ghost rigs. */
  private applyPose(r: Rig, hs: number, velY: number, grounded: boolean, attached: boolean, k: number) {
    let armX = 0.15;
    let armZL = 0.12;
    let armZR = -0.12;
    let legX = 0;
    let legZ = 0.08;
    const run = grounded && hs > 3;
    if (attached) {
      armX = -2.75;
      armZL = 0.25;
      armZR = -0.25;
      legX = 0.55 + Math.sin(this.elapsed * 9) * 0.12;
      legZ = 0.22;
    } else if (!grounded) {
      const fall = velY < -6;
      armX = fall ? -0.9 : -1.5;
      armZL = fall ? 1.15 : 0.7;
      armZR = fall ? -1.15 : -0.7;
      legX = fall ? 0.4 : 0.85;
      legZ = 0.3;
    } else if (run) {
      const sw = Math.sin(this.elapsed * 13) * Math.min(1, hs / 14);
      legX = sw * 0.95;
      armX = -sw * 0.7;
      armZL = 0.18;
      armZR = -0.18;
      legZ = 0.1;
    }
    r.armL.rotation.x += (armX - r.armL.rotation.x) * k;
    r.armR.rotation.x += (armX - r.armR.rotation.x) * k;
    r.armL.rotation.z += (armZL - r.armL.rotation.z) * k;
    r.armR.rotation.z += (armZR - r.armR.rotation.z) * k;
    r.legL.rotation.x += (legX - r.legL.rotation.x) * k;
    r.legR.rotation.x += (-legX - r.legR.rotation.x) * k;
    r.legL.rotation.z += (legZ - r.legL.rotation.z) * k;
    r.legR.rotation.z += (-legZ - r.legR.rotation.z) * k;
  }

  private buildWebLines() {
    const mk = (color: number, opacity: number, dashed: boolean) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
      const mat = dashed
        ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 1.1, gapSize: 0.9 })
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
    for (let i = 0; i < GOAL; i++) {
      const group = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.13, 10, 26),
        new THREE.MeshBasicMaterial({ color: 0xffcf3f })
      );
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.52, 0), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffcf3f, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(4.4);
      group.add(ring, core, glow);
      const spot = this.city.tokenSpots[i];
      group.position.copy(spot);
      this.scene.add(group);
      this.tokens.push({ group, baseY: spot.y, phase: Math.random() * 9, active: true, respawn: 0 });
    }
  }

  /* ---------------- public control ---------------- */
  startRun(mode: Mode = "solo") {
    this.mode = mode;
    this.sfx.ensure();
    this.sfx.startWind();
    this.resetRun();
    this.setPhase("playing");
    this.canvas.requestPointerLock();
    this.sfx.ui();
  }

  restartRun() {
    this.startRun(this.mode);
  }

  resume() {
    if (this.phase !== "paused") return;
    this.sfx.ensure();
    this.setPhase("playing");
    this.canvas.requestPointerLock();
    this.sfx.ui();
  }

  pause() {
    if (this.phase !== "playing") return;
    this.setPhase("paused");
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  toMenu() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.leaveRoom();
    this.resetRun();
    this.player.visible = false;
    this.setPhase("menu");
  }

  toggleMute() {
    this.sfx.setMuted(!this.sfx.muted);
  }

  dispose() {
    this.disposed = true;
    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("visibilitychange", this.onVis);
    this.canvas.removeEventListener("contextmenu", this.onCtx);
    this.canvas.removeEventListener("click", this.onCanvasClick);
    this.renderer.dispose();
  }

  /* ---------------- run state ---------------- */
  private setPhase(p: Phase) {
    this.phase = p;
    this.cbs.onPhase(p, p === "won" || p === "lost" ? this.stats() : null);
  }

  private stats(): RunStats {
    return {
      score: this.score,
      tokens: this.collected,
      maxCombo: this.maxCombo,
      bestSwing: Math.round(this.bestSwing),
      timeLeft: this.mode === "free" ? 0 : Math.max(0, Math.ceil(this.time)),
      mode: this.mode,
      placement: this.placement,
      standings: this.finalStandings,
    };
  }

  private resetRun() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.bestSwing = 0;
    this.time = RUN_TIME;
    this.collected = 0;
    this.lastTickSec = -1;
    this.pos.copy(this.city.spawn).setY(R);
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this.attached = false;
    this.cooldown = 0;
    this.yaw = 0;
    this.pitch = 0.22;
    this.shake = 0;
    this.fov = 72;
    this.camDist = 9;
    this.camRoll = 0;
    this.fovPunch = 0;
    this.countdown = 3.0;
    this.placement = 1;
    this.finalStandings = [];
    // in versus, jitter spawns so rivals don't all drop on the same manhole
    if (this.mode === "versus") {
      let h = 0;
      for (const ch of this.pid) h = (h * 31 + ch.charCodeAt(0)) | 0;
      this.pos.x += ((h % 7) - 3) * 2.1;
      this.pos.z += (((h >> 3) % 7) - 3) * 2.1;
    }
    this.camLook.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
    this.camera.position.set(this.pos.x, this.pos.y + 1.4, this.pos.z + 9);
    this.camera.fov = 72;
    this.camera.updateProjectionMatrix();
    this.player.visible = this.phase !== "menu";
    this.webLine.visible = false;
    this.webGlow.visible = false;
    this.aimLine.visible = false;
    this.blob.visible = false;
    this.tokens.forEach((t, i) => {
      t.active = true;
      t.respawn = 0;
      t.group.visible = true;
      t.group.position.copy(this.city.tokenSpots[i]);
      t.baseY = this.city.tokenSpots[i].y;
    });
  }

  private keyDown(e: KeyboardEvent) {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (e.code === "Space" && this.phase === "playing" && !e.repeat) this.tryWeb();
    if (e.code === "KeyM" && !e.repeat) this.toggleMute();
    if (e.code === "KeyR" && this.phase === "playing" && !e.repeat) {
      this.pos.copy(this.city.spawn).setY(R + 0.1);
      this.vel.set(0, 0, 0);
      this.attached = false;
      this.camLook.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
      this.camera.position.set(this.pos.x, this.pos.y + 1.4, this.pos.z + 9);
      this.camRoll = 0;
      this.popupAt(this.pos, "RESET", "cyan");
    }
    if (e.code === "KeyP" && !e.repeat) {
      if (this.phase === "playing") this.pause();
      else if (this.phase === "paused") this.resume();
    }
  }

  /* ---------------- web mechanics ---------------- */
  private aimDir(out: THREE.Vector3) {
    const cp = Math.cos(this.pitch);
    out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    return out;
  }

  private tryWeb() {
    if (this.phase !== "playing" || this.countdown > 0 || this.attached || this.cooldown > 0) return;
    if (this.grounded) {
      this.vel.y = Math.max(this.vel.y, 13.5);
      this.grounded = false;
      this.sfx.jump();
    }
    const dir = this.aimDir(new THREE.Vector3());
    const hit = this.city.findAnchor(this.pos, dir);
    this.anchor.copy(hit.point);
    this.anchorSky = hit.sky;
    const d = this.pos.distanceTo(this.anchor);
    this.ropeLen = THREE.MathUtils.clamp(d * 0.97, 7, 58);
    this.attached = true;
    this.attachT = 0;
    this.touchGroundDuringSwing = false;
    this.swingFrom.copy(this.pos);
    this.cooldown = 0.1;
    this.fovPunch = -4.5;
    this.shake = Math.min(1.4, this.shake + 0.22);
    this.sfx.thwip();
    this.particles.burst(this.anchor, hit.sky ? 6 : 12, ["#aef3ff", "#35e0ff", "#ffffff"], hit.sky ? 3 : 7, 0.45);
    this.popupAt(this.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), "THWIP!", "cyan");
  }

  private detach(byUser: boolean) {
    if (!this.attached) return;
    this.attached = false;
    this.cooldown = 0.14;
    const swung = this.attachT > 0.32 && !this.touchGroundDuringSwing;
    if (byUser) {
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.vel.addScaledVector(fwd, 1.6);
      this.vel.y += 1.1;
      this.fovPunch = Math.max(this.fovPunch, 2.5);
    }
    if (swung) {
      const flat = Math.hypot(this.pos.x - this.swingFrom.x, this.pos.z - this.swingFrom.z);
      if (flat > this.bestSwing) this.bestSwing = flat;
      this.combo = Math.min(5, this.combo + 1);
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      if (this.combo >= 2) this.popupAt(this.pos, `COMBO x${this.combo}`, "red");
      if (flat > 42) {
        this.score += 150;
        this.popupAt(this.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), "BIG SWING +150", "gold");
        this.sfx.bigSwing();
      }
      this.sfx.snap();
    }
    this.particles.burst(this.pos, 6, ["#35e0ff", "#aef3ff"], 5, 0.4);
  }

  /* ---------------- physics ---------------- */
  private step(h: number) {
    const fwdH = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rightH = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (this.keys.has("KeyW")) wish.add(fwdH);
    if (this.keys.has("KeyS")) wish.sub(fwdH);
    if (this.keys.has("KeyD")) wish.add(rightH);
    if (this.keys.has("KeyA")) wish.sub(rightH);
    if (wish.lengthSq() > 0) wish.normalize();

    if (this.grounded) {
      this.vel.addScaledVector(wish, 48 * h);
      const damp = wish.lengthSq() > 0 ? 2.2 : 9;
      this.vel.x *= Math.exp(-damp * h);
      this.vel.z *= Math.exp(-damp * h);
      const cap = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 26 : 15;
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > cap) {
        this.vel.x *= cap / hs;
        this.vel.z *= cap / hs;
      }
    } else {
      this.vel.addScaledVector(wish, 21 * h);
      const hs = Math.hypot(this.vel.x, this.vel.z);
      const cap = this.attached ? 62 : 55;
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
    if (this.braking) {
      const f = Math.exp(-2.4 * h);
      this.vel.multiplyScalar(f);
    }

    this.vel.y -= GRAV * h;
    this.pos.addScaledVector(this.vel, h);

    // rope constraint
    if (this.attached) {
      const dx = this.pos.x - this.anchor.x;
      const dy = this.pos.y - this.anchor.y;
      const dz = this.pos.z - this.anchor.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > this.ropeLen && dist > 0.0001) {
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;
        this.pos.set(this.anchor.x + nx * this.ropeLen, this.anchor.y + ny * this.ropeLen, this.anchor.z + nz * this.ropeLen);
        const vn = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz;
        if (vn > 0) this.vel.addScaledVector(_n.set(nx, ny, nz), -vn);
      }
      if (dist < 4 || this.pos.y > this.anchor.y + 3 || dist > 96) this.detach(false);
    }

    // buildings
    this.grounded = false;
    for (const b of this.city.boxes) {
      const ex = b.hx + R;
      const ez = b.hz + R;
      const ox = this.pos.x - b.cx;
      const oz = this.pos.z - b.cz;
      if (ox < -ex || ox > ex || oz < -ez || oz > ez || this.pos.y > b.top + R || this.pos.y < -1) continue;
      const cx = THREE.MathUtils.clamp(this.pos.x, b.cx - b.hx, b.cx + b.hx);
      const cy = THREE.MathUtils.clamp(this.pos.y, 0, b.top);
      const cz = THREE.MathUtils.clamp(this.pos.z, b.cz - b.hz, b.cz + b.hz);
      let nx = this.pos.x - cx;
      let ny = this.pos.y - cy;
      let nz = this.pos.z - cz;
      const d2 = nx * nx + ny * ny + nz * nz;
      if (d2 > R * R) continue;
      if (d2 < 1e-6) {
        this.pos.y = b.top + R;
        if (this.vel.y < 0) this.vel.y = 0;
        this.grounded = true;
        continue;
      }
      const d = Math.sqrt(d2);
      nx /= d;
      ny /= d;
      nz /= d;
      const push = R - d;
      this.pos.x += nx * push;
      this.pos.y += ny * push;
      this.pos.z += nz * push;
      const vn = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz;
      if (vn < 0) this.vel.addScaledVector(_n.set(nx, ny, nz), -vn);
      if (ny > 0.55) {
        this.grounded = true;
        this.vel.x *= 0.995;
        this.vel.z *= 0.995;
      }
    }

    // ground
    if (this.pos.y < R) {
      const fallV = this.vel.y;
      this.pos.y = R;
      if (this.vel.y < 0) this.vel.y = 0;
      if (!this.grounded || fallV < -5) this.land(fallV);
      this.grounded = true;
    }

    // world bounds
    const LIM = WORLD_SPAN + 250;
    if (Math.abs(this.pos.x) > LIM) {
      this.pos.x = Math.sign(this.pos.x) * LIM;
      this.vel.x *= -0.3;
    }
    if (Math.abs(this.pos.z) > LIM) {
      this.pos.z = Math.sign(this.pos.z) * LIM;
      this.vel.z *= -0.3;
    }
    if (this.pos.y > 260) {
      this.pos.y = 260;
      if (this.vel.y > 0) this.vel.y = 0;
    }

    if (this.grounded && this.attached && this.attachT > 0.2) this.touchGroundDuringSwing = true;
  }

  private land(fallV: number) {
    if (this.attached && this.attachT > 0.2) this.detach(false);
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

  /* ---------------- per-frame ---------------- */
  private frame(dt: number) {
    this.elapsed += dt;

    if (this.phase === "playing") {
      if (this.countdown > 0) {
        this.countdown -= dt;
        if (this.countdown <= 0) {
          this.countdown = 0;
          this.popupAt(this.pos.clone().add(new THREE.Vector3(0, 2.4, 0)), "SWING!", "cyan");
          this.sfx.thwip();
        }
      } else {
        this.acc += dt;
        while (this.acc >= STEP) {
          this.step(STEP);
          this.acc -= STEP;
        }
        this.cooldown = Math.max(0, this.cooldown - dt);
        if (this.mouseWeb && !this.attached && this.cooldown <= 0 && this.elapsed % 1 < 0.5) this.tryWeb();

        // timer (frozen in free play)
        if (this.mode !== "free") {
          this.time -= dt;
          const sec = Math.ceil(this.time);
          if (sec <= 5 && sec >= 0 && sec !== this.lastTickSec) {
            this.lastTickSec = sec;
            this.sfx.countTick();
          }
          if (this.time <= 0) {
            this.time = 0;
            this.endRun(false);
          }
        }

        // tokens
        for (const t of this.tokens) {
          if (!t.active) {
            t.respawn -= dt;
            if (t.respawn <= 0) this.respawnToken(t);
            continue;
          }
          t.group.rotation.y += 2.4 * dt;
          t.group.position.y = t.baseY + Math.sin(this.elapsed * 2 + t.phase) * 0.8;
          if (t.group.position.distanceToSquared(this.pos) < 2.7 * 2.7) this.collectToken(t);
        }

        // swing web trail
        this.trailAcc += dt * Math.min(60, this.vel.length() * 2.2);
        if (this.attached && this.vel.length() > 14 && this.trailAcc > 1) {
          this.trailAcc = 0;
          this.particles.burst(this.pos, 1, ["#35e0ff", "#8ae9ff"], 1.4, 0.5);
        }
      }
      const speed = this.vel.length();
      this.sfx.setWind(this.countdown > 0 ? 0 : speed);
      this.updateVisuals(dt, speed);
      this.updateCamera(dt, speed);
    } else if (this.phase === "menu") {
      const a = this.elapsed * 0.075;
      this.camera.position.set(Math.sin(a) * 175, 92 + Math.sin(this.elapsed * 0.2) * 8, Math.cos(a) * 175);
      this.camera.lookAt(0, 34, 0);
      this.camera.fov = 60;
      this.camera.updateProjectionMatrix();
      for (const t of this.tokens) {
        t.group.rotation.y += 1.4 * dt;
        t.group.position.y = t.baseY + Math.sin(this.elapsed * 2 + t.phase) * 0.8;
      }
    } else if (this.phase === "won" || this.phase === "lost") {
      // slow celebratory orbit around player
      const a = this.elapsed * 0.3;
      this.camera.position.set(this.pos.x + Math.sin(a) * 9, this.pos.y + 3.2, this.pos.z + Math.cos(a) * 9);
      this.camera.lookAt(this.pos.x, this.pos.y + 1, this.pos.z);
    }

    // multiplayer: broadcast state, animate ghosts, prune stale rivals
    if (this.transport) {
      this.netAcc += dt;
      if (this.netAcc >= 0.08) {
        this.netAcc = 0;
        this.sendNet();
      }
      this.updateGhosts(dt);
      this.pruneGhosts();
      this.rosterAcc += dt;
      if (this.rosterAcc > 0.25) {
        this.rosterAcc = 0;
        this.rosterCache = this.standingsList();
        this.cbs.onRoster(this.rosterCache);
      }
    }

    // beacon pulse
    const pulse = 0.55 + 0.45 * Math.sin(this.elapsed * 3.1);
    this.city.beaconMat.color.setRGB(0.55 + pulse * 0.45, 0.1 + pulse * 0.17, 0.16 + pulse * 0.17);

    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);

    if (this.phase === "playing") this.emitHud();
  }

  private updateVisuals(dt: number, speed: number) {
    const k = 1 - Math.exp(-13 * dt);

    // player placement + facing
    this.player.position.set(this.pos.x, this.pos.y - R, this.pos.z);
    this.player.visible = true;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    let targetYaw = this.yaw;
    if (hs > 2.5) targetYaw = Math.atan2(this.vel.x, this.vel.z);
    let dy = targetYaw - this.player.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.player.rotation.y += dy * k;

    this.applyPose(this.rig, hs, this.vel.y, this.grounded, this.attached, k);

    // blob shadow on highest surface below
    let surfY = 0;
    for (const b of this.city.boxes) {
      if (Math.abs(this.pos.x - b.cx) < b.hx && Math.abs(this.pos.z - b.cz) < b.hz && b.top < this.pos.y && b.top > surfY) surfY = b.top;
    }
    const drop = this.pos.y - R - surfY;
    this.blob.visible = drop < 46;
    this.blob.position.set(this.pos.x, surfY + 0.07, this.pos.z);
    this.blobMat.opacity = Math.max(0.06, 0.42 - drop * 0.009);
    const bs = 1 + drop * 0.012;
    this.blob.scale.set(bs, bs, 1);

    // aim + web lines
    const hand = _v.set(this.pos.x, this.pos.y + 0.55, this.pos.z);
    if (this.attached) {
      this.setLine(this.webLine, hand, this.anchor);
      this.setLine(this.webGlow, hand, this.anchor);
      this.webLine.visible = this.webGlow.visible = true;
      this.aimLine.visible = false;
      this.currentAnchor = null;
    } else {
      this.webLine.visible = this.webGlow.visible = false;
      if (this.cooldown <= 0) {
        const dir = this.aimDir(new THREE.Vector3());
        const hit = this.city.findAnchor(this.pos, dir);
        this.currentAnchor = hit;
        this.setLine(this.aimLine, hand, hit.point);
        this.aimLine.computeLineDistances();
        this.aimLine.visible = true;
      } else {
        this.aimLine.visible = false;
        this.currentAnchor = null;
      }
    }
    void speed;
  }

  private setLine(line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) {
    const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    attr.setXYZ(0, a.x, a.y, a.z);
    attr.setXYZ(1, b.x, b.y, b.z);
    attr.needsUpdate = true;
  }

  private updateCamera(dt: number, speed: number) {
    const cp = Math.cos(this.pitch);
    const f3 = _f.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    const right = _t.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // look target: lead with horizontal velocity so you see where you're going,
    // and lean slightly toward the web anchor to frame the swing arc
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

    // distance: pulls back as you speed up for a wider, faster frame
    const distT = THREE.MathUtils.clamp(8.8 + speed * 0.09, 8.8, 15.5) + (this.attached ? 0.7 : 0);
    this.camDist += (distT - this.camDist) * (1 - Math.exp(-5 * dt));

    // ideal position behind the look target; looking up sinks it, looking down lifts it
    const ideal = _u.copy(this.camLook).addScaledVector(f3, -this.camDist);
    ideal.y -= Math.sin(this.pitch) * this.camDist * 0.38;
    ideal.y = Math.max(ideal.y, 0.85);

    // never clip through the city: sweep a ray toward the ideal point
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

    // follow: snap in fast when a wall pushes us, glide otherwise
    const dIdeal = ideal.distanceToSquared(this.camLook);
    const dCur = this.camera.position.distanceToSquared(this.camLook);
    this.camera.position.lerp(ideal, 1 - Math.exp((dIdeal < dCur ? -30 : -12) * dt));

    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.5;
      this.shake *= Math.exp(-6 * dt);
    }

    // bank into turns while airborne
    const sideVel = this.vel.x * right.x + this.vel.z * right.z;
    const rollT = this.grounded ? 0 : THREE.MathUtils.clamp(-sideVel * 0.011, -0.16, 0.16);
    this.camRoll += (rollT - this.camRoll) * (1 - Math.exp(-6 * dt));

    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camRoll) > 0.001) this.camera.rotateZ(this.camRoll);

    // FOV: speed rush + thwip punch-in / release punch-out
    this.fovPunch *= Math.exp(-7 * dt);
    const targetFov = 72 + Math.min(26, Math.max(0, speed - 10) * 0.62) + (this.attached ? 2 : 0) + this.fovPunch;
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-6 * dt));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  /* ---------------- multiplayer ---------------- */
  joinRoom(code: string, name: string) {
    this.leaveRoom();
    this.roomCode = code.toUpperCase().trim();
    this.netName = (name.trim() || "SPIDER").slice(0, 12).toUpperCase();
    const palette = ["#52ffa8", "#ff4fd8", "#ffcf3f", "#aef3ff", "#ff9d2e", "#c084fc"];
    let h = 0;
    for (const ch of this.pid) h = (h * 33 + ch.charCodeAt(0)) | 0;
    this.netColor = palette[Math.abs(h) % palette.length];
    this.transport = createRoomTransport(this.roomCode, this.pid, (kind) =>
      this.cbs.onNetStatus(kind === "supabase" ? "online" : "local")
    );
    this.transport.onPacket((p) => this.handlePacket(p));
    this.cbs.onNetStatus(this.transport.kind === "supabase" ? "online" : "local");
  }

  leaveRoom() {
    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }
    this.roomCode = null;
    const pids: string[] = [];
    this.ghosts.forEach((_, pid) => pids.push(pid));
    pids.forEach((pid) => this.removeGhost(pid));
    this.rosterCache = [];
    this.cbs.onRoster([]);
    this.cbs.onNetStatus("off");
  }

  get transportKind() {
    return this.transport?.kind ?? null;
  }

  private sendNet() {
    if (!this.transport) return;
    this.transport.send({
      v: 1,
      pid: this.pid,
      name: this.netName,
      color: this.netColor,
      x: this.pos.x,
      y: this.pos.y,
      z: this.pos.z,
      vx: this.vel.x,
      vy: this.vel.y,
      vz: this.vel.z,
      yaw: this.yaw,
      attached: this.attached,
      ax: this.anchor.x,
      ay: this.anchor.y,
      az: this.anchor.z,
      grounded: this.grounded,
      score: this.score,
      combo: this.combo,
      tokens: this.collected,
      playing: this.phase === "playing",
    });
  }

  private handlePacket(p: NetPacket) {
    let g = this.ghosts.get(p.pid);
    if (!g) {
      g = this.createGhost(p);
      this.ghosts.set(p.pid, g);
    }
    g.lastSeen = this.elapsed;
    g.name = p.name;
    g.color = p.color;
    g.target.set(p.x, p.y, p.z);
    g.vel.set(p.vx, p.vy, p.vz);
    g.yaw = p.yaw;
    g.attached = p.attached;
    g.anchor.set(p.ax, p.ay, p.az);
    g.grounded = p.grounded;
    g.score = p.score;
    g.combo = p.combo;
    g.tokens = p.tokens;
  }

  private standingsList(): Standing[] {
    const list: Standing[] = [
      { pid: this.pid, name: this.netName, color: "#ff2438", score: this.score, tokens: this.collected, you: true },
    ];
    this.ghosts.forEach((g) =>
      list.push({ pid: g.pid, name: g.name, color: g.color, score: g.score, tokens: g.tokens, you: false })
    );
    return list.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  private makeTag(name: string, color: string): THREE.Sprite {
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 72;
    const c = cv.getContext("2d")!;
    c.fillStyle = "rgba(6,9,26,0.78)";
    c.fillRect(0, 10, 256, 52);
    c.fillStyle = color;
    c.fillRect(0, 58, 256, 4);
    c.font = "700 30px 'Chakra Petch', 'Segoe UI', sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#ffffff";
    c.fillText(name.slice(0, 12), 128, 37);
    const tex = new THREE.CanvasTexture(cv);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
    );
    sprite.scale.set(4.6, 1.29, 1);
    sprite.renderOrder = 999;
    return sprite;
  }

  private createGhost(p: NetPacket): Ghost {
    const col = new THREE.Color(p.color || "#52ffa8");
    const rig = this.buildRig(col.clone().multiplyScalar(0.55).getHex(), col.getHex());
    rig.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const m = mesh.material as THREE.MeshToonMaterial;
        m.transparent = true;
        m.opacity = 0.92;
        m.emissive = col.clone().multiplyScalar(0.22);
      }
    });
    this.scene.add(rig.group);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
    const webLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col.getHex(), transparent: true, opacity: 0.8 }));
    webLine.frustumCulled = false;
    webLine.visible = false;
    this.scene.add(webLine);

    const tag = this.makeTag(p.name, p.color);
    this.scene.add(tag);

    const glowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: col.getHex(),
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glowSprite.scale.setScalar(5);
    this.scene.add(glowSprite);

    return {
      ...rig,
      pid: p.pid,
      name: p.name,
      color: p.color,
      pos: new THREE.Vector3(p.x, p.y, p.z),
      target: new THREE.Vector3(p.x, p.y, p.z),
      vel: new THREE.Vector3(p.vx, p.vy, p.vz),
      yaw: p.yaw,
      attached: p.attached,
      anchor: new THREE.Vector3(p.ax, p.ay, p.az),
      grounded: p.grounded,
      score: p.score,
      combo: p.combo,
      tokens: p.tokens,
      lastSeen: this.elapsed,
      webLine,
      tag,
      glowSprite,
      fade: 0,
    };
  }

  private removeGhost(pid: string) {
    const g = this.ghosts.get(pid);
    if (!g) return;
    this.scene.remove(g.group, g.webLine, g.tag, g.glowSprite);
    g.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const m = mesh.material as THREE.MeshToonMaterial;
        m.gradientMap?.dispose();
        m.dispose();
      }
    });
    g.webLine.geometry.dispose();
    (g.webLine.material as THREE.Material).dispose();
    (g.tag.material as THREE.SpriteMaterial).map?.dispose();
    (g.tag.material as THREE.Material).dispose();
    (g.glowSprite.material as THREE.Material).dispose();
    this.ghosts.delete(pid);
  }

  private pruneGhosts() {
    const stale: string[] = [];
    this.ghosts.forEach((g, pid) => {
      if (this.elapsed - g.lastSeen > 4) stale.push(pid);
    });
    stale.forEach((pid) => this.removeGhost(pid));
  }

  private updateGhosts(dt: number) {
    const k = 1 - Math.exp(-16 * dt);
    const kf = 1 - Math.exp(-13 * dt);
    this.ghosts.forEach((g) => {
      g.fade = Math.min(1, g.fade + dt * 2.5);
      g.pos.lerp(g.target, k);
      if (g.pos.y < 0.6) g.pos.y = 0.6;
      g.group.position.set(g.pos.x, g.pos.y - R, g.pos.z);
      g.group.scale.setScalar(0.4 + 0.6 * g.fade);

      const hs = Math.hypot(g.vel.x, g.vel.z);
      if (hs > 2.5) {
        const ty = Math.atan2(g.vel.x, g.vel.z);
        let dy = ty - g.group.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        g.group.rotation.y += dy * kf;
      }
      this.applyPose(g, hs, g.vel.y, g.grounded, g.attached, kf);

      if (g.attached) {
        _v.set(g.pos.x, g.pos.y + 0.55, g.pos.z);
        this.setLine(g.webLine, _v, g.anchor);
        g.webLine.visible = true;
      } else {
        g.webLine.visible = false;
      }

      g.tag.position.set(g.pos.x, g.pos.y + 1.6, g.pos.z);
      (g.tag.material as THREE.SpriteMaterial).opacity = 0.9 * g.fade;
      g.glowSprite.position.set(g.pos.x, g.pos.y - 0.25, g.pos.z);
      (g.glowSprite.material as THREE.SpriteMaterial).opacity = 0.3 * g.fade;
    });
  }

  /* ---------------- scoring ---------------- */
  private collectToken(t: Token) {
    t.active = false;
    t.group.visible = false;
    t.respawn = 2.6;
    this.collected++;
    const mult = Math.max(1, this.combo);
    const val = 100 * mult;
    this.score += val;
    this.sfx.collect(this.combo);
    this.particles.burst(t.group.position, 26, ["#ffcf3f", "#ffe9a0", "#ff9d2e", "#ffffff"], 10, 0.8, 4);
    this.popupAt(t.group.position.clone(), `+${val}`, "gold");
    if (this.collected >= GOAL && this.mode === "solo") this.endRun(true);
  }

  private respawnToken(t: Token) {
    const streets = [-224, -160, -96, -32, 32, 96, 160, 224];
    const vertical = Math.random() < 0.5;
    const street = streets[Math.floor(Math.random() * streets.length)];
    const along = (Math.random() * 2 - 1) * 230;
    const y = 13 + Math.random() * 30;
    const p = vertical
      ? new THREE.Vector3(street + (Math.random() - 0.5) * 6, y, along)
      : new THREE.Vector3(along, y, street + (Math.random() - 0.5) * 6);
    if (p.distanceToSquared(this.pos) < 26 * 26) {
      t.respawn = 0.8;
      return;
    }
    t.group.position.copy(p);
    t.baseY = p.y;
    t.active = true;
    t.group.visible = true;
    this.particles.burst(p, 10, ["#ffcf3f", "#8ae9ff"], 5, 0.5);
  }

  private endRun(goalReached: boolean) {
    let won = goalReached;
    if (this.mode === "versus") {
      this.finalStandings = this.standingsList();
      const idx = this.finalStandings.findIndex((s) => s.you);
      this.placement = idx < 0 ? 1 : idx + 1;
      won = this.placement === 1;
      this.rosterCache = this.finalStandings;
      this.cbs.onRoster(this.rosterCache);
    } else {
      this.placement = won ? 1 : 0;
    }
    if (won) this.sfx.win();
    else this.sfx.lose();
    this.sfx.setWind(0);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    if (won) this.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 3, 0)), 90, ["#ffcf3f", "#35e0ff", "#ff4fd8", "#ffffff"], 16, 1.4, 8);
    this.setPhase(won ? "won" : "lost");
  }

  /* ---------------- hud ---------------- */
  private popupAt(worldPos: THREE.Vector3, text: string, kind: PopupData["kind"]) {
    const v = worldPos.clone().project(this.camera);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    this.cbs.onPopup({ id: ++this.popupId, x, y, text, kind });
  }

  private emitHud() {
    let anchor: AnchorPip | null = null;
    if (this.currentAnchor) {
      const v = this.currentAnchor.point.clone().project(this.camera);
      if (v.z < 1) {
        anchor = {
          x: (v.x * 0.5 + 0.5) * window.innerWidth,
          y: (-v.y * 0.5 + 0.5) * window.innerHeight,
          ok: true,
          sky: this.currentAnchor.sky,
        };
      }
    }
    this.cbs.onHud({
      score: this.score,
      combo: this.combo,
      time: Math.max(0, Math.ceil(this.time)),
      tokens: this.collected,
      tokensTotal: GOAL,
      speed: Math.hypot(this.vel.x, this.vel.z),
      alt: Math.max(0, this.pos.y - R),
      attached: this.attached,
      muted: this.sfx.muted,
      anchor,
      mode: this.mode,
      countdown: this.countdown,
      standings: this.mode === "versus" ? this.rosterCache.slice(0, 5) : [],
      roomCode: this.roomCode,
    });
  }
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _f = new THREE.Vector3();
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _u = new THREE.Vector3();
const _r = new THREE.Vector3();

/** Nearest ray entry distance into an axis-aligned box (y from 0 to b.top). -1 if no hit. */
function rayBoxT(o: THREE.Vector3, d: THREE.Vector3, b: Box): number {
  let tmin = 0;
  let tmax = Infinity;
  if (Math.abs(d.x) < 1e-9) {
    if (o.x < b.cx - b.hx || o.x > b.cx + b.hx) return -1;
  } else {
    let t1 = (b.cx - b.hx - o.x) / d.x;
    let t2 = (b.cx + b.hx - o.x) / d.x;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(d.y) < 1e-9) {
    if (o.y < 0 || o.y > b.top) return -1;
  } else {
    let t1 = (0 - o.y) / d.y;
    let t2 = (b.top - o.y) / d.y;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(d.z) < 1e-9) {
    if (o.z < b.cz - b.hz || o.z > b.cz + b.hz) return -1;
  } else {
    let t1 = (b.cz - b.hz - o.z) / d.z;
    let t2 = (b.cz + b.hz - o.z) / d.z;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}
