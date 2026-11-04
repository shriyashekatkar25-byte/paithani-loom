/**
 * Loom sounds, synthesised (no samples): the beater's wooden thud, the
 * shuttle's brush through the shed, and a small tick for UI choices.
 * Off by default; created lazily on the first user gesture.
 */
export class LoomSound {
  private ac: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  enabled = false;

  private ctx(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ac = new AC();
      const len = this.ac.sampleRate * 0.5;
      this.noise = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noise.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6; } // brown-ish noise
    }
    if (this.ac.state === 'suspended') void this.ac.resume();
    return this.ac;
  }

  /** Beater: a pitched-down sine knock plus filtered noise. */
  beat(strength = 1) {
    const ac = this.ctx();
    if (!ac || !this.noise) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * strength, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.18);
    const n = ac.createBufferSource();
    n.buffer = this.noise;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.08 * strength, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(f).connect(ng).connect(ac.destination);
    n.start(t);
    n.stop(t + 0.08);
  }

  /** Shuttle: band-passed noise sweeping across. */
  shuttle() {
    const ac = this.ctx();
    if (!ac || !this.noise) return;
    const t = ac.currentTime;
    const n = ac.createBufferSource();
    n.buffer = this.noise;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2.5;
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(3800, t + 0.22);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.08);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.24);
    n.connect(f).connect(g).connect(ac.destination);
    n.start(t);
    n.stop(t + 0.26);
  }

  tick() {
    const ac = this.ctx();
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'triangle';
    o.frequency.value = 1244.5; // D#6: a small brass bell, not a beep
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.13);
  }
}
