import { CONFIG } from './game';
import { voiceRandom, type VoicePlan } from './voice';

type Sound = 'card' | 'click' | 'shot' | 'tension';
type SpeakingVoice = {
  plan: VoicePlan; start: number; end: number; gain: GainNode;
  nodes: AudioNode[]; sources: AudioScheduledSourceNode[]; stopped: boolean;
};

export class TableAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private tension: OscillatorNode | null = null;
  private tensionDuck: GainNode | null = null;
  private voice: SpeakingVoice | null = null;
  private voiceRequest = 0;
  private unlock: Promise<void> | null = null;
  init() {
    // Only the Sit Down / Play Again click calls init. Constructing this object is silent.
    if (typeof AudioContext === 'undefined') return;
    try { this.context ??= new AudioContext(); } catch { return; }
    if (!this.master) { this.master = this.context.createGain(); this.master.connect(this.context.destination); }
    if (!this.tensionDuck) {
      this.tensionDuck = this.context.createGain(); this.tensionDuck.connect(this.master);
    }
    this.master.gain.value = this.muted ? 0 : .6;
    this.unlock = this.context.resume().catch(() => { /* An unavailable audio device leaves the table playable. */ });
  }
  mute(value: boolean) {
    this.muted = value;
    if (this.context && this.master) this.master.gain.setValueAtTime(value ? 0 : .6, this.context.currentTime);
    if (this.context && this.voice) {
      const now = this.context.currentTime;
      this.duckTension(value || this.voice.end <= now ? 1 : .76, now);
      if (!value && this.voice.end > now) {
        this.tensionDuck!.gain.setValueAtTime(.76, this.voice.end);
        this.tensionDuck!.gain.linearRampToValueAtTime(1, this.voice.end + .18);
      }
    }
  }
  startVoice(plan: VoicePlan) {
    this.stopVoice();
    if (!this.context || !this.master || this.muted || !CONFIG.VOICE_ENABLED || plan.parameters.volume <= 0 || !plan.steps.some(step => step.syllable)) return;
    const request = this.voiceRequest;
    if (this.context.state !== 'running') {
      // The first click may still be completing resume(); never resume from a dialogue effect.
      void this.unlock?.then(() => {
        if (this.voiceRequest === request && this.context?.state === 'running' && !this.muted && CONFIG.VOICE_ENABLED) this.scheduleVoice(plan);
      });
      return;
    }
    this.scheduleVoice(plan);
  }
  private scheduleVoice(plan: VoicePlan) {
    const ctx = this.context!, now = ctx.currentTime;
    const line = ctx.createGain(), drive = ctx.createGain(), distortion = ctx.createWaveShaper();
    const mask = ctx.createBiquadFilter(), room = ctx.createConvolver(), wet = ctx.createGain();
    const echo = ctx.createDelay(.3), echoGain = ctx.createGain();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i * 2 / (curve.length - 1) - 1) * 1.6) / Math.tanh(1.6);
    distortion.curve = curve; distortion.oversample = '2x'; drive.gain.value = 1.8;
    mask.type = 'lowpass'; mask.frequency.value = 1400; mask.Q.value = .65;
    line.gain.value = plan.parameters.volume; wet.gain.value = .17;
    echo.delayTime.value = .085; echoGain.gain.value = .11;
    drive.connect(distortion); distortion.connect(mask); mask.connect(line);
    mask.connect(room); room.connect(wet); wet.connect(line);
    mask.connect(echo); echo.connect(echoGain); echoGain.connect(line); line.connect(this.master!);
    const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * .27), ctx.sampleRate);
    const roomRandom = voiceRandom(plan.seed ^ 0x811c9dc5);
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) {
        const seconds = i / ctx.sampleRate;
        samples[i] = seconds < .012 ? 0 : (roomRandom() * 2 - 1) * Math.exp(-seconds * 24) * .6;
      }
    }
    room.buffer = impulse;
    const voice: SpeakingVoice = {
      plan, start: now, end: now, gain: line, stopped: false,
      nodes: [line, drive, distortion, mask, room, wet, echo, echoGain], sources: [],
    };
    this.voice = voice;
    for (const step of plan.steps) {
      const syllable = step.syllable;
      if (!syllable) continue;
      const start = now + step.at / 1000, duration = syllable.duration / 1000;
      const oscillator = ctx.createOscillator(), pulse = ctx.createOscillator();
      const pulseGain = ctx.createGain(), envelope = ctx.createGain();
      const first = ctx.createBiquadFilter(), second = ctx.createBiquadFilter(), secondGain = ctx.createGain();
      oscillator.type = 'sawtooth'; pulse.type = 'square'; pulseGain.gain.value = .12;
      for (const source of [oscillator, pulse]) {
        source.frequency.setValueAtTime(syllable.pitch, start);
        source.frequency.linearRampToValueAtTime(syllable.endPitch, start + duration);
      }
      pulse.detune.value = -4;
      first.type = second.type = 'bandpass';
      first.frequency.value = syllable.formants[0]; first.Q.value = 3.2;
      second.frequency.value = syllable.formants[1]; second.Q.value = 4.3; secondGain.gain.value = .58;
      oscillator.connect(envelope); pulse.connect(pulseGain); pulseGain.connect(envelope);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(.65, start + .018);
      envelope.gain.setValueAtTime(.55, start + duration * .52);
      envelope.gain.linearRampToValueAtTime(0, start + duration);
      envelope.connect(first); envelope.connect(second); first.connect(drive); second.connect(secondGain); secondGain.connect(drive);
      const breath = ctx.createBufferSource(), breathGain = ctx.createGain(), breathFilter = ctx.createBiquadFilter();
      const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate), samples = noise.getChannelData(0);
      const random = voiceRandom(syllable.seed);
      for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;
      breath.buffer = noise; breathGain.gain.value = syllable.breath;
      breathFilter.type = 'bandpass'; breathFilter.frequency.value = 1150; breathFilter.Q.value = .7;
      breath.connect(breathFilter); breathFilter.connect(breathGain); breathGain.connect(envelope);
      voice.nodes.push(oscillator, pulse, pulseGain, envelope, first, second, secondGain, breath, breathGain, breathFilter);
      voice.sources.push(oscillator, pulse, breath);
      for (const source of [oscillator, pulse, breath]) { source.start(start); source.stop(start + duration); }
      voice.end = Math.max(voice.end, start + duration);
    }
    this.duckTension(.76, now);
    this.tensionDuck!.gain.setValueAtTime(.76, voice.end);
    this.tensionDuck!.gain.linearRampToValueAtTime(1, voice.end + .18);
    // A silent scheduled source owns cleanup, including the short room tail; no JS timer can drift.
    const finish = ctx.createBufferSource(); finish.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    voice.sources.push(finish); voice.nodes.push(finish); finish.connect(line);
    finish.onended = () => {
      voice.nodes.forEach(node => node.disconnect());
      if (this.voice === voice) this.voice = null;
    };
    finish.start(voice.end + .28);
  }
  private duckTension(value: number, now: number) {
    const gain = this.tensionDuck?.gain;
    if (!gain) return;
    gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(value, now + .06);
  }
  stopVoice() {
    this.voiceRequest++;
    const voice = this.voice, ctx = this.context;
    if (!voice || !ctx) return;
    this.voice = null;
    const now = ctx.currentTime;
    voice.stopped = true;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + .06);
    for (const source of voice.sources) source.stop(now + .08);
    this.duckTension(1, now);
  }
  getVoiceLevel() {
    const voice = this.voice, ctx = this.context;
    if (!voice || !ctx || ctx.state !== 'running' || this.muted || !CONFIG.VOICE_ENABLED || voice.plan.parameters.volume <= 0) return 0;
    const elapsed = (ctx.currentTime - voice.start) * 1000;
    let level = 0;
    for (const step of voice.plan.steps) {
      if (!step.syllable) continue;
      const progress = (elapsed - step.at) / step.syllable.duration;
      if (progress >= 0 && progress <= 1) level = Math.max(level, Math.sin(progress * Math.PI));
    }
    return level;
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
      oscillator.connect(gain); gain.connect(this.tensionDuck!);
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
