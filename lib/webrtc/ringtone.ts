// Incoming-call ringtone — synthesized with the Web Audio API (a simple
// repeating two-tone beep) rather than shipping an audio asset file, to
// avoid a new binary asset and its licensing question entirely.
//
// Browsers block audio autoplay until a user gesture has occurred on the
// page (an `AudioContext` starts 'suspended'), so this can't just start
// playing the moment an invite arrives on a page the user hasn't clicked
// into yet — see enableSound() below, which must be called from a real
// click handler once, after which `start()` calls on later invites work
// without further prompting for the rest of that page session.
export class Ringtone {
  private audioContext: AudioContext | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private enabled = false;

  isEnabled(): boolean {
    return this.enabled;
  }

  // Must be called from within a user gesture (a click handler) — the
  // very first call creates and resumes the AudioContext, which is what
  // actually satisfies the browser's autoplay policy.
  async enableSound(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    this.enabled = true;
  }

  private beep(frequency: number, durationMs: number): void {
    const ctx = this.audioContext;
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    oscillator.start();
    oscillator.stop(ctx.currentTime + durationMs / 1000);
  }

  start(): void {
    if (!this.enabled || !this.audioContext || this.intervalId) return;
    const ring = () => {
      this.beep(880, 300);
      setTimeout(() => this.beep(880, 300), 400);
    };
    ring();
    this.intervalId = setInterval(ring, 2000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  dispose(): void {
    this.stop();
    this.audioContext?.close();
    this.audioContext = null;
  }
}
