export type Rarity = "common" | "rare" | "epic" | "legendary";

export const RARITY: Record<Rarity, { label: string; color: string }> = {
  common: { label: "COMMON", color: "#aab3d4" },
  rare: { label: "RARE", color: "#35e0ff" },
  epic: { label: "EPIC", color: "#ff4fd8" },
  legendary: { label: "LEGENDARY", color: "#ffcf3f" },
};

export interface Glove {
  id: string;
  name: string;
  rarity: Rarity;
  /** web-shot trail + reticle tint */
  tint: number;
  /** bonus to top swing speed (m/s) */
  swingBonus: number;
  /** coin price; 0 = not sold at the kiosk */
  price: number;
  hint: string;
}

export interface Suit {
  id: string;
  name: string;
  rarity: Rarity;
  head: number;
  torso: number;
  arms: number;
  legs: number;
  eye: number;
  price: number;
  hint: string;
}

export interface Circuit {
  id: string;
  name: string;
  tag: string;
  color: string;
  /** target time in seconds for the gold reward */
  target: number;
  reward: string; // item id granted on first target-beat
  /** path points [x, y, z] */
  pts: [number, number, number][];
}

export const GLOVES: Glove[] = [
  {
    id: "glove-starter",
    name: "STREET WRAPS",
    rarity: "common",
    tint: 0xaef3ff,
    swingBonus: 0,
    price: 0,
    hint: "Standard-issue web gloves. They get the job done.",
  },
  {
    id: "glove-amber",
    name: "AMBER GAUNTLETS",
    rarity: "rare",
    tint: 0xff9d2e,
    swingBonus: 2,
    price: 0,
    hint: "Forged under the Astoria El. Reward: ASTORIA SPRINT target.",
  },
  {
    id: "glove-volt",
    name: "VOLT WRAPS",
    rarity: "epic",
    tint: 0x52ffa8,
    swingBonus: 4,
    price: 350,
    hint: "Humming with stolen subway current. +4 swing speed.",
  },
  {
    id: "glove-golden",
    name: "GOLDEN TALONS",
    rarity: "legendary",
    tint: 0xffcf3f,
    swingBonus: 6,
    price: 0,
    hint: "Dipped in Unisphere gold. Reward: QUEENSBORO GAUNTLET target.",
  },
];

export const SUITS: Suit[] = [
  {
    id: "suit-spider",
    name: "SPIDER",
    rarity: "common",
    head: 0xffffff,
    torso: 0xffffff,
    arms: 0xffffff,
    legs: 0x2743b0,
    eye: 0xf4fbff,
    price: 0,
    hint: "The classic. Red on blue over the Queens skyline.",
  },
  {
    id: "suit-webslinger",
    name: "THE WEBSLINGER",
    rarity: "legendary",
    head: 0x14151f,
    torso: 0x14151f,
    arms: 0x1a1c2a,
    legs: 0x101018,
    eye: 0xffd76a,
    price: 0,
    hint: "He was here before you. Find him — he never leaves the Unisphere.",
  },
  {
    id: "suit-volt",
    name: "VOLTAGE",
    rarity: "epic",
    head: 0x0d3f33,
    torso: 0x0d3f33,
    arms: 0x0a2e26,
    legs: 0x082019,
    eye: 0x52ffa8,
    price: 400,
    hint: "Glow-in-the-dark for night patrol. The gangs hate it.",
  },
];

export const CIRCUITS: Circuit[] = [
  {
    id: "astoria",
    name: "ASTORIA SPRINT",
    tag: "STREET LEVEL · 8 RINGS",
    color: "#35e0ff",
    target: 55,
    reward: "glove-amber",
    pts: [
      [-192, 7, -128],
      [-192, 7, 64],
      [-64, 8, 192],
      [128, 7, 192],
      [192, 9, 0],
      [128, 8, -192],
      [-64, 7, -192],
      [-192, 8, -64],
    ],
  },
  {
    id: "rooftop",
    name: "ROOFTOP RUN",
    tag: "HIGH LINE · 8 RINGS",
    color: "#ff4fd8",
    target: 75,
    reward: "suit-volt",
    pts: [
      [-288, 52, -288],
      [-160, 58, -96],
      [-32, 64, 32],
      [96, 56, 160],
      [224, 50, 288],
      [288, 54, 96],
      [160, 60, -160],
      [-96, 62, -288],
    ],
  },
  {
    id: "queensboro",
    name: "QUEENSBORO GAUNTLET",
    tag: "BRIDGE CROSSING · 9 RINGS",
    color: "#ffcf3f",
    target: 70,
    reward: "glove-golden",
    pts: [
      [-320, 19, 0],
      [-192, 19, 0],
      [-64, 19, 0],
      [64, 19, 0],
      [192, 19, 0],
      [320, 24, 0],
      [330, 34, 128],
      [288, 34, 240],
      [272, 40, 300],
    ],
  },
];

/** Format milliseconds as m:ss.t */
export function fmtTime(ms: number): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  return `${m}:${String(s).padStart(2, "0")}.${d}`;
}
