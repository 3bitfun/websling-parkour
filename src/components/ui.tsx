import type { CSSProperties } from "react";
import type { HudData, Mode, PopupData, RunStats } from "../game/engine";
import type { DealerSnapshot } from "../game/dealers";
import { RARITY, HEAL_PRICE, SODA_PRICE, HEAL_AMOUNT } from "../game/dealers";
import { getPower } from "../game/powers";

/* ---------- decorative corner web ---------- */
export function CornerWeb({ className = "" }: { className?: string }) {
  const spokes = 13;
  const rings = 7;
  const R = 560;
  const pts = (r: number) =>
    Array.from({ length: spokes + 1 }, (_, i) => {
      const a = (i / spokes) * (Math.PI / 2);
      return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
    }).join(" ");
  return (
    <svg viewBox="0 0 560 560" className={className} aria-hidden>
      <g stroke="#35e0ff" strokeWidth="1.6" fill="none" opacity="0.5">
        {Array.from({ length: spokes }, (_, i) => {
          const a = (i / spokes) * (Math.PI / 2);
          return <line key={`s${i}`} x1="0" y1="0" x2={Math.cos(a) * R} y2={Math.sin(a) * R} />;
        })}
        {Array.from({ length: rings }, (_, i) => (
          <polygon key={`r${i}`} points={pts(((i + 1) / rings) * R * 0.92)} />
        ))}
      </g>
    </svg>
  );
}

export function SpiderGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <ellipse cx="24" cy="27" rx="6" ry="8" fill="currentColor" stroke="none" />
      <circle cx="24" cy="16" r="4.4" fill="currentColor" stroke="none" />
      <path d="M18 20 C 10 16, 7 10, 6 4" />
      <path d="M17 25 C 8 24, 4 21, 2 17" />
      <path d="M17 30 C 9 32, 5 36, 4 41" />
      <path d="M19 34 C 14 40, 13 43, 13 46" />
      <path d="M30 20 C 38 16, 41 10, 42 4" />
      <path d="M31 25 C 40 24, 44 21, 46 17" />
      <path d="M31 30 C 39 32, 43 36, 44 41" />
      <path d="M29 34 C 34 40, 35 43, 35 46" />
    </svg>
  );
}

function CashGlyph({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <rect x="2.5" y="6" width="19" height="12" rx="1.5" />
      <circle cx="12" cy="12" r="3.1" />
      <path d="M5.5 9.2h.01M18.5 14.8h.01" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- HUD ---------- */
export function Hud({ hud }: { hud: HudData }) {
  const hpPct = (hud.hp / hud.maxHp) * 100;
  const speedPct = Math.min(1, hud.speed / 55);
  const altPct = Math.min(1, hud.alt / 90);
  const lowTime = hud.mode === "solo" && hud.time <= 10;
  return (
    <div className="absolute inset-0 pointer-events-none font-body select-none">
      {/* speed vignette */}
      <div
        className="absolute inset-0 transition-opacity duration-200"
        style={{
          opacity: Math.min(1, Math.max(0, (hud.speed - 14) / 45)),
          boxShadow: "inset 0 0 130px rgba(53,224,255,0.35), inset 0 0 60px rgba(255,79,216,0.12)",
        }}
      />
      {hud.hp < hud.maxHp && (
        <div className="absolute inset-0 damage-vignette" style={{ opacity: (hud.maxHp - hud.hp) / (hud.maxHp * 1.6) }} />
      )}

      {/* reticle */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className={`transition-transform duration-150 ${hud.attached ? "scale-125" : "scale-100"}`} style={{ width: 34, height: 34 }}>
          <div className={`absolute inset-0 border-2 rotate-45 ${hud.attached ? "border-spidey" : "border-web/70"}`} />
          <div className={`absolute left-1/2 top-1/2 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${hud.attached ? "bg-spidey" : "bg-web"}`} />
        </div>
      </div>

      {/* anchor pip */}
      {hud.anchor && (
        <div className="absolute anchor-pip" style={{ left: hud.anchor.x, top: hud.anchor.y, width: 12, height: 12 }}>
          <div className={`absolute inset-0 border-2 ${hud.anchor.sky ? "border-punch/80" : "border-gold"}`} />
        </div>
      )}

      {/* nearest wild power pip */}
      {hud.powerPip && (
        <div className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2" style={{ left: hud.powerPip.x, top: hud.powerPip.y }}>
          <div className="w-3 h-3 border-2 rotate-45 anim-bob" style={{ borderColor: hud.powerPip.glow, boxShadow: `0 0 12px ${hud.powerPip.glow}` }} />
          <div className="mt-1.5 font-display text-[11px] tracking-widest" style={{ color: hud.powerPip.glow, textShadow: "0 0 6px rgba(0,0,0,0.8)" }}>
            {hud.powerPip.name.toUpperCase()}
          </div>
        </div>
      )}

      {/* score + combo */}
      <div className="absolute top-4 left-4 flex flex-col gap-2">
        <div className="panel px-5 py-2.5">
          <div className="text-[10px] font-bold tracking-[0.3em] text-web/80">SCORE</div>
          <div key={hud.score} className="score-pop font-display text-4xl leading-none text-white text-outline-thin tabular-nums">
            {hud.score.toLocaleString()}
          </div>
        </div>
        <div className="panel panel-red px-5 py-2 w-fit">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.3em] text-spidey/90">COMBO</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className={`w-3 h-3 rotate-45 border ${hud.combo >= i ? "bg-spidey border-spidey shadow-[0_0_8px_rgba(255,36,56,0.9)]" : "border-spidey/40"}`} />
              ))}
            </div>
            <span className={`font-display text-xl leading-none ${hud.combo > 0 ? "text-gold" : "text-white/40"}`}>x{Math.max(1, hud.combo)}</span>
          </div>
        </div>
        {hud.punchCombo >= 2 && (
          <div key={hud.punchCombo} className="anim-pop w-fit px-4 py-1 font-display text-lg tracking-widest text-outline-thin" style={{ background: "rgba(255,207,63,0.14)", border: "2px solid #ffcf3f", color: "#ffcf3f", transform: "skewX(-6deg)" }}>
            PUNCH x{hud.punchCombo}
          </div>
        )}
      </div>

      {/* right column: timer / tokens / cash */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
        {hud.mode === "solo" ? (
          <div className="panel px-5 py-2.5 text-right">
            <div className="text-[10px] font-bold tracking-[0.3em] text-web/80">PATROL TIME</div>
            <div className={`font-display text-4xl leading-none tabular-nums text-outline-thin ${lowTime ? "anim-danger text-spidey" : "text-white"}`}>
              {Math.floor(hud.time / 60)}:{String(hud.time % 60).padStart(2, "0")}
            </div>
          </div>
        ) : (
          <div className="panel panel-mint px-5 py-2">
            <div className="font-display text-2xl leading-none text-mint tracking-wider">FREE SWING</div>
            <div className="text-[9px] font-bold tracking-[0.3em] text-web/70 mt-0.5">NO CLOCK · ENDLESS</div>
          </div>
        )}
        {hud.mode === "solo" && (
          <div className="panel px-5 py-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold tracking-[0.3em] text-gold">TOKENS</span>
              <span className="font-display text-2xl leading-none text-white tabular-nums">
                {hud.tokens}
                <span className="text-white/45 text-lg">/{hud.tokensTotal}</span>
              </span>
            </div>
          </div>
        )}
        <div className="panel panel-mint px-5 py-2">
          <div className="flex items-center gap-2.5">
            <CashGlyph className="w-5 h-5 text-cash" />
            <span key={hud.cash} className="score-pop font-display text-2xl leading-none text-cash tabular-nums">
              ${hud.cash.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="panel px-3 py-1.5 flex items-center gap-2 text-web/90">
          <span className="text-[9px] font-bold tracking-widest">M — SOUND {hud.muted ? "OFF" : "ON"}</span>
        </div>
      </div>

      {/* power moveset bar */}
      {hud.power && <PowerBar hud={hud} />}

      {/* speed + alt + hp */}
      <div className="absolute bottom-5 left-4 flex flex-col gap-2 w-56">
        <div className={`panel px-4 py-2.5 ${hpPct <= 30 ? "panel-red" : ""}`}>
          <div className="flex justify-between text-[10px] font-bold tracking-[0.25em] text-web/80">
            <span>HEALTH</span>
            <span className={`tabular-nums ${hpPct <= 30 ? "text-spidey" : "text-white"}`}>{hud.hp}</span>
          </div>
          <div className="mt-1 h-2.5 bg-ink border border-web/30 overflow-hidden">
            <div
              className="h-full transition-[width] duration-200"
              style={{
                width: `${hpPct}%`,
                background: hpPct > 60 ? "linear-gradient(90deg,#52ffa8,#35e0ff)" : hpPct > 30 ? "linear-gradient(90deg,#ffcf3f,#ff9d2e)" : "linear-gradient(90deg,#ff2438,#b3121f)",
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-bold tracking-[0.25em] text-web/80 mt-1.5">
            <span>VELOCITY</span>
            <span className="text-white tabular-nums">{Math.round(hud.speed * 2.2)} km/h</span>
          </div>
          <div className="mt-1 h-2.5 bg-ink border border-web/30 overflow-hidden">
            <div
              className="h-full transition-[width] duration-100"
              style={{
                width: `${speedPct * 100}%`,
                background: speedPct > 0.75 ? "linear-gradient(90deg,#ffcf3f,#ff2438)" : "linear-gradient(90deg,#35e0ff,#52ffa8)",
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-bold tracking-[0.25em] text-web/80 mt-1.5">
            <span>ALTITUDE</span>
            <span className="text-white tabular-nums">{Math.round(hud.alt)} m</span>
          </div>
          <div className="mt-1 h-1.5 bg-ink border border-web/30 overflow-hidden">
            <div className="h-full bg-punch/80 transition-[width] duration-100" style={{ width: `${altPct * 100}%` }} />
          </div>
        </div>
      </div>

      {/* dealer prompt */}
      {hud.dealerNear && (
        <div className="absolute bottom-[19%] left-1/2 -translate-x-1/2 text-center">
          <div className="anim-pop inline-block px-6 py-2 font-display text-2xl tracking-wider text-outline-thin" style={{ background: "rgba(255,207,63,0.15)", border: "2px solid #ffcf3f", color: "#ffcf3f", transform: "skewX(-6deg)" }}>
            PRESS <span className="text-white">T</span> — DEAL WITH {hud.dealerNear}
          </div>
        </div>
      )}

      {/* contextual hint */}
      <div className="fine-only absolute bottom-5 left-1/2 -translate-x-1/2 text-center">
        <div
          key={hud.attached ? "a" : hud.dealerNear ? "d" : hud.speed > 2 ? "m" : "i"}
          className="anim-rise font-display text-xl tracking-wider text-outline-thin whitespace-nowrap"
          style={{ color: hud.attached ? "#ffcf3f" : "rgba(174,243,255,0.85)" }}
        >
          {hud.attached ? "RELEASE TO FLY!" : hud.power ? "Z X C V — UNLEASH YOUR POWER" : hud.speed > 2 ? "LMB/Q WEB · RMB/E GLIDE · V PUNCH" : "SHIFT RUN · CTRL SLIDE · SPACE JUMP · F DASH"}
        </div>
      </div>

      {/* mini controls */}
      <div className="kb-only absolute bottom-5 right-4 flex flex-col gap-1 text-[10px] text-web/70 font-semibold tracking-wider text-right">
        <div><span className="text-white/80">SHIFT</span> RUN · <span className="text-white/80">CTRL</span> SLIDE · <span className="text-white/80">F</span> DASH · <span className="text-white/80">V/B</span> PUNCH</div>
        <div><span className="text-white/80">LMB/Q</span> SWING · <span className="text-white/80">RMB/E</span> GLIDE · <span className="text-white/80">T</span> SHOP · <span className="text-white/80">P</span> PAUSE</div>
      </div>
    </div>
  );
}

/* ---------- power bar ---------- */
function PowerBar({ hud }: { hud: HudData }) {
  const p = hud.power!;
  const rarity = RARITY[p.rarity];
  const ePct = (p.energy / p.maxEnergy) * 100;
  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-none">
      <div className="flex items-end gap-2">
        <div className="panel px-3.5 py-2 text-center" style={{ borderColor: `${rarity.color}66`, boxShadow: `0 0 18px ${p.glow}33` }}>
          <div className="mx-auto mb-1 h-2.5 w-2.5 rounded-full" style={{ background: p.glow, boxShadow: `0 0 10px ${p.glow}` }} />
          <div className="font-display text-sm leading-tight text-white whitespace-nowrap">{p.name}</div>
          <div className="text-[8px] font-bold tracking-[0.2em]" style={{ color: rarity.color }}>{rarity.label}</div>
        </div>
        <div className="flex gap-1.5">
          {p.moves.map((m) => {
            const onCd = m.cd > 0;
            const pct = onCd ? (m.cd / m.maxCd) * 100 : 0;
            const ok = p.energy >= m.cost;
            return (
              <div key={m.key} className="relative overflow-hidden border-2 bg-ink/85" style={{ width: 58, height: 58, borderColor: onCd ? "rgba(174,243,255,0.2)" : ok ? p.glow : "rgba(255,36,56,0.5)", boxShadow: onCd ? "none" : `0 0 12px ${p.glow}44` }} title={m.name}>
                {onCd && <div className="absolute inset-x-0 bottom-0 bg-black/70" style={{ height: `${pct}%`, transition: "height 90ms linear" }} />}
                <div className="relative flex h-full flex-col items-center justify-center gap-0.5">
                  <span className="font-display text-lg leading-none" style={{ color: onCd ? "rgba(255,255,255,0.35)" : p.glow }}>{m.key}</span>
                  <span className="text-[7px] font-bold tracking-wider text-white/60 uppercase leading-none px-0.5 text-center">{m.name.split(" ").pop()}</span>
                  {onCd ? (
                    <span className="font-display text-[11px] leading-none text-white/80 tabular-nums">{m.cd.toFixed(1)}</span>
                  ) : (
                    <span className="text-[8px] leading-none font-bold tabular-nums" style={{ color: ok ? "#52ffa8" : "#ff2438" }}>{m.cost}⚡</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="panel px-3 py-2 w-40">
          <div className="flex justify-between text-[8px] font-bold tracking-[0.2em] text-web/80">
            <span>ENERGY</span>
            <span className="tabular-nums text-white">{p.energy}</span>
          </div>
          <div className="mt-1 h-2.5 border border-web/30 bg-ink overflow-hidden">
            <div className="h-full" style={{ width: `${ePct}%`, background: `linear-gradient(90deg, ${p.color}, ${p.glow})`, transition: "width 120ms linear" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- popups ---------- */
export function Popups({ popups }: { popups: PopupData[] }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {popups.map((p) => (
        <div
          key={p.id}
          className="absolute popup-float font-display text-outline-thin"
          style={{
            left: p.x,
            top: p.y,
            fontSize: p.kind === "gold" ? 32 : p.kind === "cash" ? 26 : p.kind === "red" ? 24 : 19,
            color: p.kind === "gold" ? "#ffcf3f" : p.kind === "red" ? "#ff2438" : p.kind === "cash" ? "#7dff9b" : "#aef3ff",
            textShadow: "0 0 18px rgba(0,0,0,0.55)",
            letterSpacing: "0.06em",
          }}
        >
          {p.text}
        </div>
      ))}
    </div>
  );
}

/* ---------- controls row ---------- */
function Control({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="flex gap-1.5">
        {keys.map((k) => (
          <span key={k} className="key-cap">{k}</span>
        ))}
      </div>
      <span className="text-sm text-white/85 font-semibold tracking-wide">{label}</span>
    </div>
  );
}

/* ---------- start screen ---------- */
export function StartScreen({ best, onMode }: { best: number; onMode: (m: Mode) => void }) {
  return (
    <div className="absolute inset-0 overflow-hidden font-body" style={{ background: "radial-gradient(ellipse at 85% 110%, rgba(20,24,66,0.6), rgba(4,6,20,0.9) 72%)" }}>
      <CornerWeb className="absolute -top-2 -right-2 w-[560px] h-[560px] opacity-80" />
      <CornerWeb className="absolute -bottom-2 -left-2 w-[380px] h-[380px] opacity-40 rotate-180" />
      <div className="absolute inset-0 halftone opacity-[0.07]" />

      <div className="relative h-full max-w-6xl mx-auto px-8 md:px-14 flex flex-col justify-center">
        <div className="anim-title select-none">
          <div className="font-display leading-[0.85]">
            <span className="block text-[min(9vw,86px)] text-spidey text-outline" style={{ textShadow: "6px 6px 0 #35e0ff, 12px 12px 0 rgba(7,11,34,0.85)", transform: "rotate(-2deg)" }}>
              WEBSLING
            </span>
            <span className="block text-[min(9vw,86px)] text-web text-outline" style={{ textShadow: "6px 6px 0 #ff2438, 12px 12px 0 rgba(7,11,34,0.85)", marginLeft: "0.28em" }}>
              PARKOUR
            </span>
          </div>
          <div className="mt-2 font-display text-[min(2.2vw,19px)] tracking-[0.42em] text-gold text-outline-thin">
            SWING · FIGHT · DEAL — QUEENS AFTER DARK
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 max-w-2xl">
          <button onClick={() => onMode("free")} className="menu-row text-left px-6 py-4" style={{ "--accent": "#52ffa8" } as CSSProperties}>
            <div className="flex items-center gap-4">
              <span className="font-display text-3xl text-mint">01</span>
              <div className="flex-1">
                <div className="font-display text-2xl text-white tracking-wide">FREE SWING</div>
                <div className="text-xs text-white/70 font-semibold">The main mode — endless night. Fight gangs, hunt wild powers, stack cash at the dealer stalls.</div>
              </div>
              <span className="font-display text-xl text-ink bg-mint px-3 py-0.5" style={{ transform: "skewX(-6deg)" }}>PLAY</span>
            </div>
          </button>
          <button onClick={() => onMode("solo")} className="menu-row text-left px-6 py-4" style={{ "--accent": "#ffcf3f" } as React.CSSProperties}>
            <div className="flex items-center gap-4">
              <span className="font-display text-3xl text-gold">02</span>
              <div className="flex-1">
                <div className="font-display text-2xl text-white tracking-wide">PATROL SHIFT</div>
                <div className="text-xs text-white/70 font-semibold">Grab 20 tokens before the 2:00 clock runs dry. Land hard and your combo dies.</div>
              </div>
              <span className="font-display text-xl text-ink bg-gold px-3 py-0.5" style={{ transform: "skewX(-6deg)" }}>PLAY</span>
            </div>
          </button>
        </div>

        <div className="anim-rise mt-7 grid grid-cols-1 sm:grid-cols-2 gap-x-12 panel px-7 py-4 max-w-2xl" style={{ animationDelay: "0.2s" }}>
          <Control keys={["HOLD LMB"]} label="Fire web · swing" />
          <Control keys={["SPACE"]} label="Jump · air flip" />
          <Control keys={["CTRL", "C"]} label="Slide" />
          <Control keys={["SHIFT"]} label="Sprint on foot" />
          <Control keys={["F"]} label="Dash" />
          <Control keys={["RMB", "E"]} label="Glide / brake" />
          <Control keys={["V", "B"]} label="Punch thugs" />
          <Control keys={["T"]} label="Open dealer stall" />
        </div>

        <div className="mt-5 flex items-center gap-6 text-xs tracking-widest font-semibold text-white/60">
          {best > 0 && (
            <span className="text-gold">
              BEST <span className="font-display text-base tracking-normal">{best.toLocaleString()}</span>
            </span>
          )}
          <span>WILD POWERS SPAWN ON THE STREETS — OR BUY THEM FROM SILK, MOMO & VEX</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- pause ---------- */
export function PauseScreen({ onResume, onRestart, onMenu }: { onResume: () => void; onRestart: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center font-body" style={{ background: "rgba(4,6,20,0.78)", backdropFilter: "blur(3px)" }}>
      <div className="text-center">
        <div className="anim-pop font-display text-7xl text-web text-outline" style={{ textShadow: "5px 5px 0 rgba(255,36,56,0.8)" }}>
          PAUSED
        </div>
        <p className="mt-2 text-white/70 text-sm tracking-widest font-semibold">THE CITY CAN WAIT. PROBABLY.</p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <button onClick={onResume} className="btn-comic px-12 py-3 text-2xl bg-mint text-ink"><span>RESUME</span></button>
          <button onClick={onRestart} className="btn-comic px-12 py-3 text-2xl bg-spidey text-white text-outline-thin"><span>RESTART RUN</span></button>
          <button onClick={onMenu} className="btn-comic px-8 py-2.5 text-xl bg-panel text-web"><span>QUIT TO MENU</span></button>
        </div>
      </div>
    </div>
  );
}

/* ---------- end screen ---------- */
export function EndScreen({ won, stats, best, isNewBest, onRetry, onMenu }: { won: boolean; stats: RunStats; best: number; isNewBest: boolean; onRetry: () => void; onMenu: () => void }) {
  const title = won ? "PATROL COMPLETE" : stats.ko ? "KNOCKED OUT" : "TIME'S UP";
  const sub = won
    ? "Every token recovered. The skyline sleeps safe tonight."
    : stats.ko
      ? "The gangs got the better of you. Glide landings and Haze smoke keep you standing."
      : `The clock beat you — ${stats.tokens} of 20 tokens recovered.`;
  const Row = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
    <div className="flex items-center justify-between gap-10 py-2 border-b border-web/15">
      <span className="text-[11px] font-bold tracking-[0.28em] text-web/75">{label}</span>
      <span className="font-display text-2xl leading-none" style={{ color: accent ?? "#fff" }}>{value}</span>
    </div>
  );
  return (
    <div className="absolute inset-0 flex items-center justify-center font-body" style={{ background: "radial-gradient(ellipse at center, rgba(13,20,51,0.82), rgba(4,6,20,0.93))" }}>
      <div className="relative text-center px-6">
        <div className="anim-pop font-display text-[min(10vw,86px)] leading-none text-outline" style={{ color: won ? "#ffcf3f" : "#ff2438", textShadow: `6px 6px 0 ${won ? "rgba(255,36,56,0.85)" : "rgba(53,224,255,0.7)"}` }}>
          {title}
        </div>
        <p className="mt-2 text-white/75 text-sm md:text-base font-semibold tracking-wide">{sub}</p>

        {isNewBest && (
          <div className="anim-pop mt-3 inline-block px-5 py-1 bg-gold text-ink font-display text-xl tracking-wider" style={{ transform: "skewX(-6deg) rotate(-2deg)", animationDelay: "0.4s" }}>
            NEW BEST SCORE!
          </div>
        )}

        <div className="anim-rise mt-6 mx-auto max-w-sm panel px-7 py-4 text-left" style={{ animationDelay: "0.2s" }}>
          <Row label="FINAL SCORE" value={stats.score.toLocaleString()} accent="#ffcf3f" />
          <Row label="TOKENS" value={`${stats.tokens}${stats.mode === "solo" ? " / 20" : ""}`} />
          <Row label="BEST COMBO" value={`x${Math.max(1, stats.maxCombo)}`} accent="#ff2438" />
          <Row label="LONGEST SWING" value={`${stats.bestSwing} m`} accent="#35e0ff" />
          {stats.thugsDown > 0 && <Row label="THUGS DOWN" value={`${stats.thugsDown}`} accent="#52ffa8" />}
          {won && <Row label="TIME TO SPARE" value={`${stats.timeLeft}s`} accent="#52ffa8" />}
        </div>

        <div className="mt-3 text-xs tracking-widest font-semibold text-white/55">
          BEST <span className="text-gold font-display text-base tracking-normal">{best.toLocaleString()}</span>
        </div>

        <div className="anim-rise mt-6 flex items-center justify-center gap-4" style={{ animationDelay: "0.3s" }}>
          <button onClick={onRetry} className="btn-comic px-12 py-3 text-2xl bg-spidey text-white text-outline-thin"><span>SWING AGAIN</span></button>
          <button onClick={onMenu} className="btn-comic px-8 py-3 text-2xl bg-panel text-web"><span>MENU</span></button>
        </div>
      </div>
    </div>
  );
}

/* ---------- dealer shop ---------- */
export function ShopScreen({ snap, onBuy, onClose }: { snap: DealerSnapshot; onBuy: (kind: "power" | "heal" | "soda" | "upgrade", slot: number) => void; onClose: () => void }) {
  const d = snap.dealer;
  const Trend = ({ t }: { t: -1 | 0 | 1 }) => (
    <span className={`font-display text-lg leading-none ${t > 0 ? "text-spidey" : t < 0 ? "text-mint" : "text-white/40"}`}>
      {t > 0 ? "▲" : t < 0 ? "▼" : "◆"}
    </span>
  );
  return (
    <div className="absolute inset-0 flex items-center justify-center font-body" style={{ background: "rgba(4,6,20,0.82)", backdropFilter: "blur(4px)" }}>
      <div className="anim-pop relative w-[min(960px,94vw)] max-h-[92vh] overflow-y-auto panel px-8 py-6" style={{ borderColor: `${d.canopy}88` }}>
        <div className="halftone absolute inset-0 opacity-[0.06] pointer-events-none" />
        {/* header */}
        <div className="relative flex items-center gap-5 border-b-2 pb-4" style={{ borderColor: `${d.canopy}55` }}>
          <div className="w-14 h-14 flex items-center justify-center border-2" style={{ borderColor: d.canopy, background: `${d.canopy}22` }}>
            <CashGlyph className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <div className="font-display text-5xl leading-none text-outline-thin" style={{ color: d.canopy }}>{d.name}'S DEALS</div>
            <div className="text-sm text-white/70 font-semibold italic mt-1">“{d.flavor}”</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold tracking-[0.3em] text-web/70">YOUR CASH</div>
            <div className="font-display text-4xl text-cash tabular-nums leading-none">${snap.cash.toLocaleString()}</div>
          </div>
          <button onClick={onClose} className="btn-comic px-4 py-1.5 text-lg bg-panel text-web"><span>ESC</span></button>
        </div>

        <div className="relative mt-5 grid md:grid-cols-[1.4fr_1fr] gap-6">
          {/* powers */}
          <div>
            <div className="text-[11px] font-bold tracking-[0.3em] text-gold mb-2">POWERS — TODAY'S STOCK</div>
            <div className="flex flex-col gap-2.5">
              {snap.powers.map((listing, i) => {
                const rarity = RARITY[listing.rarity];
                const def = getPower(listing.powerId);
                const affordable = snap.cash >= listing.price;
                return (
                  <div key={i} className="border-2 p-3 flex items-center gap-4" style={{ borderColor: listing.sold ? "rgba(174,243,255,0.15)" : `${rarity.color}66`, background: "rgba(7,11,34,0.7)", opacity: listing.sold ? 0.55 : 1 }}>
                    <div className="relative w-12 h-12 shrink-0 flex items-center justify-center" >
                      <div className="w-9 h-9 rounded-full" style={{ background: `#${listing.color.toString(16).padStart(6, "0")}`, boxShadow: `0 0 16px #${listing.glow.toString(16).padStart(6, "0")}` }} />
                      <div className="absolute inset-0 rounded-full border border-white/20" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-xl text-white leading-none">{listing.name}</span>
                        <span className="text-[9px] font-bold tracking-[0.2em] px-1.5 py-0.5" style={{ color: rarity.color, border: `1px solid ${rarity.color}66` }}>{rarity.label}</span>
                        <Trend t={listing.trend} />
                      </div>
                      {def && (
                        <div className="mt-1 text-[10px] text-white/55 font-semibold tracking-wide truncate">
                          {def.moves.map((m) => `${m.key}:${m.name}`).join(" · ")}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {listing.sold ? (
                        <span className="font-display text-lg text-white/40">SOLD</span>
                      ) : (
                        <>
                          <div className="font-display text-2xl leading-none tabular-nums" style={{ color: affordable ? "#7dff9b" : "#ff2438" }}>${listing.price.toLocaleString()}</div>
                          <button
                            onClick={() => onBuy("power", i)}
                            disabled={!affordable}
                            className={`btn-comic mt-1 px-4 py-1 text-sm ${affordable ? "bg-mint text-ink" : "bg-panel text-white/30"}`}
                          >
                            <span>BUY</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* consumables */}
            <div className="text-[11px] font-bold tracking-[0.3em] text-mint mt-5 mb-2">CONSUMABLES</div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="border-2 border-mint/40 p-3 flex items-center gap-3" style={{ background: "rgba(7,11,34,0.7)" }}>
                <div className="w-9 h-9 shrink-0 border-2 border-mint flex items-center justify-center font-display text-lg text-mint">+</div>
                <div className="flex-1">
                  <div className="font-display text-lg text-white leading-none">STREET MEDKIT</div>
                  <div className="text-[10px] text-white/55 font-semibold">+{HEAL_AMOUNT} HP right now</div>
                </div>
                <button onClick={() => onBuy("heal", 0)} disabled={snap.cash < snap.healPrice} className={`btn-comic px-3 py-1 text-sm ${snap.cash >= snap.healPrice ? "bg-mint text-ink" : "bg-panel text-white/30"}`}>
                  <span>${snap.healPrice}</span>
                </button>
              </div>
              <div className="border-2 border-web/40 p-3 flex items-center gap-3" style={{ background: "rgba(7,11,34,0.7)" }}>
                <div className="w-9 h-9 shrink-0 border-2 border-web flex items-center justify-center font-display text-lg text-web">⚡</div>
                <div className="flex-1">
                  <div className="font-display text-lg text-white leading-none">VOLT SODA</div>
                  <div className="text-[10px] text-white/55 font-semibold">Full energy refill</div>
                </div>
                <button onClick={() => onBuy("soda", 0)} disabled={snap.cash < snap.sodaPrice} className={`btn-comic px-3 py-1 text-sm ${snap.cash >= snap.sodaPrice ? "bg-web text-ink" : "bg-panel text-white/30"}`}>
                  <span>${snap.sodaPrice}</span>
                </button>
              </div>
            </div>
          </div>

          {/* upgrades */}
          <div>
            <div className="text-[11px] font-bold tracking-[0.3em] text-punch mb-2">UPGRADES — PERMANENT</div>
            <div className="flex flex-col gap-2">
              {snap.upgrades.map((u, i) => {
                const affordable = snap.cash >= u.price;
                return (
                  <div key={u.def.id} className="border-2 border-punch/30 p-2.5" style={{ background: "rgba(7,11,34,0.7)" }}>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-lg text-white leading-none">{u.def.name}</span>
                      <div className="flex gap-1 ml-1">
                        {Array.from({ length: u.def.max }, (_, j) => (
                          <div key={j} className={`w-2.5 h-2.5 rotate-45 border ${j < u.level ? "bg-punch border-punch" : "border-punch/35"}`} />
                        ))}
                      </div>
                      <span className="ml-auto text-[10px] font-bold text-web/60 tracking-wider">LV {u.level}/{u.def.max}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-white/55 font-semibold">{u.def.desc}</div>
                    <div className="mt-1.5 flex items-center justify-between">
                      {u.maxed ? (
                        <span className="font-display text-base text-gold">MAXED OUT</span>
                      ) : (
                        <>
                          <span className="font-display text-xl tabular-nums" style={{ color: affordable ? "#7dff9b" : "#ff2438" }}>${u.price.toLocaleString()}</span>
                          <button onClick={() => onBuy("upgrade", i)} disabled={!affordable} className={`btn-comic px-4 py-1 text-sm ${affordable ? "bg-punch text-ink" : "bg-panel text-white/30"}`}>
                            <span>UPGRADE</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-[10px] text-white/40 font-semibold tracking-wide leading-relaxed">
              Prices drift with the street market — restock hits soon. Earn cash from thug bounties and loose bills.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- toast ---------- */
export function Toast({ msg }: { msg: { id: number; msg: string } }) {
  return (
    <div key={msg.id} className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none">
      <div className="anim-pop px-6 py-2 font-display text-xl tracking-widest text-outline-thin" style={{ background: "rgba(7,11,34,0.9)", border: "2px solid #aef3ff", color: "#aef3ff", transform: "skewX(-6deg)" }}>
        {msg.msg}
      </div>
    </div>
  );
}

export { HEAL_PRICE, SODA_PRICE };
