export type ObjectiveKind = "tokens" | "coins" | "thugs" | "circuit" | "swing" | "eggs";

export interface ObjectiveDef {
  id: string;
  text: string;
  kind: ObjectiveKind;
  target: number;
  circuitId?: string;
}

export interface Mission {
  id: string;
  chapter: string;
  title: string;
  brief: string[];
  objectives: ObjectiveDef[];
  rewardCoins: number;
  rewardItem?: string;
  rewardNote?: string;
}

export interface ProgressState {
  idx: number;
  prog: Record<string, number>;
  done: boolean;
}

export const MISSIONS: Mission[] = [
  {
    id: "m1",
    chapter: "CHAPTER 1",
    title: "FIRST SWING",
    brief: [
      "Queens, 2:14 AM. The Elevated is quiet, the bodegas are shuttered, and somebody has to test the new web-shooters.",
      "That somebody is you. Get a feel for the skyline — snag patrol tokens and string together real swings. Aunt May thinks you're at a sleepover. Keep it that way.",
    ],
    objectives: [
      { id: "m1-tokens", text: "Collect patrol tokens", kind: "tokens", target: 5 },
      { id: "m1-swing", text: "Swing 400 m on the web", kind: "swing", target: 400 },
    ],
    rewardCoins: 150,
  },
  {
    id: "m2",
    chapter: "CHAPTER 2",
    title: "STREET SWEEPER",
    brief: [
      "Word on the corner: three crews are shaking down late-shift workers around the El stations. Skulls, Vipers, Embers — all of them loud, all of them dumb.",
      "Drop in, knock some sense into them, and scoop up the coins they scatter. The streets remember a favor.",
    ],
    objectives: [
      { id: "m2-thugs", text: "Knock out street thugs", kind: "thugs", target: 4 },
      { id: "m2-coins", text: "Sweep up street coins", kind: "coins", target: 30 },
    ],
    rewardCoins: 250,
  },
  {
    id: "m3",
    chapter: "CHAPTER 3",
    title: "ROOFTOP RUSH",
    brief: [
      "A radio crackle you shouldn't be hearing: something shiny is moving across the rooftops of central Queens. Could be drones. Could be worse.",
      "Chase it. Hit every patrol token you can and keep an eye out for the strange things this city hides on its highest ledges.",
    ],
    objectives: [
      { id: "m3-tokens", text: "Collect patrol tokens", kind: "tokens", target: 12 },
      { id: "m3-eggs", text: "Discover a hidden landmark", kind: "eggs", target: 1 },
    ],
    rewardCoins: 300,
  },
  {
    id: "m4",
    chapter: "CHAPTER 4",
    title: "THE FLUSHING FLYER",
    brief: [
      "An old courier route runs the length of Flushing — couriers used to run it on foot in eleven minutes. The neighborhood kids say nobody can swing it faster.",
      "Prove the kids wrong. Follow the beacon rings, hit the target time, and the AMBER GAUNTLETS are yours.",
    ],
    objectives: [
      { id: "m4-circuit", text: "Beat the Flushing Flyer target time", kind: "circuit", target: 1, circuitId: "flushing" },
    ],
    rewardCoins: 400,
    rewardItem: "glove-amber",
    rewardNote: "AMBER GAUNTLETS — forged under the Astoria El.",
  },
  {
    id: "m5",
    chapter: "CHAPTER 5",
    title: "TURF WAR",
    brief: [
      "The crews aren't scattered — they're consolidating. Ember brutes are holding the block parties hostage, Vipers run the alleyways, and the Skulls just like a fight.",
      "Break their grip on the borough. Every knockout thins their ranks and fattens your coin purse for the kiosk.",
    ],
    objectives: [
      { id: "m5-thugs", text: "Knock out crew members", kind: "thugs", target: 12 },
      { id: "m5-coins", text: "Collect coins", kind: "coins", target: 80 },
    ],
    rewardCoins: 500,
  },
  {
    id: "m6",
    chapter: "CHAPTER 6",
    title: "GHOST STORIES",
    brief: [
      "Every borough has its myths. A duck the size of a bus. A drum that beats at 3 AM. Lights over the marsh that were never planes.",
      "You've seen half of them from the web-line. Go find the rest — and swing far enough that the city starts to feel small.",
    ],
    objectives: [
      { id: "m6-eggs", text: "Discover hidden landmarks", kind: "eggs", target: 3 },
      { id: "m6-swing", text: "Swing 2,500 m on the web", kind: "swing", target: 2500 },
    ],
    rewardCoins: 600,
  },
  {
    id: "m7",
    chapter: "FINAL CHAPTER",
    title: "QUEENS LEGEND",
    brief: [
      "This is it. Every crew in the borough, every rooftop, every rumor — all of it converging on one night under the Unisphere.",
      "Clear the last of the crews, run the Queensboro Gauntlet for the record books, and fill the patrol ledger one final time. Do this, and they'll be telling stories about you for years.",
    ],
    objectives: [
      { id: "m7-tokens", text: "Collect patrol tokens", kind: "tokens", target: 20 },
      { id: "m7-thugs", text: "Knock out crew members", kind: "thugs", target: 10 },
      { id: "m7-circuit", text: "Beat the Queensboro Gauntlet target", kind: "circuit", target: 1, circuitId: "queensboro" },
    ],
    rewardCoins: 1000,
    rewardNote: "You are the Webslinger of Queens now. The skyline is yours.",
  },
];

export const STORY_KEY = "websling-progress-v1";

export function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(STORY_KEY);
    if (raw) {
      const p = JSON.parse(raw) as ProgressState;
      if (typeof p.idx === "number" && p.prog) return { done: !!p.done, idx: p.idx, prog: p.prog };
    }
  } catch {
    /* fresh start */
  }
  return { idx: 0, prog: {}, done: false };
}

export function saveProgress(p: ProgressState) {
  try {
    localStorage.setItem(STORY_KEY, JSON.stringify(p));
  } catch {
    /* storage full / blocked */
  }
}
