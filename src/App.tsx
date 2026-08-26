import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Engine, type HudData, type Mode, type Phase, type PopupData, type RunStats } from "./game/engine";
import type { DealerSnapshot } from "./game/dealers";
import { EndScreen, Hud, PauseScreen, Popups, ShopScreen, StartScreen, Toast } from "./components/ui";
import { MobileControls } from "./components/MobileControls";

const BEST_KEY = "websling-best-score";

const initialHud: HudData = {
  score: 0,
  combo: 0,
  time: 120,
  tokens: 0,
  tokensTotal: 20,
  speed: 0,
  alt: 0,
  attached: false,
  muted: false,
  anchor: null,
  mode: "free",
  hp: 100,
  maxHp: 100,
  cash: 0,
  power: null,
  powerPip: null,
  dealerNear: null,
  punchCombo: 0,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [hud, setHud] = useState<HudData>(initialHud);
  const [popups, setPopups] = useState<PopupData[]>([]);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [shop, setShop] = useState<DealerSnapshot | null>(null);
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const [best, setBest] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const [isNewBest, setIsNewBest] = useState(false);

  const isTouch = useMemo(
    () => typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window),
    []
  );

  useEffect(() => {
    if (!canvasRef.current || engineRef.current) return;
    const engine = new Engine(canvasRef.current, {
      onHud: setHud,
      onPopup: (p) => {
        setPopups((prev) => [...prev.slice(-12), p]);
        window.setTimeout(() => setPopups((prev) => prev.filter((x) => x.id !== p.id)), 1200);
      },
      onPhase: (p, s) => {
        setPhase(p);
        if (p !== "playing") setShop(null);
        if (s && (p === "won" || p === "lost")) {
          setStats(s);
          if (s.mode === "solo") {
            setBest((prevBest) => {
              const nb = s.score > prevBest;
              setIsNewBest(nb);
              const next = nb ? s.score : prevBest;
              try {
                localStorage.setItem(BEST_KEY, String(next));
              } catch {
                /* ignore */
              }
              return next;
            });
          } else {
            setIsNewBest(false);
          }
        }
      },
      onShop: setShop,
      onToast: (msg) => {
        const id = Date.now() + Math.random();
        setToast({ id, msg });
        window.setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 1800);
      },
    });
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const blurActive = () => (document.activeElement as HTMLElement | null)?.blur?.();

  const startMode = useCallback((m: Mode) => {
    blurActive();
    engineRef.current?.startRun(m);
  }, []);
  const resume = useCallback(() => {
    blurActive();
    engineRef.current?.resume();
  }, []);
  const restart = useCallback(() => {
    blurActive();
    engineRef.current?.restartRun();
  }, []);
  const toMenu = useCallback(() => {
    blurActive();
    engineRef.current?.toMenu();
  }, []);
  const buy = useCallback((kind: "power" | "heal" | "soda" | "upgrade", slot: number) => {
    engineRef.current?.buy(kind, slot);
  }, []);
  const closeShop = useCallback(() => {
    engineRef.current?.closeShop();
  }, []);

  const inGame = phase === "playing" || phase === "paused";

  return (
    <div className="fixed inset-0 bg-ink overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {inGame && <Hud hud={hud} />}
      {phase === "playing" && !shop && <Popups popups={popups} />}
      {isTouch && phase === "playing" && !shop && engineRef.current && <MobileControls engine={engineRef.current} />}

      {phase === "menu" && <StartScreen best={best} onMode={startMode} />}
      {phase === "paused" && <PauseScreen onResume={resume} onRestart={restart} onMenu={toMenu} />}
      {phase === "playing" && shop && <ShopScreen snap={shop} onBuy={buy} onClose={closeShop} />}
      {(phase === "won" || phase === "lost") && stats && (
        <EndScreen won={phase === "won"} stats={stats} best={best} isNewBest={isNewBest} onRetry={restart} onMenu={toMenu} />
      )}

      {toast && <Toast msg={toast} />}
    </div>
  );
}
