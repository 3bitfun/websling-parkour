import { useState, type CSSProperties, type FormEvent } from "react";
import type { HudData, Mode, PopupData, RunStats, Standing } from "../game/engine";
import type { NetStatus } from "../game/net";
import { SUPABASE_CONFIGURED } from "../game/net";
import type { AccountUser, BoardRow } from "../game/backend";

/* ---------- decorative corner web (pure SVG) ---------- */
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
          return (
            <line
              key={`s${i}`}
              x1="0"
              y1="0"
              x2={Math.cos(a) * R}
              y2={Math.sin(a) * R}
              className="web-line"
              style={{ animationDelay: `${i * 0.05}s` }}
            />
          );
        })}
        {Array.from({ length: rings }, (_, i) => (
          <polygon
            key={`r${i}`}
            points={pts(((i + 1) / rings) * R * 0.92)}
            className="web-line"
            style={{ animationDelay: `${0.3 + i * 0.12}s` }}
          />
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

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      {muted ? (
        <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}

/* ---------- standings rows (shared by HUD + end screen) ---------- */
export function StandingsRows({ rows, compact = false }: { rows: Standing[]; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map((s, i) => (
        <div
          key={s.pid}
          className={`flex items-center gap-2 ${s.you ? "bg-spidey/15 border border-spidey/60" : "border border-transparent"} px-2 ${compact ? "py-[3px]" : "py-1.5"}`}
        >
          <span className={`font-display leading-none ${i === 0 ? "text-gold" : "text-white/50"} ${compact ? "text-sm w-4" : "text-lg w-5"}`}>{i + 1}</span>
          <span className="w-2.5 h-2.5 shrink-0" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
          <span className={`flex-1 truncate font-semibold tracking-wide ${s.you ? "text-white" : "text-white/75"} ${compact ? "text-[11px]" : "text-sm"}`}>
            {s.name}
            {s.you && <span className="text-spidey ml-1.5 text-[9px] font-bold tracking-[0.2em]">YOU</span>}
          </span>
          <span className={`font-display leading-none tabular-nums ${compact ? "text-sm" : "text-lg"} ${i === 0 ? "text-gold" : "text-white"}`}>
            {s.score.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------- HUD ---------- */
export function Hud({ hud }: { hud: HudData }) {
  const low = hud.time <= 10 && hud.mode !== "free";
  const speedPct = Math.min(1, hud.speed / 55);
  const altPct = Math.min(1, hud.alt / 90);
  return (
    <div className="absolute inset-0 pointer-events-none font-body">
      {/* speed vignette */}
      <div
        className="absolute inset-0 transition-opacity duration-200"
        style={{
          opacity: Math.min(1, Math.max(0, (hud.speed - 14) / 45)),
          boxShadow: "inset 0 0 130px rgba(53,224,255,0.4), inset 0 0 60px rgba(255,79,216,0.15)",
        }}
      />
      <div className="absolute inset-0 halftone opacity-[0.05]" />

      {/* reticle */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div
          className={`transition-all duration-150 ${hud.attached ? "scale-125" : "scale-100"}`}
          style={{ width: 34, height: 34 }}
        >
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

      {/* countdown */}
      {hud.countdown > 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[11px] font-bold tracking-[0.5em] text-web/80 mb-2">GET READY</div>
          <div
            key={Math.ceil(hud.countdown)}
            className="anim-pop font-display leading-none text-[22vh] text-gold text-outline"
            style={{ textShadow: "8px 8px 0 rgba(255,36,56,0.85), 0 0 60px rgba(255,207,63,0.4)" }}
          >
            {Math.ceil(hud.countdown)}
          </div>
        </div>
      )}

      {/* score + combo */}
      <div className="hud-left absolute top-4 left-4 flex flex-col gap-2">
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
                <div
                  key={i}
                  className={`w-3 h-3 rotate-45 border ${
                    hud.combo >= i ? "bg-spidey border-spidey shadow-[0_0_8px_rgba(255,36,56,0.9)]" : "border-spidey/40"
                  }`}
                />
              ))}
            </div>
            <span className={`font-display text-xl leading-none ${hud.combo > 0 ? "text-gold" : "text-white/40"}`}>
              x{Math.max(1, hud.combo)}
            </span>
          </div>
        </div>
        {(hud.sliding || hud.gliding || hud.climbing) && (
          <div key={hud.climbing ? "c" : hud.sliding ? "s" : "g"} className="anim-pop w-fit px-4 py-1 font-display text-lg tracking-widest text-outline-thin" style={{ background: hud.climbing ? "rgba(255,79,216,0.16)" : hud.sliding ? "rgba(82,255,168,0.16)" : "rgba(53,224,255,0.14)", border: `2px solid ${hud.climbing ? "#ff4fd8" : hud.sliding ? "#52ffa8" : "#35e0ff"}`, color: hud.climbing ? "#ff9bea" : hud.sliding ? "#52ffa8" : "#aef3ff", transform: "skewX(-6deg)" }}>
            {hud.climbing ? "CLIMBING" : hud.sliding ? "SLIDING" : "GLIDING"}
          </div>
        )}
      </div>

      {/* right column: timer / tokens / leaderboard / mute */}
      <div className="hud-right absolute top-4 right-4 flex flex-col items-end gap-2">
        {hud.mode === "free" ? (
          <div className="panel panel-red px-5 py-2.5 text-right">
            <div className="text-[10px] font-bold tracking-[0.3em] text-spidey/90">MODE</div>
            <div className="font-display text-3xl leading-none text-mint text-outline-thin">FREE SWING</div>
          </div>
        ) : (
          <div className="panel px-5 py-2.5 text-right">
            <div className="text-[10px] font-bold tracking-[0.3em] text-web/80">
              {hud.mode === "versus" ? "MATCH TIME" : "PATROL TIME"}
            </div>
            <div className={`font-display text-4xl leading-none tabular-nums text-outline-thin ${low ? "anim-danger" : "text-white"}`}>
              {Math.floor(hud.time / 60)}:{String(hud.time % 60).padStart(2, "0")}
            </div>
          </div>
        )}

        {hud.mode === "free" ? (
          <div className="panel px-5 py-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold tracking-[0.3em] text-gold">TOKENS</span>
              <span className="font-display text-2xl leading-none text-white tabular-nums">x{hud.tokens}</span>
            </div>
          </div>
        ) : (
          <div className="panel panel-red px-5 py-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold tracking-[0.3em] text-gold">TOKENS</span>
              <span className="font-display text-2xl leading-none text-white">
                {hud.tokens}
                <span className="text-white/45 text-lg">/{hud.tokensTotal}</span>
              </span>
              <div className="grid grid-cols-10 gap-[3px]">
                {Array.from({ length: hud.tokensTotal }, (_, i) => (
                  <div key={i} className={`w-1.5 h-1.5 ${i < hud.tokens ? "bg-gold" : "bg-white/15"}`} />
                ))}
              </div>
            </div>
          </div>
        )}

        {hud.mode === "versus" && hud.standings.length > 0 && (
          <div className="panel px-3 py-2.5 w-64">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold tracking-[0.3em] text-web/80">ROOM {hud.roomCode ?? ""}</span>
              <span className="text-[9px] font-bold tracking-widest text-white/40">LIVE</span>
            </div>
            <StandingsRows rows={hud.standings} compact />
          </div>
        )}

        <div className="panel px-3 py-1.5 flex items-center gap-2 text-web/90">
          <SpeakerIcon muted={hud.muted} />
          <span className="text-[10px] font-bold tracking-widest">M</span>
        </div>
      </div>

      {/* speed + alt */}
      <div className="hud-left absolute bottom-5 left-4 flex flex-col gap-2 w-56">
        <div className="panel px-4 py-2.5">
          <div className="flex justify-between text-[10px] font-bold tracking-[0.25em] text-web/80">
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
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] font-bold tracking-[0.25em] text-web/80">DASH [F]</span>
            <div
              className={`w-3 h-3 rotate-45 border transition-all duration-150 ${
                hud.dashReady
                  ? "bg-mint border-mint shadow-[0_0_10px_rgba(82,255,168,0.9)]"
                  : "border-web/30 scale-90"
              }`}
            />
          </div>
        </div>

        {/* health */}
        <div className={`panel px-4 py-2.5 ${hud.hp <= 30 ? "panel-red" : ""}`}>
          <div className="flex justify-between text-[10px] font-bold tracking-[0.25em] text-web/80">
            <span>HEALTH</span>
            <span className={`tabular-nums ${hud.hp <= 30 ? "text-spidey" : "text-white"}`}>{Math.round(hud.hp)}</span>
          </div>
          <div className="mt-1 h-2.5 bg-ink border border-web/30 overflow-hidden">
            <div
              className="h-full transition-[width] duration-200"
              style={{
                width: `${hud.hp}%`,
                background:
                  hud.hp > 60
                    ? "linear-gradient(90deg,#52ffa8,#35e0ff)"
                    : hud.hp > 30
                      ? "linear-gradient(90deg,#ffcf3f,#ff9d2e)"
                      : "linear-gradient(90deg,#ff2438,#b3121f)",
              }}
            />
          </div>
        </div>

        {/* punch combo */}
        {hud.punchCombo >= 2 && (
          <div
            key={hud.punchCombo}
            className="anim-pop w-fit px-4 py-1 font-display text-lg tracking-widest text-outline-thin"
            style={{ background: "rgba(255,207,63,0.14)", border: "2px solid #ffcf3f", color: "#ffcf3f", transform: "skewX(-6deg)" }}
          >
            PUNCH x{hud.punchCombo}
          </div>
        )}
      </div>

      {/* damage vignette */}
      {hud.hp < 100 && <div key={`hp-${Math.round(hud.hp / 10)}`} className="absolute inset-0 pointer-events-none damage-vignette" style={{ opacity: (100 - hud.hp) / 160 }} />}

      {/* contextual hint */}
      <div className="fine-only absolute bottom-5 left-1/2 -translate-x-1/2 text-center">
        <div
          key={hud.attached ? "a" : hud.climbing ? "c" : hud.gliding ? "g" : hud.sliding ? "s" : hud.speed > 2 ? "m" : "i"}
          className="anim-rise font-display text-xl tracking-wider text-outline-thin whitespace-nowrap"
          style={{ color: hud.attached ? "#ffcf3f" : hud.climbing ? "#ff9bea" : hud.gliding ? "#52ffa8" : "rgba(174,243,255,0.85)" }}
        >
          {hud.attached
            ? "RELEASE TO FLY!"
            : hud.climbing
              ? "W/S CLIMB · A/D SHIMMY · SPACE WALL-JUMP"
              : hud.gliding
                ? "GLIDING — SOFT LANDING SAVES YOUR COMBO"
                : hud.sliding
                  ? "SPACE OUT OF THE SLIDE!"
                  : hud.punchCombo >= 2
                    ? "KEEP THE PUNCH COMBO GOING!"
                    : hud.speed > 2
                      ? "LMB/Q WEB · X WEB-SHOT · RMB/E GLIDE · V PUNCH"
                      : "RUN AT A WALL + JUMP TO CLIMB IT"}
        </div>
      </div>

      {/* mini controls */}
      <div className="kb-only absolute bottom-5 right-4 flex flex-col gap-1 text-[10px] text-web/70 font-semibold tracking-wider text-right">
        <div><span className="text-white/80">SHIFT</span> RUN · <span className="text-white/80">CTRL/C</span> SLIDE · <span className="text-white/80">F</span> DASH · <span className="text-white/80">V</span> PUNCH</div>
        <div><span className="text-white/80">LMB/Q</span> SWING · <span className="text-white/80">X</span> WEB-SHOT · <span className="text-white/80">RMB/E</span> GLIDE · <span className="text-white/80">WALL</span> CLIMB</div>
      </div>
    </div>
  );
}

/* ---------- floating popups ---------- */
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
            fontSize: p.kind === "gold" ? 34 : p.kind === "red" ? 26 : 19,
            color: p.kind === "gold" ? "#ffcf3f" : p.kind === "red" ? "#ff2438" : "#8ae9ff",
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

/* ---------- key row ---------- */
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

/* ---------- mode selector row ---------- */
function ModeRow({
  n,
  title,
  desc,
  accent,
  delay,
  onClick,
}: {
  n: string;
  title: string;
  desc: string;
  accent: string;
  delay: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="menu-row anim-rise group w-full text-left flex items-center gap-5 px-6 py-4"
      style={{ animationDelay: `${delay}s`, "--accent": accent } as CSSProperties}
    >
      <span className="font-display text-4xl leading-none text-white/25 group-hover:text-white/70 transition-colors w-10 shrink-0">{n}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-display text-3xl leading-none tracking-wide text-white group-hover:translate-x-1 transition-transform" style={{ textShadow: `3px 3px 0 ${accent}` }}>
          {title}
        </span>
        <span className="block mt-1 text-[12px] font-semibold tracking-wider text-white/60 group-hover:text-white/85 transition-colors truncate">{desc}</span>
      </span>
      <span className="font-display text-3xl leading-none opacity-0 -translate-x-3 group-hover:opacity-100 group-hover:translate-x-0 transition-all" style={{ color: accent }}>
        &#9654;
      </span>
    </button>
  );
}

/* ---------- start screen ---------- */
export function StartScreen({
  best,
  onMode,
  account,
  backendOn,
  onAccount,
  onBoard,
}: {
  best: number;
  onMode: (m: Mode) => void;
  account: AccountUser | null;
  backendOn: boolean;
  onAccount: () => void;
  onBoard: () => void;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden font-body" style={{ background: "radial-gradient(ellipse at 85% 110%, rgba(20,24,66,0.6), rgba(4,6,20,0.9) 72%)" }}>
      <CornerWeb className="absolute -top-2 -right-2 w-[560px] h-[560px] opacity-80" />
      <CornerWeb className="absolute -bottom-2 -left-2 w-[380px] h-[380px] opacity-40 rotate-180" />
      <div className="absolute inset-0 halftone opacity-[0.07]" />

      {backendOn && (
        <div className="absolute top-4 right-4 z-30 flex items-center gap-2.5">
          {account && (
            <div className="panel panel-red px-4 py-1.5 flex items-center gap-2">
              <SpiderGlyph className="w-4 h-4 text-spidey" />
              <span className="font-display text-lg leading-none text-white tracking-wider">
                {(account.displayName ?? "SPIDER").toUpperCase()}
              </span>
            </div>
          )}
          <button onClick={onBoard} className="btn-comic px-5 py-2 text-lg bg-panel text-gold">
            <span>LEADERBOARD</span>
          </button>
          <button onClick={onAccount} className="btn-comic px-5 py-2 text-lg bg-panel text-web">
            <span>{account ? "ACCOUNT" : "SIGN IN"}</span>
          </button>
        </div>
      )}

      <div className="relative h-full max-w-6xl mx-auto px-8 md:px-14 flex flex-col justify-center">
        {/* header */}
        <div className="anim-title leading-none select-none">
          <div className="flex items-center gap-4">
            <span className="anim-bob inline-block">
              <SpiderGlyph className="w-10 h-10 md:w-14 md:h-14 text-spidey drop-shadow-[0_0_14px_rgba(255,36,56,0.7)]" />
            </span>
            <span className="font-display text-[min(9vw,88px)] leading-[0.85] text-spidey text-outline" style={{ textShadow: "6px 6px 0 #35e0ff, 12px 12px 0 rgba(7,11,34,0.85)", transform: "rotate(-2deg)" }}>
              WEBSLING
              <span className="block text-web" style={{ textShadow: "6px 6px 0 #ff2438, 12px 12px 0 rgba(7,11,34,0.85)", marginLeft: "0.28em" }}>
                PARKOUR
              </span>
            </span>
          </div>
          <div className="mt-2 ml-0.5 font-display text-[min(2.4vw,20px)] tracking-[0.42em] text-gold text-outline-thin">
            SWING · SLIDE · DASH · GLIDE
          </div>
        </div>

        {/* mode menu */}
        <div className="mt-9 max-w-2xl flex flex-col gap-3">
          <div className="text-[11px] font-bold tracking-[0.4em] text-web/70 mb-1">SELECT MODE</div>
          <ModeRow
            n="01"
            title="PATROL SHIFT"
            desc="Snag 20 tokens before the 2:00 clock runs dry. Land hard and your combo dies — glide down to save it."
            accent="#ff2438"
            delay={0.1}
            onClick={() => onMode("solo")}
          />
          <ModeRow
            n="02"
            title="FREE SWING"
            desc="No clock. No fail. The whole skyline is yours — chase pure score and style."
            accent="#52ffa8"
            delay={0.2}
            onClick={() => onMode("free")}
          />
          <ModeRow
            n="03"
            title="VERSUS"
            desc="Share a room code. Swing head-to-head — highest score when the clock hits zero wins."
            accent="#ff4fd8"
            delay={0.3}
            onClick={() => onMode("versus")}
          />
        </div>

        {/* footer strip */}
        <div className="anim-rise mt-9 flex flex-wrap items-center gap-x-8 gap-y-3" style={{ animationDelay: "0.4s" }}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10px] text-web/70 font-semibold tracking-wider">
            <span><span className="key-cap">LMB</span> / <span className="key-cap">Q</span> SWING</span>
            <span><span className="key-cap">X</span> WEB-SHOT</span>
            <span><span className="key-cap">SPACE</span> JUMP</span>
            <span><span className="key-cap">CTRL</span> / <span className="key-cap">C</span> SLIDE</span>
            <span><span className="key-cap">SHIFT</span> RUN</span>
            <span><span className="key-cap">F</span> DASH</span>
            <span><span className="key-cap">RMB</span> / <span className="key-cap">E</span> GLIDE</span>
            <span><span className="key-cap">V</span> PUNCH</span>
            <span>RUN+JUMP AT A WALL TO <span className="text-punch">CLIMB</span></span>
          </div>
          {best > 0 && (
            <span className="ml-auto text-[11px] tracking-widest font-semibold text-white/60">
              BEST SCORE <span className="font-display text-xl tracking-normal text-gold ml-1">{best.toLocaleString()}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- versus lobby ---------- */
export function LobbyScreen({
  code,
  onCode,
  name,
  onName,
  joined,
  status,
  roster,
  onJoin,
  onNewCode,
  onStart,
  onBack,
}: {
  code: string;
  onCode: (c: string) => void;
  name: string;
  onName: (n: string) => void;
  joined: boolean;
  status: NetStatus;
  roster: Standing[];
  onJoin: () => void;
  onNewCode: () => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const statusLabel = status === "online" ? "SUPABASE REALTIME" : status === "local" ? "LOCAL LINK (TABS)" : "NOT CONNECTED";
  const statusColor = status === "online" ? "#52ffa8" : status === "local" ? "#ffcf3f" : "#ff2438";
  return (
    <div className="absolute inset-0 overflow-hidden font-body" style={{ background: "radial-gradient(ellipse at 20% 100%, rgba(60,16,52,0.45), rgba(4,6,20,0.92) 70%)" }}>
      <CornerWeb className="absolute -top-2 -right-2 w-[480px] h-[480px] opacity-70" />
      <div className="absolute inset-0 halftone opacity-[0.06]" />

      <div className="relative h-full max-w-5xl mx-auto px-8 md:px-14 flex flex-col justify-center">
        <div className="anim-title leading-none select-none">
          <span className="font-display text-[min(8vw,72px)] text-punch text-outline" style={{ textShadow: "5px 5px 0 #35e0ff, 10px 10px 0 rgba(7,11,34,0.85)" }}>
            VERSUS LOBBY
          </span>
          <div className="mt-1 font-display text-[min(2.2vw,17px)] tracking-[0.34em] text-web text-outline-thin">
            SAME CITY · SAME CLOCK · ONE SKYLINE CHAMPION
          </div>
        </div>

        <div className="mt-8 grid md:grid-cols-[1.15fr_1fr] gap-5 max-w-4xl">
          {/* form */}
          <div className="panel px-7 py-6 anim-rise" style={{ animationDelay: "0.12s" }}>
            <label className="block text-[10px] font-bold tracking-[0.3em] text-web/80">YOUR CALLSIGN</label>
            <input
              value={name}
              onChange={(e) => onName(e.target.value.toUpperCase().slice(0, 12))}
              disabled={joined}
              className="lobby-input mt-1.5"
              placeholder="SPIDER-01"
              spellCheck={false}
            />
            <label className="block mt-5 text-[10px] font-bold tracking-[0.3em] text-web/80">ROOM CODE</label>
            <div className="flex gap-2 mt-1.5">
              <input
                value={code}
                onChange={(e) => onCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                disabled={joined}
                className="lobby-input flex-1 tracking-[0.35em] font-display text-2xl"
                placeholder="XXXXX"
                spellCheck={false}
              />
              <button onClick={onNewCode} disabled={joined} className="btn-comic px-4 py-2 text-lg bg-panel text-web disabled:opacity-40">
                <span>NEW</span>
              </button>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <span className="w-2.5 h-2.5" style={{ background: statusColor, boxShadow: `0 0 10px ${statusColor}` }} />
              <span className="text-[11px] font-bold tracking-[0.22em]" style={{ color: statusColor }}>
                {statusLabel}
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              {!joined ? (
                <button onClick={onJoin} disabled={code.length < 4 || name.trim().length === 0} className="btn-comic px-10 py-3 text-2xl bg-spidey text-white text-outline-thin disabled:opacity-40 disabled:cursor-not-allowed">
                  <span>JACK IN</span>
                </button>
              ) : (
                <button onClick={onStart} className="btn-comic px-10 py-3 text-2xl bg-mint text-ink">
                  <span>SWING IN</span>
                </button>
              )}
              <button onClick={onBack} className="btn-comic px-6 py-3 text-2xl bg-panel text-web">
                <span>BACK</span>
              </button>
            </div>
          </div>

          {/* roster */}
          <div className="panel panel-red px-7 py-6 anim-rise" style={{ animationDelay: "0.22s" }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.3em] text-spidey/90">SWINGERS IN ROOM</span>
              <span className="font-display text-2xl leading-none text-white tabular-nums">{roster.length}</span>
            </div>
            <div className="mt-3 min-h-[120px]">
              {roster.length === 0 ? (
                <div className="text-sm text-white/50 font-semibold leading-relaxed">
                  {joined
                    ? "You're in. Anyone who joins with the same code shows up here — and in your sky."
                    : "Jack in to open the channel. Codes are shared out-of-band: text it to a friend."}
                </div>
              ) : (
                <StandingsRows rows={roster} />
              )}
            </div>
            <div className="mt-4 border-t border-spidey/25 pt-3 text-[10px] leading-relaxed text-white/50 font-semibold tracking-wide">
              {SUPABASE_CONFIGURED
                ? "Connected over Supabase Realtime — play across devices and networks."
                : "No Supabase keys detected, so rooms link between tabs of this browser. Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to swing across the internet."}
            </div>
          </div>
        </div>

        <div className="anim-rise mt-6 text-[11px] tracking-[0.25em] font-semibold text-white/45" style={{ animationDelay: "0.32s" }}>
          MATCH = 2:00 · EVERYONE HITS SWING IN · A 3-2-1 DROP KEEPS IT FAIR
        </div>
      </div>
    </div>
  );
}

/* ---------- pause ---------- */
export function PauseScreen({ onResume, onRestart, onMenu, muted, onMute }: { onResume: () => void; onRestart: () => void; onMenu: () => void; muted: boolean; onMute: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center font-body" style={{ background: "rgba(4,6,20,0.78)", backdropFilter: "blur(3px)" }}>
      <div className="text-center">
        <div className="anim-pop font-display text-7xl text-web text-outline" style={{ textShadow: "5px 5px 0 rgba(255,36,56,0.8)" }}>
          PAUSED
        </div>
        <p className="mt-2 text-white/70 text-sm tracking-widest font-semibold">THE CITY CAN WAIT. PROBABLY.</p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <button onClick={onResume} className="btn-comic px-12 py-3 text-2xl bg-mint text-ink">
            <span>RESUME</span>
          </button>
          <button onClick={onRestart} className="btn-comic px-12 py-3 text-2xl bg-spidey text-white text-outline-thin">
            <span>RESTART RUN</span>
          </button>
          <div className="flex gap-3">
            <button onClick={onMute} className="btn-comic px-6 py-2 text-lg bg-panel text-web">
              <span className="flex items-center gap-2">
                <SpeakerIcon muted={muted} /> {muted ? "UNMUTE" : "MUTE"}
              </span>
            </button>
            <button onClick={onMenu} className="btn-comic px-6 py-2 text-lg bg-panel text-web">
              <span>QUIT TO MENU</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- end screens ---------- */
export function EndScreen({ won, stats, best, isNewBest, onRetry, onMenu, onBoard }: { won: boolean; stats: RunStats; best: number; isNewBest: boolean; onRetry: () => void; onMenu: () => void; onBoard?: () => void }) {
  const Row = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
    <div className="flex items-center justify-between gap-10 py-2 border-b border-web/15">
      <span className="text-[11px] font-bold tracking-[0.28em] text-web/75">{label}</span>
      <span className="font-display text-2xl leading-none" style={{ color: accent ?? "#fff" }}>
        {value}
      </span>
    </div>
  );
  const versus = stats.mode === "versus";
  const ord = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH"][Math.min(stats.placement - 1, 7)] ?? `${stats.placement}TH`;
  const title = stats.ko ? "KNOCKED OUT" : versus ? (won ? "SKYLINE CHAMPION" : "OUTSWUNG") : won ? "PATROL COMPLETE" : "TIME'S UP";
  const sub = stats.ko
    ? `The thugs got you after ${stats.thugsDown} takedowns. Shake it off and swing back in.`
    : versus
      ? won
        ? `You take the room at ${ord} place. The rooftops chant your callsign.`
        : `You placed ${ord}. The room swings on without mercy — rematch?`
      : won
        ? "Every token recovered. The skyline sleeps safe tonight."
        : `The clock beat you — ${stats.tokens} of 20 tokens recovered. The city still needs you.`;
  return (
    <div className="absolute inset-0 flex items-center justify-center font-body" style={{ background: "radial-gradient(ellipse at center, rgba(13,20,51,0.82), rgba(4,6,20,0.93))" }}>
      <CornerWeb className={`absolute w-[420px] h-[420px] opacity-40 ${won ? "-top-2 -right-2" : "-bottom-2 -left-2 rotate-180"}`} />
      <div className="relative text-center px-6 max-w-lg w-full">
        <div className="anim-pop font-display text-[min(10vw,84px)] leading-none text-outline" style={{ color: won ? "#ffcf3f" : "#ff2438", textShadow: `6px 6px 0 ${won ? "rgba(255,36,56,0.85)" : "rgba(53,224,255,0.7)"}` }}>
          {title}
        </div>
        {versus && (
          <div className="anim-pop mt-2 inline-block px-6 py-1 font-display text-3xl tracking-wider" style={{ background: won ? "#ffcf3f" : "#35e0ff", color: "#070b22", transform: "skewX(-6deg) rotate(-1.5deg)", animationDelay: "0.15s" }}>
            {ord} PLACE
          </div>
        )}
        <p className="mt-3 text-white/75 text-sm md:text-base font-semibold tracking-wide">{sub}</p>

        {isNewBest && !versus && (
          <div className="anim-pop mt-3 inline-block px-5 py-1 bg-gold text-ink font-display text-xl tracking-wider" style={{ transform: "skewX(-6deg) rotate(-2deg)", animationDelay: "0.4s" }}>
            NEW BEST SCORE!
          </div>
        )}

        <div className="anim-rise mt-5 panel px-7 py-4 text-left" style={{ animationDelay: "0.2s" }}>
          <Row label="FINAL SCORE" value={stats.score.toLocaleString()} accent="#ffcf3f" />
          <Row label="TOKENS" value={`${stats.tokens}${stats.mode === "solo" ? " / 20" : ""}`} />
          <Row label="BEST COMBO" value={`x${Math.max(1, stats.maxCombo)}`} accent="#ff2438" />
          <Row label="LONGEST SWING" value={`${stats.bestSwing} m`} accent="#35e0ff" />
          {stats.thugsDown > 0 && <Row label="THUGS DOWN" value={`${stats.thugsDown}`} accent="#52ffa8" />}
          {stats.mode === "solo" && won && <Row label="TIME TO SPARE" value={`${stats.timeLeft}s`} accent="#52ffa8" />}
          {versus && stats.standings.length > 1 && (
            <div className="pt-3">
              <div className="text-[10px] font-bold tracking-[0.3em] text-web/75 mb-2">MATCH STANDINGS</div>
              <StandingsRows rows={stats.standings} />
            </div>
          )}
        </div>

        {!versus && (
          <div className="mt-3 text-xs tracking-widest font-semibold text-white/55">
            BEST SCORE <span className="text-gold font-display text-base tracking-normal">{best.toLocaleString()}</span>
          </div>
        )}

        <div className="anim-rise mt-6 flex items-center justify-center gap-4" style={{ animationDelay: "0.3s" }}>
          <button onClick={onRetry} className="btn-comic px-12 py-3 text-2xl bg-spidey text-white text-outline-thin">
            <span>{versus ? "REMATCH" : "SWING AGAIN"}</span>
          </button>
          {onBoard && (
            <button onClick={onBoard} className="btn-comic px-8 py-3 text-2xl bg-panel text-gold">
              <span>LEADERBOARD</span>
            </button>
          )}
          <button onClick={onMenu} className="btn-comic px-8 py-3 text-2xl bg-panel text-web">
            <span>MENU</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- toast ---------- */
export function Toast({ msg }: { msg: string }) {
  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div key={msg} className="anim-pop panel panel-red px-6 py-2">
        <span className="font-display text-xl tracking-wider text-gold text-outline-thin">{msg}</span>
      </div>
    </div>
  );
}

/* ---------- account modal ---------- */
export function AccountModal({
  account,
  backend,
  onClose,
  onSignedIn,
  onSignOut,
}: {
  account: AccountUser | null;
  backend: {
    signUp: (e: string, p: string, n: string) => Promise<AccountUser>;
    signIn: (e: string, p: string) => Promise<AccountUser>;
    updateDisplayName: (id: string, n: string) => Promise<string>;
  };
  onClose: () => void;
  onSignedIn: (u: AccountUser) => void;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setSaved(false);
    setBusy(true);
    try {
      if (account) {
        const n = await backend.updateDisplayName(account.id, name || account.displayName || "SPIDER");
        onSignedIn({ ...account, displayName: n });
        setSaved(true);
      } else if (tab === "up") {
        if (pw.length < 6) throw new Error("Password must be at least 6 characters.");
        const u = await backend.signUp(email, pw, name || "SPIDER");
        onSignedIn(u);
      } else {
        const u = await backend.signIn(email, pw);
        onSignedIn(u);
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const tabBtn = (active: boolean) =>
    `btn-comic px-6 py-2 text-lg ${active ? "bg-spidey text-white text-outline-thin" : "bg-panel text-web/80"}`;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center font-body" style={{ background: "rgba(4,6,20,0.8)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div className="relative w-full max-w-md mx-4 anim-pop" onClick={(e) => e.stopPropagation()}>
        <div className="panel px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="font-display text-4xl text-spidey text-outline-thin" style={{ textShadow: "3px 3px 0 #35e0ff" }}>
              PILOT ACCOUNT
            </div>
            <button onClick={onClose} className="text-web/60 hover:text-spidey font-display text-2xl leading-none transition-colors" aria-label="Close">
              &#10005;
            </button>
          </div>

          {account ? (
            <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
              <div>
                <div className="text-[10px] font-bold tracking-[0.3em] text-web/70 mb-1">SIGNED IN AS</div>
                <div className="text-sm text-white/85 font-semibold break-all">{account.email}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold tracking-[0.3em] text-web/70 mb-1">CALLSIGN</div>
                <input className="lobby-input" value={name} placeholder={account.displayName ?? "SPIDER"} maxLength={14} onChange={(e) => setName(e.target.value)} />
              </div>
              {err && <div className="text-spidey text-xs font-bold tracking-wide">{err}</div>}
              {saved && <div className="text-mint text-xs font-bold tracking-wide">CALLSIGN SAVED!</div>}
              <button type="submit" disabled={busy} className="btn-comic mt-1 px-6 py-2.5 text-xl bg-mint text-ink disabled:opacity-50">
                <span>{busy ? "SAVING…" : "SAVE CALLSIGN"}</span>
              </button>
              <button type="button" onClick={onSignOut} className="btn-comic px-6 py-2 text-lg bg-panel text-spidey">
                <span>SIGN OUT</span>
              </button>
            </form>
          ) : (
            <>
              <div className="mt-5 flex gap-3">
                <button onClick={() => { setTab("in"); setErr(""); }} className={tabBtn(tab === "in")}>
                  <span>SIGN IN</span>
                </button>
                <button onClick={() => { setTab("up"); setErr(""); }} className={tabBtn(tab === "up")}>
                  <span>NEW PILOT</span>
                </button>
              </div>
              <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
                {tab === "up" && (
                  <div>
                    <div className="text-[10px] font-bold tracking-[0.3em] text-web/70 mb-1">CALLSIGN</div>
                    <input className="lobby-input" value={name} placeholder="SPIDER" maxLength={14} onChange={(e) => setName(e.target.value)} />
                  </div>
                )}
                <div>
                  <div className="text-[10px] font-bold tracking-[0.3em] text-web/70 mb-1">EMAIL</div>
                  <input className="lobby-input" type="email" required value={email} placeholder="you@city.net" onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <div className="text-[10px] font-bold tracking-[0.3em] text-web/70 mb-1">PASSWORD</div>
                  <input className="lobby-input" type="password" required value={pw} placeholder="••••••" onChange={(e) => setPw(e.target.value)} />
                </div>
                {err && <div className="text-spidey text-xs font-bold tracking-wide">{err}</div>}
                <button type="submit" disabled={busy} className="btn-comic mt-1 px-6 py-2.5 text-xl bg-spidey text-white text-outline-thin disabled:opacity-50">
                  <span>{busy ? "WORKING…" : tab === "up" ? "CREATE ACCOUNT" : "SIGN IN"}</span>
                </button>
                <div className="text-[10px] text-white/45 font-semibold tracking-wide leading-relaxed">
                  No account? Scores stay on this device. With an account they post to the leaderboard.
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- leaderboard ---------- */
export function LeaderboardScreen({
  mode,
  onMode,
  rows,
  loading,
  myBest,
  account,
  onRefresh,
  onClose,
}: {
  mode: "solo" | "free" | "versus" | "all";
  onMode: (m: "solo" | "free" | "versus" | "all") => void;
  rows: BoardRow[];
  loading: boolean;
  myBest: number | null;
  account: AccountUser | null;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const tabs: { key: "all" | "solo" | "free" | "versus"; label: string }[] = [
    { key: "all", label: "ALL" },
    { key: "solo", label: "PATROL" },
    { key: "free", label: "FREE SWING" },
    { key: "versus", label: "VERSUS" },
  ];
  const modeChip = (m: string) =>
    m === "solo" ? "#ff2438" : m === "free" ? "#52ffa8" : "#ff4fd8";
  const rankStyle = (i: number) =>
    i === 0 ? "#ffcf3f" : i === 1 ? "#cfd8ff" : i === 2 ? "#d9a066" : "rgba(174,243,255,0.5)";
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center font-body" style={{ background: "rgba(4,6,20,0.86)", backdropFilter: "blur(4px)" }}>
      <CornerWeb className="absolute -top-2 -right-2 w-[420px] h-[420px] opacity-40" />
      <div className="absolute inset-0 halftone opacity-[0.05]" />
      <div className="relative w-full max-w-2xl mx-4 max-h-[88vh] flex flex-col anim-pop">
        <div className="panel px-7 py-5 flex flex-col min-h-0 flex-1">
          <div className="flex items-center justify-between gap-4">
            <div className="font-display text-5xl text-gold text-outline" style={{ textShadow: "4px 4px 0 rgba(255,36,56,0.85)" }}>
              LEADERBOARD
            </div>
            <div className="flex items-center gap-3">
              <button onClick={onRefresh} className="btn-comic px-4 py-1.5 text-base bg-panel text-web" title="Refresh">
                <span>&#8635; REFRESH</span>
              </button>
              <button onClick={onClose} className="text-web/60 hover:text-spidey font-display text-2xl leading-none transition-colors" aria-label="Close">
                &#10005;
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2 flex-wrap">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => onMode(t.key)}
                className={`btn-comic px-5 py-1.5 text-base ${mode === t.key ? "bg-spidey text-white text-outline-thin" : "bg-panel text-web/80"}`}
              >
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-4">
            {account ? (
              <div className="text-xs font-bold tracking-widest text-white/70">
                YOUR BEST{" "}
                <span className="font-display text-xl tracking-normal text-gold ml-1">
                  {myBest != null ? myBest.toLocaleString() : "—"}
                </span>
              </div>
            ) : (
              <div className="text-xs font-bold tracking-widest text-white/50">SIGN IN TO POST SCORES</div>
            )}
          </div>

          <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1">
            {loading ? (
              <div className="py-16 text-center font-display text-2xl tracking-widest text-web/60 anim-rise">
                CONTACTING HQ…
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center">
                <div className="font-display text-2xl tracking-widest text-web/50">NO RECORDS YET</div>
                <div className="mt-2 text-xs font-semibold tracking-widest text-white/40">BE THE FIRST ON THE BOARD</div>
              </div>
            ) : (
              <table className="w-full border-separate" style={{ borderSpacing: "0 4px" }}>
                <thead>
                  <tr className="text-[9px] font-bold tracking-[0.3em] text-web/60">
                    <th className="text-left pl-3 pb-1 w-14">RANK</th>
                    <th className="text-left pb-1">PILOT</th>
                    {mode === "all" && <th className="text-left pb-1 w-24">MODE</th>}
                    <th className="text-right pb-1 w-16">TOKENS</th>
                    <th className="text-right pr-3 pb-1 w-28">SCORE</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const you = account != null && r.userId === account.id;
                    return (
                      <tr
                        key={`${r.userId}-${i}`}
                        className={`transition-colors ${you ? "bg-spidey/15" : "hover:bg-web/5"}`}
                        style={{ boxShadow: you ? "inset 3px 0 0 #ff2438" : undefined }}
                      >
                        <td className="pl-3 py-1.5">
                          <span className="font-display text-xl" style={{ color: rankStyle(i) }}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="py-1.5">
                          <span className="text-sm font-bold tracking-wide text-white/90">{r.name}</span>
                          {you && (
                            <span className="ml-2 font-display text-[11px] tracking-wider text-spidey">YOU</span>
                          )}
                        </td>
                        {mode === "all" && (
                          <td className="py-1.5">
                            <span className="font-display text-[11px] tracking-wider px-1.5 py-0.5" style={{ color: modeChip(r.mode), border: `1.5px solid ${modeChip(r.mode)}` }}>
                              {r.mode === "solo" ? "PATROL" : r.mode === "free" ? "FREE" : "VERSUS"}
                            </span>
                          </td>
                        )}
                        <td className="py-1.5 text-right text-sm font-semibold text-gold/90 tabular-nums">{r.tokens}</td>
                        <td className="py-1.5 pr-3 text-right font-display text-xl text-white tabular-nums">{r.score.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-3 border-t border-web/15 pt-2 text-[9px] font-semibold tracking-[0.2em] text-white/35">
            BEST SCORE PER PILOT · TOP 100 · STORED IN WEBSLING_SCORES
          </div>
        </div>
      </div>
    </div>
  );
}
