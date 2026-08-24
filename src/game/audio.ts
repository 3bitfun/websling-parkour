/* Procedural WebAudio SFX — no assets, everything synthesized. */

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  muted = false;

  /** Must be called from a user gesture. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = "sine",
    vol = 0.3,
    slideTo?: number,
    delay = 0
  ) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, filterFreq: number, vol = 0.3, q = 1, slideTo?: number, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(filterFreq, t0);
    if (slideTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  thwip() {
    this.noise(0.14, 2600, 0.5, 2.5, 5200);
    this.tone(1500, 0.09, "triangle", 0.12, 2600);
  }

  snap() {
    // web release
    this.noise(0.1, 1400, 0.3, 2, 300);
    this.tone(620, 0.12, "triangle", 0.14, 240);
  }

  bigSwing() {
    this.noise(0.4, 500, 0.25, 1, 2400);
  }

  collect(combo: number) {
    const base = 620 * Math.pow(1.06, Math.min(combo, 8));
    this.tone(base, 0.1, "square", 0.16);
    this.tone(base * 1.25, 0.1, "square", 0.16, undefined, 0.06);
    this.tone(base * 1.5, 0.16, "square", 0.18, undefined, 0.12);
    this.tone(base * 2, 0.22, "sine", 0.2, undefined, 0.18);
  }

  thud(hard: boolean) {
    this.tone(hard ? 110 : 150, 0.16, "sine", hard ? 0.5 : 0.28, 45);
    this.noise(0.12, 300, hard ? 0.4 : 0.2, 1);
  }

  jump() {
    this.tone(240, 0.16, "triangle", 0.18, 620);
  }

  /* ---------- combat ---------- */
  punchWhiff() {
    this.noise(0.09, 1800, 0.16, 2, 3200);
  }
  punchHit(heavy: boolean) {
    this.tone(heavy ? 130 : 190, heavy ? 0.16 : 0.11, "sine", heavy ? 0.5 : 0.34, 55);
    this.noise(0.08, heavy ? 700 : 1100, heavy ? 0.4 : 0.26, 1);
    this.tone(heavy ? 2400 : 2800, 0.05, "square", 0.1);
  }
  grunt() {
    this.tone(150, 0.18, "sawtooth", 0.14, 90);
  }
  lunge() {
    this.noise(0.16, 900, 0.22, 1.5, 2600);
    this.tone(220, 0.14, "sawtooth", 0.12, 420);
  }
  thugDie() {
    this.tone(320, 0.3, "square", 0.16, 70);
    this.noise(0.25, 1600, 0.22, 1, 300);
    this.tone(640, 0.1, "square", 0.12, 160, 0.05);
  }
  hurt() {
    this.tone(220, 0.22, "sawtooth", 0.22, 80);
    this.noise(0.14, 500, 0.2, 1);
  }
  rockThrow() {
    this.noise(0.14, 1200, 0.14, 2, 2400);
  }
  rockLand() {
    this.tone(170, 0.09, "sine", 0.2, 60);
    this.noise(0.06, 900, 0.14, 1);
  }
  heal() {
    this.tone(620, 0.1, "sine", 0.16);
    this.tone(930, 0.14, "sine", 0.16, undefined, 0.07);
  }

  unlock() {
    this.tone(523, 0.12, "triangle", 0.2);
    this.tone(659, 0.12, "triangle", 0.2, undefined, 0.09);
    this.tone(784, 0.2, "triangle", 0.22, undefined, 0.18);
    this.tone(1046, 0.3, "sine", 0.18, undefined, 0.27);
  }
  dodge() {
    this.noise(0.13, 2400, 0.2, 2.5, 5200);
  }
  counter() {
    this.tone(880, 0.08, "square", 0.14);
    this.tone(1320, 0.16, "square", 0.14, undefined, 0.06);
    this.noise(0.1, 3000, 0.16, 2, 6000);
  }
  mission() {
    this.tone(392, 0.16, "triangle", 0.2);
    this.tone(494, 0.16, "triangle", 0.2, undefined, 0.14);
    this.tone(587, 0.16, "triangle", 0.2, undefined, 0.28);
    this.tone(784, 0.4, "triangle", 0.24, undefined, 0.42);
  }

  /* ---------- pickups / style ---------- */
  coin() {
    this.tone(1320, 0.07, "square", 0.16);
    this.tone(1980, 0.12, "square", 0.14, undefined, 0.055);
  }
  sparkle() {
    [880, 1174, 1568, 2093].forEach((f, i) => this.tone(f, 0.14, "sine", 0.15, undefined, i * 0.06));
  }
  flip() {
    this.noise(0.18, 1400, 0.2, 2, 3400);
    this.tone(340, 0.16, "sine", 0.14, 900);
  }
  slowmo() {
    this.tone(900, 0.7, "sine", 0.2, 110);
    this.tone(1400, 0.5, "triangle", 0.1, 220, 0.05);
  }
  swingHit() {
    this.tone(150, 0.2, "sine", 0.5, 50);
    this.noise(0.16, 1300, 0.4, 1, 2600);
    this.tone(2200, 0.06, "square", 0.12, undefined, 0.02);
  }
  tung() {
    // tung tung tung... sahur!
    [0, 0.24, 0.48, 0.86].forEach((t, i) => {
      this.tone(i === 3 ? 196 : 147, 0.2, "sine", 0.5, 55, t);
      this.noise(0.1, 420, 0.3, 0.5, undefined, t);
    });
  }

  /* ---------- web throw + wall climb ---------- */
  webShot() {
    this.noise(0.1, 2400, 0.2, 2, 4200);
    this.tone(900, 0.08, "square", 0.1, 1800);
  }
  webImpact() {
    this.noise(0.12, 1400, 0.26, 1.4, 2600);
    this.tone(520, 0.1, "sine", 0.2, 200);
    this.tone(1400, 0.06, "square", 0.1, 500, 0.03);
  }
  webGrab() {
    this.noise(0.1, 1100, 0.2, 1.6, 2000);
    this.tone(300, 0.12, "sine", 0.18, 500);
  }

  slide() {
    this.noise(0.34, 1600, 0.24, 1.4, 420);
    this.tone(300, 0.2, "triangle", 0.1, 130);
  }

  dash() {
    this.noise(0.22, 900, 0.32, 1.6, 5200);
    this.tone(420, 0.14, "sawtooth", 0.12, 1250);
  }

  glide() {
    // parachute "fwump" — lowpass noise swell + soft pop
    this.noise(0.4, 500, 0.3, 1, 2600);
    this.tone(140, 0.18, "sine", 0.22, 60, 0.05);
  }

  ui() {
    this.tone(760, 0.07, "square", 0.12);
    this.tone(1140, 0.09, "square", 0.1, undefined, 0.05);
  }

  countTick() {
    this.tone(980, 0.07, "square", 0.16);
  }

  win() {
    const seq = [523, 659, 784, 1046, 1318];
    seq.forEach((f, i) => this.tone(f, 0.22, "square", 0.18, undefined, i * 0.11));
    seq.forEach((f, i) => this.tone(f / 2, 0.24, "triangle", 0.14, undefined, i * 0.11));
    this.noise(0.7, 900, 0.12, 1, 4000, 0.5);
  }

  lose() {
    const seq = [392, 330, 262, 196];
    seq.forEach((f, i) => this.tone(f, 0.3, "sawtooth", 0.14, f * 0.94, i * 0.16));
  }

  startWind() {
    if (!this.ctx || !this.master || this.windGain) return;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = "lowpass";
    this.windFilter.frequency.value = 300;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();
  }

  setWind(speed: number) {
    if (!this.ctx || !this.windGain || !this.windFilter) return;
    const t = this.ctx.currentTime;
    const amt = Math.min(1, Math.max(0, (speed - 8) / 55));
    this.windGain.gain.setTargetAtTime(amt * 0.5, t, 0.08);
    this.windFilter.frequency.setTargetAtTime(260 + amt * 2400, t, 0.1);
  }
}
