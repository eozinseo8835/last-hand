type Sound = 'card' | 'click' | 'shot' | 'tension';
class TableAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private tension: OscillatorNode | null = null;
  init() {
    this.context ??= new AudioContext();
    if (!this.master) { this.master = this.context.createGain(); this.master.connect(this.context.destination); }
    this.master.gain.value = this.muted ? 0 : .6;
    void this.context.resume();
  }
  mute(value: boolean) {
    this.muted = value;
    if (this.context && this.master) this.master.gain.setValueAtTime(value ? 0 : .6, this.context.currentTime);
  }
  play(sound: Sound) {
    if (!this.context || !this.master) return;
    const ctx = this.context, now = ctx.currentTime;
    // End the suspense tone at the trigger pull so the click is followed by silence.
    if (this.tension) { this.tension.stop(); this.tension = null; }
    if (sound === 'tension') {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.frequency.setValueAtTime(48, now); oscillator.frequency.linearRampToValueAtTime(58, now + 2.5);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.13, now + .5); gain.gain.exponentialRampToValueAtTime(.001, now + 2.5);
      oscillator.connect(gain); gain.connect(this.master);
      this.tension = oscillator;
      oscillator.onended = () => { if (this.tension === oscillator) this.tension = null; };
      oscillator.start(); oscillator.stop(now + 2.5); return;
    }
    const duration = sound === 'shot' ? .6 : sound === 'click' ? .06 : .08;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate), samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, sound === 'shot' ? 4 : 2);
    const source = ctx.createBufferSource(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    source.buffer = buffer; filter.type = sound === 'shot' ? 'lowpass' : 'highpass'; filter.frequency.value = sound === 'shot' ? 4200 : sound === 'click' ? 2400 : 900;
    gain.gain.value = sound === 'shot' ? 1 : sound === 'click' ? .45 : .11;
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start();
    if (sound === 'shot') {
      const thump = ctx.createOscillator(), envelope = ctx.createGain();
      thump.frequency.setValueAtTime(120, now); thump.frequency.exponentialRampToValueAtTime(30, now + .25);
      envelope.gain.setValueAtTime(.65, now); envelope.gain.exponentialRampToValueAtTime(.001, now + .4);
      thump.connect(envelope); envelope.connect(this.master); thump.start(); thump.stop(now + .4);
    }
  }
}
export const tableAudio = new TableAudio();
