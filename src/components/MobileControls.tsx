import { useRef, useState } from "react";
import type { Engine } from "../game/engine";

/** On-screen controls for touch devices: stick, look zone and action cluster. */
export function MobileControls({ engine }: { engine: Engine }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stickId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const lookPrev = useRef({ x: 0, y: 0 });

  const stickStart = (e: React.PointerEvent) => {
    stickId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    stickMove(e);
  };
  const stickMove = (e: React.PointerEvent) => {
    if (stickId.current !== e.pointerId || !baseRef.current) return;
    const r = baseRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    setKnob({ x: dx, y: dy });
    engine.setTouchMove(dx, dy);
  };
  const stickEnd = (e: React.PointerEvent) => {
    if (stickId.current !== e.pointerId) return;
    stickId.current = null;
    setKnob({ x: 0, y: 0 });
    engine.setTouchMove(0, 0);
  };

  const lookStart = (e: React.PointerEvent) => {
    lookId.current = e.pointerId;
    lookPrev.current = { x: e.clientX, y: e.clientY };
  };
  const lookMove = (e: React.PointerEvent) => {
    if (lookId.current !== e.pointerId) return;
    const dx = e.clientX - lookPrev.current.x;
    const dy = e.clientY - lookPrev.current.y;
    lookPrev.current = { x: e.clientX, y: e.clientY };
    engine.touchLook(dx, dy);
  };
  const lookEnd = (e: React.PointerEvent) => {
    if (lookId.current === e.pointerId) lookId.current = null;
  };

  const hold = (fn: (on: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      fn(true);
    },
    onPointerUp: () => fn(false),
    onPointerCancel: () => fn(false),
    onPointerLeave: () => fn(false),
  });
  const tap = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      fn();
    },
  });

  return (
    <div className="absolute inset-0 pointer-events-none select-none" style={{ touchAction: "none" }}>
      {/* camera look zone — right half of the screen */}
      <div
        className="absolute right-0 top-0 h-full w-1/2 pointer-events-auto"
        onPointerDown={lookStart}
        onPointerMove={lookMove}
        onPointerUp={lookEnd}
        onPointerCancel={lookEnd}
      />

      {/* move stick */}
      <div className="absolute pointer-events-auto" style={{ left: "calc(env(safe-area-inset-left, 0px) + 18px)", bottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)" }}>
        <div
          ref={baseRef}
          className="joy-base relative"
          style={{ width: 128, height: 128, touchAction: "none" }}
          onPointerDown={stickStart}
          onPointerMove={stickMove}
          onPointerUp={stickEnd}
          onPointerCancel={stickEnd}
        >
          <div
            className="joy-knob absolute"
            style={{
              width: 56,
              height: 56,
              left: "50%",
              top: "50%",
              transform: `translate(calc(-50% + ${knob.x * 34}px), calc(-50% + ${knob.y * 34}px))`,
              transition: stickId.current === null ? "transform 120ms ease" : "none",
            }}
          />
        </div>
      </div>

      {/* action cluster */}
      <div className="absolute pointer-events-auto flex flex-col items-end gap-2.5" style={{ right: "calc(env(safe-area-inset-right, 0px) + 16px)", bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
        <div className="flex items-end gap-2.5">
          <button className="t-btn" style={{ width: 62, height: 62 }} {...hold((on) => engine.setTouchSlide(on))} aria-label="Slide">
            <span className="font-display text-sm">SLIDE</span>
          </button>
          <button className="t-btn" style={{ width: 62, height: 62 }} {...tap(() => engine.touchDash())} aria-label="Dash">
            <span className="font-display text-sm">DASH</span>
          </button>
          <button
            className="t-btn"
            style={{ width: 76, height: 76, borderColor: "rgba(255,36,56,0.7)", boxShadow: "0 0 16px rgba(255,36,56,0.35)" }}
            {...hold((on) => engine.setTouchWeb(on))}
            aria-label="Web"
          >
            <span className="font-display text-base text-spidey">WEB</span>
          </button>
        </div>
        <div className="flex items-end gap-2.5">
          <button className="t-btn" style={{ width: 62, height: 62 }} {...tap(() => engine.touchPunch())} aria-label="Punch">
            <span className="font-display text-sm">HIT</span>
          </button>
          <button className="t-btn" style={{ width: 62, height: 62 }} {...hold((on) => engine.setTouchGlide(on))} aria-label="Glide">
            <span className="font-display text-sm">GLIDE</span>
          </button>
          <button
            className="t-btn"
            style={{ width: 76, height: 76, borderColor: "rgba(82,255,168,0.7)", boxShadow: "0 0 16px rgba(82,255,168,0.3)" }}
            {...tap(() => engine.touchJump())}
            aria-label="Jump"
          >
            <span className="font-display text-base text-mint">JUMP</span>
          </button>
        </div>
      </div>

      {/* pause */}
      <button
        className="t-btn absolute pointer-events-auto left-1/2 top-3 -translate-x-1/2"
        style={{ width: 44, height: 44 }}
        {...tap(() => engine.pause())}
        aria-label="Pause"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-web" fill="currentColor">
          <rect x="6" y="4" width="4.5" height="16" />
          <rect x="13.5" y="4" width="4.5" height="16" />
        </svg>
      </button>
    </div>
  );
}
