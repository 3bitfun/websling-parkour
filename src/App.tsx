import { useCallback, useEffect, useRef, useState } from "react";
import {
  Engine,
  type HudData,
  type Mode,
  type Phase,
  type PopupData,
  type RunStats,
  type Standing,
} from "./game/engine";
import { randomCode, type NetStatus } from "./game/net";
import {
  BACKEND_READY,
  fetchLeaderboard,
  fetchMyBest,
  getSession,
  onAuthChange,
  signIn,
  signOutUser,
  signUp,
  updateDisplayName,
  type AccountUser,
  type BoardRow,
} from "./game/backend";
import {
  AccountModal,
  EndScreen,
  Hud,
  LeaderboardScreen,
  LobbyScreen,
  PauseScreen,
  Popups,
  StartScreen,
  Toast,
} from "./components/ui";

const BEST_KEY = "webrunner-best-score";
const NAME_KEY = "webrunner-name";

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
  mode: "solo",
  countdown: 0,
  standings: [],
  roomCode: null,
  sliding: false,
  gliding: false,
  dashReady: true,
  hp: 100,
  punchCombo: 0,
};

type BoardMode = "solo" | "free" | "versus" | "all";

const backendApi = { signUp, signIn, updateDisplayName };

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [hud, setHud] = useState<HudData>(initialHud);
  const [popups, setPopups] = useState<PopupData[]>([]);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [best, setBest] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const [isNewBest, setIsNewBest] = useState(false);
  const [muted, setMuted] = useState(false);

  // versus lobby state
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const [code, setCode] = useState(() => randomCode());
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) || "";
    } catch {
      return "";
    }
  });
  const [joined, setJoined] = useState(false);
  const [netStatus, setNetStatus] = useState<NetStatus>("off");
  const [roster, setRoster] = useState<Standing[]>([]);

  // accounts / leaderboard state
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardMode, setBoardMode] = useState<BoardMode>("all");
  const [boardRows, setBoardRows] = useState<BoardRow[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [myBest, setMyBest] = useState<number | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new Engine(canvasRef.current, {
      onHud: setHud,
      onPopup: (p) => {
        setPopups((prev) => [...prev.slice(-12), p]);
        window.setTimeout(() => setPopups((prev) => prev.filter((x) => x.id !== p.id)), 1200);
      },
      onPhase: (p, s) => {
        setPhase(p);
        if (p === "menu") {
          setLobbyOpen(false);
          setJoined(false);
          setRoster([]);
          setNetStatus("off");
        }
        if (s && (p === "won" || p === "lost")) {
          setStats(s);
          if (s.mode !== "versus") {
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
          // a finished run may have posted a new leaderboard entry
          if (BACKEND_READY) setRefreshTick((t) => t + 1);
        }
      },
      onRoster: setRoster,
      onNetStatus: setNetStatus,
      onToast: (msg) => setToast({ id: Date.now(), msg }),
    });
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // restore + track the pilot session
  useEffect(() => {
    if (!BACKEND_READY) return;
    getSession().then(setAccount).catch(() => {});
    const unsub = onAuthChange(setAccount);
    return unsub;
  }, []);

  // prefill the versus callsign from the account
  useEffect(() => {
    if (account?.displayName && !name.trim()) setName(account.displayName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  // toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // leaderboard fetch
  useEffect(() => {
    if (!boardOpen || !BACKEND_READY) return;
    let live = true;
    setBoardLoading(true);
    (async () => {
      try {
        const [rows, mine] = await Promise.all([
          fetchLeaderboard(boardMode),
          account ? fetchMyBest(boardMode, account.id) : Promise.resolve(null),
        ]);
        if (!live) return;
        setBoardRows(rows);
        setMyBest(mine);
      } catch {
        if (live) setBoardRows([]);
      } finally {
        if (live) setBoardLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [boardOpen, boardMode, account, refreshTick]);

  const blurActive = () => (document.activeElement as HTMLElement | null)?.blur?.();

  const pickMode = useCallback((m: Mode) => {
    blurActive();
    if (m === "versus") {
      setLobbyOpen(true);
    } else {
      engineRef.current?.startRun(m);
    }
  }, []);

  const joinRoom = useCallback(() => {
    blurActive();
    const finalName = name.trim() || `SPIDER-${Math.floor(Math.random() * 900) + 100}`;
    setName(finalName);
    try {
      localStorage.setItem(NAME_KEY, finalName);
    } catch {
      /* ignore */
    }
    engineRef.current?.joinRoom(code, finalName);
    setJoined(true);
  }, [code, name]);

  const leaveLobby = useCallback(() => {
    blurActive();
    engineRef.current?.leaveRoom();
    setLobbyOpen(false);
    setJoined(false);
  }, []);

  const startVersus = useCallback(() => {
    blurActive();
    engineRef.current?.startRun("versus");
    setLobbyOpen(false);
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
  const toggleMute = useCallback(() => {
    blurActive();
    engineRef.current?.toggleMute();
  }, []);

  const openBoard = useCallback((m?: BoardMode) => {
    blurActive();
    if (m) setBoardMode(m);
    setBoardOpen(true);
  }, []);

  const handleSignedIn = useCallback((u: AccountUser) => {
    setAccount(u);
    setAcctOpen(false);
    setToast({ id: Date.now(), msg: `WELCOME, ${(u.displayName ?? "PILOT").toUpperCase()}` });
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOutUser();
    setAccount(null);
    setAcctOpen(false);
    setToast({ id: Date.now(), msg: "SIGNED OUT" });
  }, []);

  return (
    <div className="fixed inset-0 bg-ink overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {(phase === "playing" || phase === "paused") && <Hud hud={hud} />}
      {phase === "playing" && <Popups popups={popups} />}

      {phase === "menu" && lobbyOpen && (
        <LobbyScreen
          code={code}
          onCode={setCode}
          name={name}
          onName={setName}
          joined={joined}
          status={netStatus}
          roster={roster}
          onJoin={joinRoom}
          onNewCode={() => {
            setCode(randomCode());
            blurActive();
          }}
          onStart={startVersus}
          onBack={leaveLobby}
        />
      )}
      {phase === "menu" && !lobbyOpen && (
        <StartScreen
          best={best}
          onMode={pickMode}
          account={account}
          backendOn={BACKEND_READY}
          onAccount={() => setAcctOpen(true)}
          onBoard={() => openBoard()}
        />
      )}
      {phase === "paused" && (
        <PauseScreen onResume={resume} onRestart={restart} onMenu={toMenu} muted={muted} onMute={toggleMute} />
      )}
      {(phase === "won" || phase === "lost") && stats && (
        <EndScreen
          won={phase === "won"}
          stats={stats}
          best={best}
          isNewBest={isNewBest}
          onRetry={restart}
          onMenu={toMenu}
          onBoard={BACKEND_READY ? () => openBoard(stats.mode === "free" ? "free" : stats.mode) : undefined}
        />
      )}

      {acctOpen && (
        <AccountModal
          account={account}
          backend={backendApi}
          onClose={() => setAcctOpen(false)}
          onSignedIn={handleSignedIn}
          onSignOut={handleSignOut}
        />
      )}
      {boardOpen && (
        <LeaderboardScreen
          mode={boardMode}
          onMode={setBoardMode}
          rows={boardRows}
          loading={boardLoading}
          myBest={myBest}
          account={account}
          onRefresh={() => setRefreshTick((t) => t + 1)}
          onClose={() => setBoardOpen(false)}
        />
      )}

      {toast && <Toast key={toast.id} msg={toast.msg} />}
    </div>
  );
}
