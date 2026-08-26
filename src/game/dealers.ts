import { POWERS, getPower, type PowerDef } from "./powers";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export const RARITY: Record<Rarity, { label: string; color: string }> = {
  common: { label: "COMMON", color: "#aab3d4" },
  rare: { label: "RARE", color: "#35e0ff" },
  epic: { label: "EPIC", color: "#ff4fd8" },
  legendary: { label: "LEGENDARY", color: "#ffcf3f" },
};

/** Base street price per rarity tier. */
export const BASE_PRICE: Record<Rarity, number> = {
  common: 400,
  rare: 900,
  epic: 1800,
  legendary: 3500,
};

/* ---------------- upgrades ---------------- */

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  base: number;
  max: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: "vitality", name: "VITALITY", desc: "+25 max health per level", base: 300, max: 4 },
  { id: "surge", name: "SURGE", desc: "+25 max energy per level", base: 300, max: 4 },
  { id: "flow", name: "FLOW", desc: "+20% energy regen per level", base: 350, max: 4 },
  { id: "might", name: "MIGHT", desc: "+12% damage per level", base: 450, max: 4 },
  { id: "aero", name: "AERO", desc: "+1.5 m/s top swing speed per level", base: 400, max: 4 },
  { id: "blink", name: "BLINK", desc: "-12% dash cooldown per level", base: 350, max: 4 },
];

export function upgradePrice(def: UpgradeDef, level: number): number {
  return Math.round((def.base * Math.pow(level + 1, 1.7)) / 10) * 10;
}

/* ---------------- dealers ---------------- */

export interface DealerMeta {
  id: string;
  name: string;
  flavor: string;
  palette: { head: number; torso: number; arms: number; legs: number; cap: number };
  canopy: string;
}

export const DEALERS: DealerMeta[] = [
  {
    id: "silk", name: "SILK", flavor: "No questions. No refunds. No witnesses.",
    palette: { head: 0xf2c99a, torso: 0x5a2f7f, arms: 0x5a2f7f, legs: 0x23263a, cap: 0xffcf3f },
    canopy: "#ff4fd8",
  },
  {
    id: "momo", name: "MOMO", flavor: "Fell off a truck. A very fast truck.",
    palette: { head: 0xc98e5a, torso: 0x2f6f4f, arms: 0x2f6f4f, legs: 0x2e3350, cap: 0x35e0ff },
    canopy: "#35e0ff",
  },
  {
    id: "vex", name: "VEX", flavor: "Prices go up when sirens go by.",
    palette: { head: 0x8a5a34, torso: 0x7f2f2f, arms: 0x7f2f2f, legs: 0x23263a, cap: 0xff2438 },
    canopy: "#ffcf3f",
  },
  {
    id: "roni", name: "RONI", flavor: "Park corner prices. Tourist premium.",
    palette: { head: 0xf7dcc0, torso: 0x2f4f7f, arms: 0x2f4f7f, legs: 0x27304a, cap: 0x52ffa8 },
    canopy: "#52ffa8",
  },
];

export const HEAL_PRICE = 150;
export const SODA_PRICE = 120;
export const HEAL_AMOUNT = 60;

/* ---------------- market simulation ---------------- */

export interface PowerListing {
  powerId: string;
  name: string;
  rarity: Rarity;
  color: number;
  glow: number;
  base: number;
  price: number;
  trend: -1 | 0 | 1;
  sold: boolean;
}

export interface UpgradeListing {
  def: UpgradeDef;
  level: number;
  price: number;
  maxed: boolean;
}

export interface DealerSnapshot {
  dealer: DealerMeta;
  cash: number;
  powers: PowerListing[];
  upgrades: UpgradeListing[];
  healPrice: number;
  sodaPrice: number;
}

interface DealerStock {
  powers: { powerId: string; sold: boolean }[];
}

const SLOTS_PER_DEALER = 3;

/**
 * Simulated black market: every power has a price multiplier that random-walks,
 * each dealer carries a random stock that sells out and restocks.
 */
export class Market {
  private mult: Record<string, number> = {};
  private prevMult: Record<string, number> = {};
  private stocks: DealerStock[] = [];
  private walkT = 0;
  private restockT = 0;

  constructor() {
    for (const p of POWERS) {
      this.mult[p.id] = 0.85 + Math.random() * 0.3;
      this.prevMult[p.id] = this.mult[p.id];
    }
    for (let i = 0; i < DEALERS.length; i++) this.stocks.push({ powers: this.rollStock() });
  }

  private rollStock(): { powerId: string; sold: boolean }[] {
    const pool = [...POWERS];
    const out: { powerId: string; sold: boolean }[] = [];
    for (let i = 0; i < SLOTS_PER_DEALER && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      out.push({ powerId: pool[idx].id, sold: false });
      pool.splice(idx, 1);
    }
    return out;
  }

  /** Advance price walk + restocks. */
  tick(dt: number) {
    this.walkT += dt;
    this.restockT += dt;
    if (this.walkT >= 40) {
      this.walkT = 0;
      for (const p of POWERS) {
        this.prevMult[p.id] = this.mult[p.id];
        const next = this.mult[p.id] * (0.88 + Math.random() * 0.24);
        this.mult[p.id] = Math.min(1.5, Math.max(0.65, next));
      }
    }
    if (this.restockT >= 75) {
      this.restockT = 0;
      for (const s of this.stocks) {
        const sold = s.powers.filter((x) => x.sold);
        if (sold.length) sold[Math.floor(Math.random() * sold.length)].sold = false;
      }
    }
  }

  price(powerId: string, dealerIdx: number): number {
    const def = getPower(powerId);
    if (!def) return 0;
    const variance = 0.94 + ((dealerIdx * 37 + powerId.length * 13) % 15) / 100; // stable per-dealer cut
    return Math.round((BASE_PRICE[def.rarity] * this.mult[powerId] * variance) / 5) * 5;
  }

  private trend(powerId: string): -1 | 0 | 1 {
    const d = this.mult[powerId] - this.prevMult[powerId];
    if (d > 0.02) return 1;
    if (d < -0.02) return -1;
    return 0;
  }

  snapshot(dealerIdx: number, cash: number, upgrades: Record<string, number>): DealerSnapshot {
    const stock = this.stocks[dealerIdx];
    const powers: PowerListing[] = stock.powers.map((slot) => {
      const def = getPower(slot.powerId) as PowerDef;
      return {
        powerId: def.id,
        name: def.name,
        rarity: def.rarity,
        color: def.color,
        glow: def.glow,
        base: BASE_PRICE[def.rarity],
        price: this.price(def.id, dealerIdx),
        trend: this.trend(def.id),
        sold: slot.sold,
      };
    });
    const upgs: UpgradeListing[] = UPGRADES.map((def) => {
      const level = upgrades[def.id] ?? 0;
      return { def, level, price: upgradePrice(def, level), maxed: level >= def.max };
    });
    return {
      dealer: DEALERS[dealerIdx],
      cash,
      powers,
      upgrades: upgs,
      healPrice: HEAL_PRICE,
      sodaPrice: SODA_PRICE,
    };
  }

  /** Mark a power slot sold. Returns its price. */
  takePower(dealerIdx: number, slotIdx: number): number {
    const slot = this.stocks[dealerIdx].powers[slotIdx];
    const price = this.price(slot.powerId, dealerIdx);
    slot.sold = true;
    return price;
  }
}
