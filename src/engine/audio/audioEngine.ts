import type { AudioMode } from '@/types/studio';

export interface AudioBands {
  bass: number;
  mid: number;
  high: number;
  energy: number;
  beat: boolean;
}

export class StudioAudioEngine {
  private mode: AudioMode = 'off';
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private stream: MediaStream | null = null;
  private synthTimer: number | null = null;
  private masterGain: GainNode | null = null;
  private stepIdx = 0;

  private smoothBass = 0;
  private smoothMid = 0;
  private smoothHigh = 0;
  private lastBeatTime = 0;

  public async setMode(next: AudioMode): Promise<string | null> {
    if (next === this.mode) return null;
    this.stop();
    this.mode = next;
    if (next === 'off') return null;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      this.mode = 'off';
      return 'Web Audio API is unavailable in this browser.';
    }

    try {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.76;

      this.ctx = ctx;
      this.analyser = analyser;
      this.freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));

      if (next === 'mic') {
        if (!navigator.mediaDevices?.getUserMedia) {
          this.stop();
          return 'Microphone API unavailable in this browser context.';
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.stream = stream;
        const src = ctx.createMediaStreamSource(stream);
        src.connect(analyser);
      } else if (next === 'synth') {
        const master = ctx.createGain();
        master.gain.value = 0.16;
        master.connect(analyser);
        analyser.connect(ctx.destination);
        this.masterGain = master;
        this.startSynthSequencer();
      }
      return null;
    } catch {
      this.stop();
      return next === 'mic'
        ? 'Microphone permission denied or no audio input found.'
        : 'Could not start audio synthesizer.';
    }
  }

  private startSynthSequencer(): void {
    const notes = [55, 65.41, 73.42, 82.41, 110, 98, 82.41, 73.42];
    const arp = [220, 261.63, 329.63, 392, 440, 392, 329.63, 293.66];
    const tick = () => {
      const ctx = this.ctx;
      const master = this.masterGain;
      if (!ctx || !master || this.mode !== 'synth') return;

      const now = ctx.currentTime;
      const step = this.stepIdx++;

      // Four-on-the-floor kick pulse on every 4th 16th-note
      if (step % 4 === 0) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(135, now);
        osc.frequency.exponentialRampToValueAtTime(38, now + 0.14);
        g.gain.setValueAtTime(1.1, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(g);
        g.connect(master);
        osc.start(now);
        osc.stop(now + 0.23);
      }

      // Sub-bass drone pulse on offbeats
      if (step % 2 === 0) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(notes[(step >> 1) % notes.length], now);
        g.gain.setValueAtTime(0.42, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(g);
        g.connect(master);
        osc.start(now);
        osc.stop(now + 0.19);
      }

      // High crystalline arpeggio shimmer
      const hiOsc = ctx.createOscillator();
      const hiGain = ctx.createGain();
      hiOsc.type = 'sine';
      hiOsc.frequency.setValueAtTime(arp[step % arp.length] * (step % 8 === 7 ? 2 : 1), now);
      hiGain.gain.setValueAtTime(0.22, now);
      hiGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      hiOsc.connect(hiGain);
      hiGain.connect(master);
      hiOsc.start(now);
      hiOsc.stop(now + 0.12);
    };

    tick();
    this.synthTimer = window.setInterval(tick, 130);
  }

  public sample(gain = 1.0): AudioBands {
    if (this.mode === 'off' || !this.analyser || !this.freqData) {
      this.smoothBass *= 0.85;
      this.smoothMid *= 0.85;
      this.smoothHigh *= 0.85;
      return { bass: 0, mid: 0, high: 0, energy: 0, beat: false };
    }

    this.analyser.getByteFrequencyData(this.freqData);
    const bins = this.freqData;
    let bSum = 0;
    let mSum = 0;
    let hSum = 0;
    for (let i = 0; i < 10; i++) bSum += bins[i];
    for (let i = 10; i < 40; i++) mSum += bins[i];
    for (let i = 40; i < 96; i++) hSum += bins[i];

    const rawBass = Math.min(1.5, (bSum / (10 * 255)) * gain * 1.45);
    const rawMid = Math.min(1.5, (mSum / (30 * 255)) * gain * 1.6);
    const rawHigh = Math.min(1.5, (hSum / (56 * 255)) * gain * 1.85);

    this.smoothBass = this.smoothBass * 0.62 + rawBass * 0.38;
    this.smoothMid = this.smoothMid * 0.68 + rawMid * 0.32;
    this.smoothHigh = this.smoothHigh * 0.7 + rawHigh * 0.3;

    const energy = Math.min(1.4, this.smoothBass * 0.5 + this.smoothMid * 0.32 + this.smoothHigh * 0.18);
    const now = performance.now();
    const beat = rawBass > 0.68 && rawBass > this.smoothBass * 1.18 && now - this.lastBeatTime > 260;
    if (beat) this.lastBeatTime = now;

    return {
      bass: this.smoothBass,
      mid: this.smoothMid,
      high: this.smoothHigh,
      energy,
      beat,
    };
  }

  public stop(): void {
    if (this.synthTimer !== null) {
      window.clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.analyser = null;
    this.freqData = null;
    this.masterGain = null;
    this.mode = 'off';
  }
}
