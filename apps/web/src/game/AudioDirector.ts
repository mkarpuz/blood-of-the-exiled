import type { CombatText } from '../game-store';

export class AudioDirector {
  private context: AudioContext | null = null;
  private ambientGain: GainNode | null = null;
  private lastCombatId = '';

  async unlock(): Promise<void> {
    if (!this.context) this.createAmbient();
    if (this.context?.state === 'suspended') await this.context.resume();
  }

  updateCombat(texts: CombatText[]): void {
    const latest = texts.at(-1);
    if (!latest || latest.id === this.lastCombatId) return;
    this.lastCombatId = latest.id;
    if (latest.event === 'hit') this.tone(105, 0.06, 0.045, 'sawtooth');
    if (latest.event === 'blocked') this.tone(260, 0.04, 0.025, 'square');
    if (latest.event === 'heal') this.tone(540, 0.22, 0.025, 'sine');
    if (latest.event === 'death') this.tone(54, 0.8, 0.08, 'sawtooth');
    if (latest.event === 'level-up') {
      this.tone(330, 0.2, 0.035, 'sine');
      window.setTimeout(() => this.tone(495, 0.28, 0.03, 'sine'), 150);
    }
  }

  dispose(): void {
    this.ambientGain?.disconnect();
    void this.context?.close();
    this.context = null;
  }

  private createAmbient(): void {
    const context = new AudioContext();
    this.context = context;
    const length = context.sampleRate * 4;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (0.35 + Math.sin(index * 0.00004) * 0.15);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    const gain = context.createGain();
    gain.gain.value = 0.055;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
    this.ambientGain = gain;
  }

  private tone(frequency: number, duration: number, volume: number, type: OscillatorType): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * 0.65), context.currentTime + duration);
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }
}
