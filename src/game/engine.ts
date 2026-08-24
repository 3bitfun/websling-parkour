import * as THREE from "three";
import { City, WORLD_SPAN, type Box } from "./world";
import { Sfx } from "./audio";
import { createRoomTransport, randomPid, type NetPacket, type NetStatus, type RoomTransport } from "./net";
import { BACKEND_READY, onAuthChange, submitScore, type AccountUser } from "./backend";
import { buildR6Rig, spiderStyle, type Rig } from "./rig";
import { Crowd, type PunchEvent } from "./npcs";

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
  sliding: boolean;
  gliding: boolean;
  climbing: boolean;
  dashReady: boolean;
  hp: number;
  punchCombo: number;
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
  ko: boolean;
  thugsDown: number;
}

export interface EngineCallbacks {
  onHud: (h: HudData) => void;
  onPopup: (p: PopupData) => void;
  onPhase: (phase: Phase, stats: RunStats | null) => void;
  onRoster: (list: Standing[]) => void;
  onNetStatus: (s: NetStatus) => void;
  onToast?: (msg: string) => void;
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

  // parkour movement
  private jumpBufT = 0;
  private jumpCut = false;
  private coyoteT = 0;
  private slideHeld = false;
  private sliding = false;
  private slideT = 0;
  private slideCool = 0;
  private glideHeld = false;
  private gliding = false;
  private dashCd = 0;
  private dashT = 0;
  private refireT = 0;
  private camSlide = 0;
  private camGlide = 0;
  private glider!: THREE.Group;
  private gliderS = 0;

  // wall climbing
  private climbing = false;
  private wallN = new THREE.Vector3(1, 0, 0);
  private wallBox: Box | null = null;
  private touchWallN = new THREE.Vector3();
  private touchWallBox: Box | null = null;
  private touchWallT = 0;

  // web projectiles
  private webShots: { p: THREE.Vector3; v: THREE.Vector3; life: number; mesh: THREE.Mesh; line: THREE.Line }[] = [];
  private webShotCd = 0;
  private webShotGeo = new THREE.SphereGeometry(0.24, 10, 8);

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

  // backend (accounts / leaderboard)
  private authUser: AccountUser | null = null;
  private authUnsub: (() => void) | null = null;
  private submitted = false;

  // crowd + combat
  private crowd!: Crowd;
  private punches: PunchEvent[] = [];
  private hp = 100;
  private invulnT = 0;
  private comboT = 0;
  private comboCount = 0;
  private attackAnim = 0;
  private hitFlash = 0;
  private punchCooldown = 0;
  private ko = false;
  private thugsDown = 0;

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
    this.authUnsub = onAuthChange((u) => {
      this.authUser = u;
    });
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
    this.crowd = new Crowd(this.scene, this.city);

    this.onResize = () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
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
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0021, -1.05, 0.6);
    };
    this.onMouseDown = (e) => {
      if (this.phase !== "playing") return;
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

  private buildSpiderRig(): Rig {
    return buildR6Rig(spiderStyle());
  }

  private buildPlayer() {
    this.rig = this.buildSpiderRig();
    this.player = this.rig.group;
    this.scene.add(this.player);

    // deployable web-chute (glide parachute)
    const glider = new THREE.Group();
    const canopyGeo = new THREE.ConeGeometry(1.75, 0.72, 12, 1, true);
    const canopy = new THREE.Mesh(
      canopyGeo,
      new THREE.MeshBasicMaterial({
        color: 0xaef3ff,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const ribs = new THREE.Mesh(
      canopyGeo,
      new THREE.MeshBasicMaterial({ color: 0x35e0ff, wireframe: true, transparent: true, opacity: 0.6, depthWrite: false })
    );
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.75, 0.035, 6, 26),
      new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.85 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.36;
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xf2fbff })
    );
    tip.position.y = 0.36;
    glider.add(canopy, ribs, rim, tip);
    glider.position.y = 2.6;
    glider.scale.setScalar(0.001);
    glider.visible = false;
    this.player.add(glider);
    this.glider = glider;

    this.blobMat = new THREE.MeshBasicMaterial({ color: 0x02030c, transparent: true, opacity: 0.4, depthWrite: false });
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.85, 20), this.blobMat);
    this.blob.rotation.x = -Math.PI / 2;
    this.scene.add(this.blob);
  }

  /** Shared swing / glide / slide / fall / run posing for the player and ghost rigs. */
  private applyPose(
    r: Rig,
    hs: number,
    velY: number,
    grounded: boolean,
    attached: boolean,
    k: number,
    sliding = false,
    gliding = false,
    climbing = false
  ) {
    let armX = 0.15;
    let armZL = 0.12;
    let armZR = -0.12;
    let legX = 0;
    let legZ = 0.08;
    const run = grounded && hs > 3;
    if (climbing) {
      // clinging to the wall: arms reach up to grip, knees bent against the face
      const cycle = Math.sin(this.elapsed * 10) * Math.min(1, Math.abs(this.vel.y) / 6);
      armX = -2.8;
      armZL = 0.4;
      armZR = -0.4;
      legX = 0.95 + cycle * 0.25;
      legZ = 0.5;
    } else if (attached) {
      armX = -2.75;
      armZL = 0.25;
      armZR = -0.25;
      legX = 0.55 + Math.sin(this.elapsed * 9) * 0.12;
      legZ = 0.22;
    } else if (gliding && !grounded) {
      // spread-eagle under the web chute
      armX = -0.25;
      armZL = 1.85;
      armZR = -1.85;
      legX = 0.25 + Math.sin(this.elapsed * 5) * 0.05;
      legZ = 0.6;
    } else if (sliding && grounded) {
      // low crouch slide — legs kicked forward, arms swept back
      armX = 0.95;
      armZL = 0.75;
      armZR = -0.75;
      legX = 1.15;
      legZ = 0.16;
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
    this.keys.clear();
    this.mouseWeb = false;
    this.glideHeld = false;
    this.slideHeld = false;
    this.setPhase("paused");
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  toMenu() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.leaveRoom();
    this.maybeSubmitScore();
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
    this.authUnsub?.();
    this.authUnsub = null;
    this.clearWebShots();
    if (this.crowd) this.crowd.dispose();
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
      ko: this.ko,
      thugsDown: this.thugsDown,
    };
  }

  /** Upload the finished run to the websling leaderboard (once per run). */
  private maybeSubmitScore() {
    if (this.submitted || !BACKEND_READY || !this.authUser || this.score <= 0) return;
    this.submitted = true;
    const s = this.stats();
    submitScore(this.authUser.id, {
      mode: s.mode,
      score: s.score,
      tokens: s.tokens,
      maxCombo: s.maxCombo,
      bestSwing: s.bestSwing,
      timeLeft: s.timeLeft,
      placement: s.mode === "versus" && s.placement > 0 ? s.placement : null,
    })
      .then(() => this.cbs.onToast?.("SCORE SAVED TO LEADERBOARD"))
      .catch(() => this.cbs.onToast?.("LEADERBOARD UPLOAD FAILED"));
  }

  private resetRun() {
    this.score = 0;
    this.submitted = false;
    this.combo = 0;
    this.maxCombo = 0;
    this.bestSwing = 0;
    this.hp = 100;
    this.ko = false;
    this.thugsDown = 0;
    this.invulnT = 0;
    this.comboCount = 0;
    this.comboT = 0;
    this.attackAnim = 0;
    this.hitFlash = 0;
    this.punchCooldown = 0;
    this.punches.length = 0;
    this.climbing = false;
    this.wallBox = null;
    this.touchWallT = 0;
    this.webShotCd = 0;
    this.clearWebShots();
    if (this.crowd) this.crowd.reset();
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
    this.jumpBufT = 0;
    this.jumpCut = false;
    this.coyoteT = 0;
    this.slideHeld = false;
    this.sliding = false;
    this.slideT = 0;
    this.slideCool = 0;
    this.glideHeld = false;
    this.gliding = false;
    this.dashCd = 0;
    this.dashT = 0;
    this.camSlide = 0;
    this.camGlide = 0;
    this.gliderS = 0;
    if (this.glider) this.glider.visible = false;
    this.player.scale.set(1, 1, 1);
    this.keys.clear();
    this.mouseWeb = false;
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
    if (e.ctrlKey && (e.code === "KeyC" || e.code === "KeyW" || e.code === "KeyR") && this.phase === "playing") e.preventDefault();
    this.keys.add(e.code);
    if (this.phase === "playing") {
      if (e.code === "Space" && !e.repeat) this.jumpBufT = 0.14;
      if ((e.code === "KeyQ") && !e.repeat) {
        if (this.attached) this.detach(true);
        else this.tryWeb();
      }
      if (e.code === "ControlLeft" || e.code === "ControlRight" || e.code === "KeyC") {
        this.slideHeld = true;
        if (!e.repeat) this.trySlide();
      }
      if (e.code === "KeyF" && !e.repeat) this.tryDash();
      if (e.code === "KeyE") this.glideHeld = true;
      if ((e.code === "KeyV" || e.code === "KeyB") && !e.repeat) this.tryPunch();
      if (e.code === "KeyX" && !e.repeat) this.tryWebShot();
    }
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
    if (this.climbing) {
      // launching off the wall into a swing
      this.climbing = false;
      this.vel.addScaledVector(this.wallN, 4);
    }
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

  private trySlide() {
    if (this.phase !== "playing" || this.countdown > 0) return;
    if (this.grounded && !this.sliding && this.slideCool <= 0 && Math.hypot(this.vel.x, this.vel.z) > 8) {
      this.sliding = true;
      this.slideT = 0;
      const hs = Math.hypot(this.vel.x, this.vel.z);
      const boost = 1 + Math.min(0.35, 4 / Math.max(hs, 1));
      this.vel.x *= boost;
      this.vel.z *= boost;
      this.sfx.slide();
      this.particles.burst(
        _v.set(this.pos.x, this.pos.y - R + 0.15, this.pos.z),
        12,
        ["#8a93b8", "#aab3d4", "#5b6488"],
        5,
        0.5,
        2
      );
    }
  }

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
    this.dashCd = 0.9;
    this.dashT = 0.18;
    this.fovPunch = Math.max(this.fovPunch, 4.5);
    this.shake = Math.min(1, this.shake + 0.18);
    this.sfx.dash();
    this.particles.burst(this.pos, 16, ["#aef3ff", "#35e0ff", "#ffffff"], 9, 0.42, 3);
    this.popupAt(_v.set(this.pos.x, this.pos.y + 1.2, this.pos.z), "DASH!", "cyan");
  }

  /* ---------------- combat ---------------- */
  private tryPunch() {
    if (this.phase !== "playing" || this.countdown > 0 || this.punchCooldown > 0) return;
    this.punchCooldown = 0.34;
    this.attackAnim = 1;
    const dir = this.aimDir(new THREE.Vector3());
    const heavy = !this.grounded;
    const dmg = heavy ? 55 : 32;
    this.sfx.punchWhiff();
    this.punches.push({
      x: this.pos.x,
      y: this.pos.y + 0.3,
      z: this.pos.z,
      dx: dir.x,
      dy: dir.y,
      dz: dir.z,
      dmg,
      range: heavy ? 4.2 : 3.4,
      heavy,
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
    this.popupAt(at, `+${bounty} BOUNTY`, "gold");
    this.particles.burst(at, 26, ["#ffcf3f", "#ffffff", "#ff2438"], 11, 1, 3);
    this.hp = Math.min(100, this.hp + 6);
  }

  private damagePlayer(n: number, from: THREE.Vector3) {
    if (this.invulnT > 0 || this.phase !== "playing") return;
    this.hp = Math.max(0, this.hp - n);
    this.invulnT = 0.9;
    this.hitFlash = 1;
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
        this.hp = 100;
        this.pos.copy(this.city.spawn).setY(R + 0.1);
        this.vel.set(0, 0, 0);
        this.attached = false;
        this.popupAt(_v.set(this.pos.x, this.pos.y + 2, this.pos.z), "RESPAWN", "cyan");
      } else {
        this.ko = true;
        this.endRun(false);
      }
    }
  }

  /* ---------------- wall climbing ---------------- */
  private handleClimb(h: number) {
    const b = this.wallBox;
    if (!b) {
      this.climbing = false;
      return;
    }
    // wall-jump: kick off away from the face
    if (this.jumpBufT > 0) {
      this.jumpBufT = 0;
      this.climbing = false;
      this.vel.set(this.wallN.x * 13, 15.5, this.wallN.z * 13);
      this.grounded = false;
      this.sfx.jump();
      this.particles.burst(this.pos, 12, ["#aef3ff", "#ffffff"], 6, 0.5, 2);
      return;
    }
    let vy = 0;
    if (this.keys.has("KeyW")) vy += 7.2;
    if (this.keys.has("KeyS")) vy -= 6.2;
    const tang = _t.set(-this.wallN.z, 0, this.wallN.x);
    let st = 0;
    if (this.keys.has("KeyD")) st += 1;
    if (this.keys.has("KeyA")) st -= 1;
    const vt = st * 5.2;

    this.pos.addScaledVector(tang, vt * h);
    this.pos.y += vy * h;

    // stay glued to the wall surface
    if (Math.abs(this.wallN.x) > 0.5) this.pos.x = b.cx + this.wallN.x * (b.hx + R);
    else this.pos.z = b.cz + this.wallN.z * (b.hz + R);
    if (Math.abs(this.wallN.x) > 0.5) this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.cz - b.hz - R, b.cz + b.hz + R);
    else this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.cx - b.hx - R, b.cx + b.hx + R);

    // mantle over the ledge
    if (this.pos.y > b.top + R * 0.35) {
      this.pos.y = b.top + R;
      this.climbing = false;
      this.grounded = true;
      this.vel.set(0, 2.5, 0);
      this.sfx.jump();
      this.particles.burst(this.pos, 8, ["#aef3ff", "#ffffff"], 3.5, 0.4, 1.6);
      return;
    }
    if (this.pos.y <= R) {
      this.pos.y = R;
      this.climbing = false;
      this.grounded = true;
      this.vel.set(0, 0, 0);
      return;
    }
    this.vel.set(tang.x * vt, vy, tang.z * vt);
    this.grounded = false;
    this.coyoteT = 0.12;
  }

  /* ---------------- web projectiles ---------------- */
  private tryWebShot() {
    if (this.phase !== "playing" || this.countdown > 0 || this.webShotCd > 0) return;
    this.webShotCd = 0.22;
    const dir = this.aimDir(new THREE.Vector3());
    const origin = new THREE.Vector3().copy(this.pos);
    origin.y += 0.6;
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
    this.particles.burst(origin, 6, ["#f2fbff", "#aef3ff"], 3, 0.3, 1.4);
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
      } else if (s.p.y < 0.15) {
        done = true;
      } else {
        for (const b of this.city.boxes) {
          if (
            s.p.x > b.cx - b.hx &&
            s.p.x < b.cx + b.hx &&
            s.p.z > b.cz - b.hz &&
            s.p.z < b.cz + b.hz &&
            s.p.y > 0 &&
            s.p.y < b.top
          ) {
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
        } else {
          this.particles.burst(s.p, 5, ["#f2fbff"], 2.5, 0.3, 1.2);
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

  /* ---------------- physics ---------------- */
  private step(h: number) {
    // parkour timers
    this.jumpBufT = Math.max(0, this.jumpBufT - h);
    this.coyoteT = this.grounded ? 0.12 : Math.max(0, this.coyoteT - h);
    this.slideCool = Math.max(0, this.slideCool - h);
    this.dashCd = Math.max(0, this.dashCd - h);
    this.dashT = Math.max(0, this.dashT - h);
    this.touchWallT = Math.max(0, this.touchWallT - h);
    this.webShotCd = Math.max(0, this.webShotCd - h);

    const fwdH = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rightH = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (this.keys.has("KeyW")) wish.add(fwdH);
    if (this.keys.has("KeyS")) wish.sub(fwdH);
    if (this.keys.has("KeyD")) wish.add(rightH);
    if (this.keys.has("KeyA")) wish.sub(rightH);
    if (wish.lengthSq() > 0) wish.normalize();

    const hs0 = Math.hypot(this.vel.x, this.vel.z);

    // ---- wall climb ----
    if (this.climbing) {
      this.handleClimb(h);
      return;
    }
    if (!this.grounded && !this.attached && !this.gliding && this.touchWallT > 0) {
      const into = wish.dot(_n.copy(this.touchWallN).multiplyScalar(-1));
      if (into > 0.3) {
        this.climbing = true;
        this.wallN.copy(this.touchWallN);
        this.wallBox = this.touchWallBox;
        this.vel.set(0, 0, 0);
        this.sliding = false;
        this.sfx.webGrab();
        this.particles.burst(this.pos, 10, ["#f2fbff", "#aef3ff"], 4, 0.4, 1.8);
      }
    }

    // ---- slide state machine ----
    if (this.sliding) {
      this.slideT += h;
      if (!this.grounded || this.slideT > 1.15 || (!this.slideHeld && this.slideT > 0.3) || hs0 < 4.5) {
        this.sliding = false;
        this.slideCool = 0.45;
      }
    } else if (this.slideHeld && this.grounded && this.slideCool <= 0 && hs0 > 8) {
      this.sliding = true;
      this.slideT = 0;
      const boost = 1 + Math.min(0.35, 4 / Math.max(hs0, 1));
      this.vel.x *= boost;
      this.vel.z *= boost;
      this.sfx.slide();
      this.particles.burst(
        _v.set(this.pos.x, this.pos.y - R + 0.15, this.pos.z),
        12,
        ["#8a93b8", "#aab3d4", "#5b6488"],
        5,
        0.5,
        2
      );
    }

    // ---- jump (buffered + coyote, variable height) ----
    if (this.jumpBufT > 0 && (this.grounded || this.coyoteT > 0)) {
      this.sliding = false;
      this.vel.y = 14.6;
      this.grounded = false;
      this.coyoteT = 0;
      this.jumpBufT = 0;
      this.sfx.jump();
      this.particles.burst(
        _v.set(this.pos.x, this.pos.y - R + 0.1, this.pos.z),
        7,
        ["#aef3ff", "#ffffff"],
        3.4,
        0.35,
        1.6
      );
    }
    if (this.jumpCut) {
      this.jumpCut = false;
      if (this.vel.y > 5 && !this.grounded) this.vel.y *= 0.55;
    }

    // ---- glide / parachute (air) & brake (ground) ----
    this.gliding = false;
    if (this.glideHeld && !this.grounded) {
      if (this.attached) this.detach(false);
      this.gliding = true;
      this.sliding = false;
    }

    if (this.grounded) {
      if (this.glideHeld) {
        // hard brake
        const f = Math.exp(-3.4 * h);
        this.vel.x *= f;
        this.vel.z *= f;
      } else if (this.sliding) {
        // low-friction slide with light steering
        this.vel.addScaledVector(wish, 11 * h);
        const f = Math.exp(-0.45 * h);
        this.vel.x *= f;
        this.vel.z *= f;
      } else if (this.dashT <= 0) {
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
      }
    } else {
      this.vel.addScaledVector(wish, (this.gliding ? 30 : 21) * h);
      if (this.gliding) {
        // canopy physics: soft drag + clamped fall speed
        const f = Math.exp(-0.85 * h);
        this.vel.x *= f;
        this.vel.z *= f;
        if (this.vel.y < -5.5) this.vel.y = -5.5;
      }
      const hs = Math.hypot(this.vel.x, this.vel.z);
      const cap = this.attached ? 62 : this.dashT > 0 ? 70 : 55;
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
      } else if (Math.abs(ny) < 0.5) {
        // remember the side wall we're pressed against (for climbing)
        this.touchWallN.set(nx, 0, nz).normalize();
        this.touchWallBox = b;
        this.touchWallT = 0.14;
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
    const soft = this.gliding;
    if (soft) {
      // parachute touchdown — gentle, and it protects the combo
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
        this.refireT = Math.max(0, this.refireT - dt);
        if (this.mouseWeb && !this.attached && this.cooldown <= 0 && this.refireT <= 0) {
          this.tryWeb();
          this.refireT = 0.3;
        }

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

    // crowd + combat
    if (this.countdown <= 0) {
      this.invulnT = Math.max(0, this.invulnT - dt);
      this.punchCooldown = Math.max(0, this.punchCooldown - dt);
      this.attackAnim = Math.max(0, this.attackAnim - dt * 3.4);
      this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
      if (this.comboT > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) this.comboCount = 0;
      }
    }
    this.crowd.update(dt, {
      active: this.phase === "playing" && this.countdown <= 0,
      playerPos: this.pos,
      invuln: this.invulnT > 0,
      elapsed: this.elapsed,
      punches: this.punches,
      damagePlayer: (n, from) => this.damagePlayer(n, from),
      onPunchHit: (heavy, at) => this.onPunchHit(heavy, at),
      onThugKilled: (at) => this.onThugKilled(at),
      particles: this.particles,
      sfx: this.sfx,
    });
    this.updateWebShots(dt);

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
    if (this.climbing) targetYaw = Math.atan2(-this.wallN.x, -this.wallN.z);
    else if (hs > 2.5) targetYaw = Math.atan2(this.vel.x, this.vel.z);
    let dy = targetYaw - this.player.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.player.rotation.y += dy * k;

    this.applyPose(this.rig, hs, this.vel.y, this.grounded, this.attached, k, this.sliding, this.gliding, this.climbing);

    // punch animation: snap the striking arm forward
    if (this.attackAnim > 0 && !this.attached) {
      const punch = Math.sin(Math.min(1, this.attackAnim) * Math.PI);
      const arm = this.grounded ? this.rig.armR : this.rig.armL;
      arm.rotation.x = -1.45 * punch;
      arm.rotation.z = 0;
      this.rig.torso.rotation.y = 0.5 * punch * (this.grounded ? 1 : -1);
    } else {
      this.rig.torso.rotation.y *= 0.8;
    }

    // hit flash: briefly tint the rig red when damaged
    const flash = this.invulnT > 0.6 ? 0.9 : this.hitFlash * 0.7;
    (this.rig.torso.material as THREE.MeshToonMaterial).emissive.setRGB(flash, flash * 0.1, flash * 0.1);
    (this.rig.head.material as THREE.MeshToonMaterial).emissive.setRGB(flash * 0.6, 0, 0);

    // slide squash & stretch
    const targetY = this.sliding ? 0.58 : 1;
    const targetXZ = this.sliding ? 1.12 : 1;
    this.player.scale.y += (targetY - this.player.scale.y) * k;
    this.player.scale.x += (targetXZ - this.player.scale.x) * k;
    this.player.scale.z = this.player.scale.x;

    // slide dust trail
    if (this.sliding && speed > 6) {
      this.trailAcc += dt * 40;
      if (this.trailAcc > 1) {
        this.trailAcc = 0;
        this.particles.burst(
          _v.set(this.pos.x - this.vel.x * 0.05, this.pos.y - R + 0.12, this.pos.z - this.vel.z * 0.05),
          2,
          ["#8a93b8", "#aab3d4"],
          2.2,
          0.4,
          1.4
        );
      }
    }

    // web-chute deploy animation
    const gTarget = this.gliding ? 1 : 0.001;
    this.gliderS += (gTarget - this.gliderS) * (1 - Math.exp(-(this.gliding ? 15 : 20) * dt));
    this.glider.visible = this.gliderS > 0.02;
    if (this.glider.visible) {
      const s = this.gliderS * (this.gliding ? 1 + Math.sin(this.elapsed * 11) * 0.02 : 1);
      this.glider.scale.set(s, s * 0.94, s);
      this.glider.rotation.z = Math.sin(this.elapsed * 2.6) * 0.09 * this.gliderS;
      this.glider.rotation.x = THREE.MathUtils.clamp(this.vel.y * 0.014, -0.28, 0.3) * this.gliderS;
      if (this.gliding) {
        this.trailAcc += dt * 26;
        if (this.trailAcc > 1) {
          this.trailAcc = 0;
          this.particles.burst(
            _v.set(this.pos.x, this.pos.y - R - 0.4, this.pos.z),
            1,
            ["#aef3ff"],
            1.1,
            0.6,
            0.6
          );
        }
      }
    }

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

    // slide duck-cam & glide pull-back smoothing
    this.camSlide += ((this.sliding ? 1 : 0) - this.camSlide) * (1 - Math.exp(-10 * dt));
    this.camGlide += ((this.gliding ? 1 : 0) - this.camGlide) * (1 - Math.exp(-8 * dt));
    look.y -= this.camSlide * 0.55;

    this.camLook.lerp(look, 1 - Math.exp(-10 * dt));

    // distance: pulls back as you speed up for a wider, faster frame
    const distT =
      THREE.MathUtils.clamp(8.8 + speed * 0.09, 8.8, 15.5) +
      (this.attached ? 0.7 : 0) -
      this.camSlide * 1.2 +
      this.camGlide * 1.1;
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
    const targetFov =
      72 + Math.min(26, Math.max(0, speed - 10) * 0.62) + (this.attached ? 2 : 0) - this.camGlide * 3 + this.fovPunch;
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
    const rig = buildR6Rig({
      head: col.getHex(),
      torso: col.clone().multiplyScalar(0.75).getHex(),
      arms: col.clone().multiplyScalar(0.55).getHex(),
      legs: col.clone().multiplyScalar(0.55).getHex(),
    });
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
    this.maybeSubmitScore();
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
      sliding: this.sliding,
      gliding: this.gliding,
      climbing: this.climbing,
      dashReady: this.dashCd <= 0,
      hp: this.hp,
      punchCombo: this.comboCount,
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
