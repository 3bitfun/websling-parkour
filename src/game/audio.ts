/** Tiny WebAudio synth — every sound is generated, no assets. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  muted = false;

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.startWind();
    } catch {
      /* audio unavailable */
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.2, slideTo?: number, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, filterFreq: number, vol = 0.3, q = 1, slideTo?: number, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
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
    src.stop(t0 + dur + 0.02);
  }

  private startWind() {
    if (!this.ctx || !this.master) return;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 240;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(f).connect(this.windGain).connect(this.master);
    src.start();
  }

  setWind(speed01: number) {
    if (this.windGain && this.ctx) {
      this.windGain.gain.setTargetAtTime(Math.min(0.16, speed01 * 0.16), this.ctx.currentTime, 0.12);
    }
  }

  thwip() { this.noise(0.09, 3400, 0.35, 2, 900); this.tone(1500, 0.05, "square", 0.08, 300); }
  release() { this.noise(0.07, 2200, 0.2, 2, 3600); }
  jump() { this.tone(240, 0.16, "triangle", 0.18, 620); }
  dash() { this.noise(0.16, 2600, 0.22, 1.2, 700); this.tone(340, 0.1, "sawtooth", 0.1, 900); }
  slide() { this.noise(0.28, 900, 0.2, 1.4, 300); }
  glide() { this.noise(0.3, 600, 0.16, 1, 1400); }
  thud(hard: boolean) {
    this.tone(hard ? 90 : 130, hard ? 0.2 : 0.12, "sine", hard ? 0.4 : 0.25, 40);
    this.noise(0.08, hard ? 500 : 800, hard ? 0.3 : 0.18, 1);
  }
  collect(pitch = 0) {
    const base = 660 * Math.pow(1.06, Math.min(10, pitch));
    this.tone(base, 0.09, "sine", 0.2);
    this.tone(base * 1.5, 0.12, "sine", 0.16, undefined, 0.05);
  }
  cash() { this.tone(1180, 0.06, "square", 0.1); this.tone(1560, 0.1, "square", 0.1, undefined, 0.05); this.tone(2100, 0.14, "square", 0.08, undefined, 0.1); }
  punchWhiff() { this.noise(0.09, 1800, 0.16, 2, 3200); }
  punchHit(heavy: boolean) {
    this.tone(heavy ? 130 : 190, heavy ? 0.16 : 0.11, "sine", heavy ? 0.5 : 0.34, 55);
    this.noise(0.08, heavy ? 700 : 1100, heavy ? 0.4 : 0.26, 1);
    this.tone(heavy ? 2400 : 2800, 0.05, "square", 0.1);
  }
  grunt() { this.tone(150, 0.18, "sawtooth", 0.14, 90); }
  lunge() { this.noise(0.16, 900, 0.22, 1.5, 2600); this.tone(220, 0.14, "sawtooth", 0.12, 420); }
  thugDie() { this.tone(320, 0.3, "square", 0.16, 70); this.noise(0.25, 1600, 0.22, 1, 300); this.tone(640, 0.1, "square", 0.12, 160, 0.05); }
  hurt() { this.tone(220, 0.22, "sawtooth", 0.22, 80); this.noise(0.14, 500, 0.2, 1); }
  rockThrow() { this.noise(0.14, 1200, 0.14, 2, 2400); }
  rockLand() { this.tone(170, 0.09, "sine", 0.2, 60); this.noise(0.06, 900, 0.14, 1); }
  heal() { this.tone(620, 0.1, "sine", 0.16); this.tone(930, 0.14, "sine", 0.16, undefined, 0.07); }
  webShot() { this.noise(0.08, 3800, 0.24, 2, 1200); }
  webImpact() { this.noise(0.12, 1500, 0.26, 1.4, 400); this.tone(500, 0.08, "sine", 0.14, 180); }
  webGrab() { this.noise(0.1, 2000, 0.18, 1.6, 700); }
  sparkle() { this.tone(1320, 0.1, "sine", 0.14); this.tone(1760, 0.12, "sine", 0.12, undefined, 0.06); this.tone(2200, 0.16, "sine", 0.1, undefined, 0.12); }
  slowmo() { this.tone(880, 0.6, "sine", 0.16, 220); this.tone(440, 0.6, "triangle", 0.12, 110); }
  flip() { this.noise(0.1, 2400, 0.14, 1.6, 4200); }
  ui() { this.tone(520, 0.07, "square", 0.1); this.tone(780, 0.09, "square", 0.08, undefined, 0.05); }
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, "square", 0.14, undefined, i * 0.12)); }
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.26, "sawtooth", 0.12, undefined, i * 0.14)); }
  tung() { [196, 196, 233, 196, 294].forEach((f, i) => this.tone(f, 0.2, "triangle", 0.2, undefined, i * 0.16)); }

  powerEat() { this.tone(300, 0.12, "sine", 0.2, 700); this.tone(520, 0.16, "sine", 0.16, 1100, 0.06); this.noise(0.1, 2400, 0.12, 2, 900, 0.02); }
  powerCast() { this.tone(700, 0.1, "sawtooth", 0.12, 220); this.noise(0.09, 1800, 0.14, 1.4, 500); }
  powerDash() { this.noise(0.14, 2600, 0.16, 1.2, 700); this.tone(340, 0.1, "sawtooth", 0.1, 900); }
  powerBeam() { this.tone(900, 0.18, "sawtooth", 0.1, 300); this.tone(1400, 0.1, "square", 0.06, 500, 0.02); }
  powerBlast() { this.tone(120, 0.3, "sine", 0.4, 40); this.noise(0.3, 500, 0.35, 1, 120); }
  fizzle() { this.tone(240, 0.08, "square", 0.08, 120); }
  buy() { this.cash(); this.tone(880, 0.1, "sine", 0.12, 1320, 0.08); }
  denied() { this.tone(200, 0.12, "square", 0.12, 140); }
}
