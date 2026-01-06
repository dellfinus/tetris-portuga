
class SoundService {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMuted(val: boolean) {
    this.muted = val;
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number = 0.1) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playMove() {
    this.playTone(150, 'sine', 0.1, 0.05);
  }

  playLand() {
    this.playTone(100, 'square', 0.15, 0.03);
  }

  playSuccess() {
    const now = Date.now();
    this.playTone(440, 'triangle', 0.3, 0.1);
    setTimeout(() => this.playTone(659.25, 'triangle', 0.3, 0.1), 100);
    setTimeout(() => this.playTone(880, 'triangle', 0.5, 0.1), 200);
  }

  playError() {
    this.playTone(110, 'sawtooth', 0.4, 0.05);
    setTimeout(() => this.playTone(90, 'sawtooth', 0.4, 0.05), 100);
  }

  playLevelUp() {
    const freqs = [523.25, 659.25, 783.99, 1046.50];
    freqs.forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'sine', 0.4, 0.1), i * 150);
    });
  }

  playGameOver() {
    this.playTone(200, 'sawtooth', 0.5, 0.1);
    setTimeout(() => this.playTone(150, 'sawtooth', 0.5, 0.1), 200);
    setTimeout(() => this.playTone(100, 'sawtooth', 0.8, 0.1), 400);
  }

  playClick() {
    this.playTone(800, 'sine', 0.05, 0.05);
  }
}

export const soundService = new SoundService();
