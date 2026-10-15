import { EQ_FREQS } from "./lib/presets";
import type { EqState } from "./types";

/**
 * Web Audio chain attached to the single <video> element:
 * source -> preamp -> 10x peaking EQ -> compressor (norm) -> boost gain -> analyser -> destination
 */
class AudioGraph {
  ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private preamp: GainNode | null = null;
  private bands: BiquadFilterNode[] = [];
  private compressor: DynamicsCompressorNode | null = null;
  private delay: DelayNode | null = null;
  private boost: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private normalization = false;
  private delayMs = 0;
  private boostFactor = 1;
  private lastEq: EqState | null = null;

  attach(el: HTMLMediaElement) {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.source = this.ctx.createMediaElementSource(el);
      this.preamp = this.ctx.createGain();
      this.bands = EQ_FREQS.map((f) => {
        const b = this.ctx!.createBiquadFilter();
        b.type = "peaking";
        b.frequency.value = f;
        b.Q.value = 1.0;
        b.gain.value = 0;
        return b;
      });
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 24;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.25;
      this.boost = this.ctx.createGain();
      this.delay = this.ctx.createDelay(5);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.82;
      this.rebuild();
      // re-apply settings that were pushed before the graph existed
      this.boost.gain.value = this.boostFactor;
      this.delay.delayTime.value = Math.max(0, this.delayMs / 1000);
      if (this.lastEq) this.applyEq(this.lastEq);
    } catch {
      this.ctx = null;
    }
  }

  private rebuild() {
    if (!this.ctx || !this.source) return;
    try {
      this.source.disconnect();
      this.preamp?.disconnect();
      this.bands.forEach((b) => b.disconnect());
      this.compressor?.disconnect();
      this.delay?.disconnect();
      this.boost?.disconnect();
      this.analyser?.disconnect();
    } catch { /* noop */ }
    let node: AudioNode = this.source;
    node.connect(this.preamp!);
    node = this.preamp!;
    for (const b of this.bands) {
      node.connect(b);
      node = b;
    }
    if (this.normalization) {
      node.connect(this.compressor!);
      node = this.compressor!;
    }
    node.connect(this.delay!);
    node = this.delay!;
    node.connect(this.boost!);
    node = this.boost!;
    node.connect(this.analyser!);
    node = this.analyser!;
    node.connect(this.ctx.destination);
  }

  resume() {
    this.ctx?.resume().catch(() => {});
  }

  /** boost factor: >1 amplifies beyond 100% (VLC-style, up to 300%). */
  setBoost(factor: number) {
    this.boostFactor = Math.max(0, factor);
    if (this.boost) this.boost.gain.value = this.boostFactor;
  }

  /** Audio/video sync offset in milliseconds (negative = audio earlier). */
  setAudioDelay(ms: number) {
    this.delayMs = Math.max(-5000, Math.min(5000, ms));
    // Negative delay can't be produced by a DelayNode; clamp at 0 and let
    // the UI show the value (positive = audio pushed later).
    if (this.delay) this.delay.delayTime.value = Math.max(0, this.delayMs / 1000);
  }

  setNormalization(on: boolean) {
    if (this.normalization !== on) {
      this.normalization = on;
      this.rebuild();
    }
  }

  applyEq(eq: EqState) {
    this.lastEq = eq;
    if (!this.ctx) return;
    const g = eq.enabled ? eq.preamp : 0;
    this.preamp!.gain.value = Math.pow(10, g / 20);
    this.bands.forEach((b, i) => {
      b.gain.value = eq.enabled ? eq.bands[i] ?? 0 : 0;
    });
  }
}

export const audioGraph = new AudioGraph();
