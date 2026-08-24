import { useCallback, useRef, useState } from "react";
import type { Engine } from "../game/engine";

interface Props {
  engine: Engine;
}

const JOY_R = 54;

/**
 * Touch overlay: left dynamic joystick + right drag-to-look + action button pad.
 * Multi-touch safe (each input tracks its own pointerId).
 */
export function MobileControls({ engine }: Props) {
  const [joy, setJoy] = useState<{ bx: number; by: number; kx: number; ky: number } | null>(null);
  const joyId = useRef<number | null>(null);
  const joyOrigin = useRef({ x: 0, y: 0 });
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });

  /* ---------- joystick ---------- */
  const joyDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joyId.current !== null) return;
      joyId.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      joyOrigin.current = { x: e.clientX, y: e.clientY };
      setJoy({ bx: e.clientX, by: e.clientY, kx: e.clientX, ky: e.clientY });
    },
    []
  );
  const joyMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerId !== joyId.current) return;
      let dx = e.clientX - joyOrigin.current.x;
      let dy = e.clientY - joyOrigin.current.y;
      const len = Math.hypot(dx, dy);
      if (len > JOY_R) {
        dx = (dx / len) * JOY_R;
        dy = (dy / len) * JOY_R;
      }
      engine.touch.joyX = dx / JOY_R;
      engine.touch.joyY = dy / JOY_R; // up (negative) = forward
      setJoy({
        bx: joyOrigin.current.x,
        by: joyOrigin.current.y,
        kx: joyOrigin.current.x + dx,
        ky: joyOrigin.current.y + dy,
      });
    },
    [engine]
  );
  const joyEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerId !== joyId.current) return;
      joyId.current = null;
      engine.touch.joyX = 0;
      engine.touch.joyY = 0;
      setJoy(null);
    },
    [engine]
  );

  /* ---------- camera drag ---------- */
  const lookDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (lookId.current !== null) return;
    lookId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    lookLast.current = { x: e.clientX, y: e.clientY };
  }, []);
  const lookMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerId !== lookId.current) return;
      const dx = e.clientX - lookLast.current.x;
      const dy = e.clientY - lookLast.current.y;
      lookLast.current = { x: e.clientX, y: e.clientY };
      engine.lookDelta(dx, dy);
    },
    [engine]
  );
  const lookEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookId.current) return;
    lookId.current = null;
  }, []);

  /* ---------- buttons ---------- */
  const hold = (field: "web" | "glide" | "slide", onUp?: () => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.dataset.held = "1";
      engine.touch[field] = true;
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.dataset.held = "";
      engine.touch[field] = false;
      onUp?.();
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.dataset.held = "";
      engine.touch[field] = false;
    },
  });
  const tap = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      fn();
    },
  });

  return (
    <div className="absolute inset-0 z-30 select-none" style={{ touchAction: "none" }}>
      {/* camera drag layer (everything not covered by a control) */}
      <div className="absolute inset-0" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookEnd} onPointerCancel={lookEnd} />

      {/* joystick zone */}
      <div
        className="absolute left-0 bottom-0 w-[44%] h-[62%]"
        onPointerDown={joyDown}
        onPointerMove={joyMove}
        onPointerUp={joyEnd}
        onPointerCancel={joyEnd}
      >
        {joy && (
          <>
            <div
              className="absolute rounded-full border-2 border-web/40"
              style={{ left: joy.bx - JOY_R, top: joy.by - JOY_R, width: JOY_R * 2, height: JOY_R * 2, background: "rgba(7,11,34,0.35)" }}
            />
            <div
              className="absolute rounded-full border-2 border-spidey bg-spidey/70 shadow-[0_0_16px_rgba(255,36,56,0.6)]"
              style={{ left: joy.kx - 24, top: joy.ky - 24, width: 48, height: 48 }}
            />
          </>
        )}
        {!joy && (
          <div className="absolute left-8 bottom-10 w-28 h-28 rounded-full border-2 border-dashed border-web/30 flex items-center justify-center">
            <span className="font-display text-web/50 text-sm tracking-widest">MOVE</span>
          </div>
        )}
      </div>

      {/* left-side quick buttons (glide / slide) */}
      <div className="absolute left-[46%] bottom-6 flex flex-col gap-3">
        <button className="t-btn t-btn-sm t-btn-cyan" {...hold("glide")}>
          GLIDE
        </button>
        <button className="t-btn t-btn-sm t-btn-mint" {...hold("slide")}>
          SLIDE
        </button>
      </div>

      {/* right action pad */}
      <div className="absolute right-4 bottom-5" style={{ width: 200, height: 210 }}>
        <button className="t-btn t-btn-big t-btn-red absolute" style={{ right: 26, bottom: 52 }} {...hold("web", () => engine.touchWebRelease())}>
          WEB
        </button>
        <button className="t-btn absolute" style={{ right: 118, bottom: 128 }} {...tap(() => engine.touchJump())}>
          JUMP
        </button>
        <button className="t-btn absolute" style={{ right: 10, bottom: 150 }} {...tap(() => engine.touchPunch())}>
          HIT
        </button>
        <button className="t-btn t-btn-gold absolute" style={{ right: 128, bottom: 30 }} {...tap(() => engine.touchDash())}>
          DASH
        </button>
        <button className="t-btn t-btn-sm absolute" style={{ right: 150, bottom: 178 }} {...tap(() => engine.touchWebShot())}>
          THROW
        </button>
      </div>

      {/* pause */}
      <button
        className="t-btn absolute left-1/2 top-3 -translate-x-1/2"
        style={{ width: 46, height: 46 }}
        {...tap(() => engine.pause())}
        aria-label="Pause"
      >
        <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
          <rect x="3" y="2" width="4" height="12" />
          <rect x="9" y="2" width="4" height="12" />
        </svg>
      </button>
    </div>
  );
}
