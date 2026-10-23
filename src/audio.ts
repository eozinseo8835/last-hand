import { CONFIG } from './game';
import type { Speaker } from './campaign';
import { voiceRandom, type VoicePlan } from './voice';
import { eventBangOffsets, heartbeatSettings, type RoundEvent } from './tension';

type Sound = 'card' | 'click' | 'shot' | 'tension' | 'hammer' | 'clack' | 'spin';
export type HeartbeatState = { active: boolean; chambersFired: number; pulling: boolean };
type AudioLayer = { gain: GainNode; sources: Set<AudioScheduledSourceNode>; nodes: Set<AudioNode>; closed: boolean };
type SpeakingVoice = {
  plan: VoicePlan; speaker: Speaker; start: number; end: number; gain: GainNode;
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
  private heartbeatState: HeartbeatState = { active: false, chambersFired: 0, pulling: false };
  private heartbeatLayer: AudioLayer | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatGeneration = 0;
  private heartbeatNextBeat = 0;
  private heartbeatBeats: number[] = [];
  private event: RoundEvent | null = null;
  private eventLayer: AudioLayer | null = null;
  private eventRequest = 0;
  private revolverSerial = 0;
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
    void this.unlock.then(() => {
      this.startHeartbeat();
      this.startEvent();
    });
  }
  mute(value: boolean) {
    this.muted = value;
    if (this.context && this.master) this.master.gain.setValueAtTime(value ? 0 : .6, this.context.currentTime);
    if (value) { this.stopHeartbeat(); this.stopEvent(); }
    else { this.startHeartbeat(); this.startEvent(); }
    if (this.context && this.voice) {
      const now = this.context.currentTime;
      this.duckTension(value || this.voice.end <= now ? 1 : .76, now);
      if (!value && this.voice.end > now) {
        this.tensionDuck!.gain.setValueAtTime(.76, this.voice.end);
        this.tensionDuck!.gain.linearRampToValueAtTime(1, this.voice.end + .18);
      }
    }
  }
  startVoice(plan: VoicePlan, speaker: Speaker = 'captive', behind = false) {
    this.stopVoice();
    if (!this.context || !this.master || this.muted || !CONFIG.VOICE_ENABLED || plan.parameters.volume <= 0 || !plan.steps.some(step => step.syllable)) return;
    const request = this.voiceRequest;
    if (this.context.state !== 'running') {
      // The first click may still be completing resume(); never resume from a dialogue effect.
      void this.unlock?.then(() => {
        if (this.voiceRequest === request && this.context?.state === 'running' && !this.muted && CONFIG.VOICE_ENABLED) this.scheduleVoice(plan, speaker, behind);
      });
      return;
    }
    this.scheduleVoice(plan, speaker, behind);
  }
  private scheduleVoice(plan: VoicePlan, speaker: Speaker, behind = false) {
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
    mask.connect(echo); echo.connect(echoGain); echoGain.connect(line);
    const position = this.positionVoice(line, speaker, behind);
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
      plan, speaker, start: now, end: now, gain: line, stopped: false,
      nodes: [line, drive, distortion, mask, room, wet, echo, echoGain, ...(position ? [position] : [])], sources: [],
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
  private positionVoice(line: GainNode, speaker: Speaker, behind = false): AudioNode | null {
    const ctx = this.context!, pan = behind ? 0 : speaker === 'host' ? -.7 : 0;
    try {
      if (behind && typeof ctx.createPanner === 'function') {
        const position = ctx.createPanner(); position.panningModel = 'HRTF';
        // The listener faces -Z by default, so +Z places the final line behind it.
        if (position.positionX) {
          position.positionX.value = 0; position.positionY.value = 0; position.positionZ.value = 1;
        } else position.setPosition(0, 0, 1);
        line.connect(position); position.connect(this.master!); return position;
      }
      if (typeof ctx.createStereoPanner === 'function') {
        const position = ctx.createStereoPanner(); position.pan.value = pan;
        line.connect(position); position.connect(this.master!); return position;
      }
      if (typeof ctx.createPanner === 'function') {
        const position = ctx.createPanner(); position.panningModel = 'equalpower';
        if (position.positionX) {
          position.positionX.value = pan * 1.5; position.positionY.value = 0; position.positionZ.value = -1;
        } else position.setPosition(pan * 1.5, 0, -1);
        line.connect(position); position.connect(this.master!); return position;
      }
    } catch { /* Older audio devices retain the murmur even without stereo positioning. */ }
    line.connect(this.master!); return null;
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
  getVoiceSpeaker(): Speaker | null {
    const ctx = this.context, voice = this.voice;
    return ctx?.state === 'running' && !this.muted && CONFIG.VOICE_ENABLED && voice && voice.plan.parameters.volume > 0 ? voice.speaker : null;
  }
  getVoiceLevel(speaker?: Speaker) {
    const voice = this.voice, ctx = this.context;
    if (!voice || (speaker !== undefined && voice.speaker !== speaker) || !ctx || ctx.state !== 'running' || this.muted || !CONFIG.VOICE_ENABLED || voice.plan.parameters.volume <= 0) return 0;
    const elapsed = (ctx.currentTime - voice.start) * 1000;
    let level = 0;
    for (const step of voice.plan.steps) {
      if (!step.syllable) continue;
      const progress = (elapsed - step.at) / step.syllable.duration;
      if (progress >= 0 && progress <= 1) level = Math.max(level, Math.sin(progress * Math.PI));
    }
    return level;
  }
  /** Story cues share the existing click-unlocked master and never touch gameplay RNG. */
  playStory(kind: 'hood' | 'drag' | 'door' | 'feed-shot' | 'escape') {
    if (!this.context || !this.master || this.muted) return;
    const layer = this.makeLayer(this.master), now = this.context.currentTime + .005;
    const seeds = { hood: 0x400d, drag: 0xd4a6, door: 0xd004, 'feed-shot': 0xfead, escape: 0xe5ca9e };
    const random = voiceRandom(seeds[kind]);
    if (kind === 'hood') {
      this.noise(layer, now, .62, .07, 360, random, 'lowpass', true);
      this.resonance(layer, now + .05, .38, .018, 80, 45);
      this.hoodBreath(layer, now, random);
    } else if (kind === 'drag') {
      this.noise(layer, now, 1.9, .045, 480, random, 'lowpass', true);
      for (let step = 0; step < 6; step++) {
        const start = now + .12 + step * .28;
        this.noise(layer, start, .16, .09, 650, random, 'lowpass');
        this.resonance(layer, start, .16, .045, 90, 42);
      }
    } else if (kind === 'door') {
      this.noise(layer, now, .48, .19, 720, random, 'lowpass');
      this.resonance(layer, now, .62, .09, 145, 38);
      this.noise(layer, now + .1, .12, .07, 1850, random, 'bandpass');
    } else if (kind === 'feed-shot') {
      this.noise(layer, now, .34, .18, 390, random, 'lowpass');
      this.resonance(layer, now, .42, .1, 85, 27);
    } else {
      this.noise(layer, now, 1.5, .035, 900, random, 'lowpass', true);
      for (let step = 0; step < 4; step++) {
        const start = now + .16 + step * .3;
        this.noise(layer, start, .15, .06, 950, random, 'lowpass');
        this.resonance(layer, start, .13, .025, 100, 58);
      }
    }
    layer.closed = true;
  }
  /** A cloth-muffled inhale, pause, and longer exhale under the opening hood. */
  private hoodBreath(layer: AudioLayer, start: number, random: () => number) {
    const ctx = this.context!, duration = 1.18;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = random() * 2 - 1;
    const source = ctx.createBufferSource(), body = ctx.createBiquadFilter(), cloth = ctx.createBiquadFilter(), breath = ctx.createGain();
    source.buffer = buffer;
    body.type = 'highpass'; body.frequency.value = 140; body.Q.value = .65;
    cloth.type = 'lowpass'; cloth.frequency.value = 650; cloth.Q.value = .65;
    breath.gain.setValueAtTime(0, start);
    breath.gain.linearRampToValueAtTime(.085, start + .26);
    breath.gain.linearRampToValueAtTime(0, start + .44);
    breath.gain.setValueAtTime(0, start + .54);
    breath.gain.linearRampToValueAtTime(.065, start + .82);
    breath.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(body); body.connect(cloth); cloth.connect(breath); breath.connect(layer.gain);
    this.ownSource(layer, source, [body, cloth, breath]);
    source.start(start); source.stop(start + duration);
  }
  /** Callers describe the current phase; this method never unlocks browser audio. */
  setHeartbeat(state: HeartbeatState) {
    const next = { ...state, chambersFired: Math.max(0, Math.floor(state.chambersFired)) };
    if (next.active === this.heartbeatState.active && next.chambersFired === this.heartbeatState.chambersFired && next.pulling === this.heartbeatState.pulling) return;
    this.heartbeatState = next;
    this.stopHeartbeat();
    this.startHeartbeat();
  }
  private startHeartbeat() {
    const ctx = this.context;
    if (!ctx || !this.tensionDuck || !this.heartbeatState.active || this.muted || this.heartbeatLayer) return;
    if (ctx.state !== 'running') {
      const generation = this.heartbeatGeneration;
      void this.unlock?.then(() => {
        if (this.heartbeatGeneration === generation && ctx.state === 'running') this.startHeartbeat();
      });
      return;
    }
    this.heartbeatLayer = this.makeLayer(this.tensionDuck);
    this.heartbeatNextBeat = ctx.currentTime + .025;
    this.heartbeatBeats = [];
    this.pumpHeartbeat();
  }
  private pumpHeartbeat() {
    const ctx = this.context, layer = this.heartbeatLayer;
    if (!ctx || !layer || layer.closed) return;
    const now = ctx.currentTime, settings = heartbeatSettings(this.heartbeatState.chambersFired, this.heartbeatState.pulling);
    // A backgrounded tab resumes with one new beat, never a burst of missed beats.
    if (this.heartbeatNextBeat < now - .1) this.heartbeatNextBeat = now + .015;
    const period = 60 / settings.bpm;
    while (this.heartbeatNextBeat < now + .12) {
      const start = this.heartbeatNextBeat;
      this.heartbeatBeats.push(start);
      this.heartbeatThump(layer, start, settings.volume, 76, .18);
      this.heartbeatThump(layer, start + Math.min(.17, period * .24), settings.volume * .62, 62, .13);
      this.heartbeatNextBeat += period;
    }
    this.heartbeatBeats = this.heartbeatBeats.filter(start => start > now - 1);
    this.heartbeatTimer = setTimeout(() => this.pumpHeartbeat(), 25);
  }
  private heartbeatThump(layer: AudioLayer, start: number, volume: number, pitch: number, duration: number) {
    const ctx = this.context!, oscillator = ctx.createOscillator(), envelope = ctx.createGain(), filter = ctx.createBiquadFilter();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(pitch, start);
    oscillator.frequency.exponentialRampToValueAtTime(pitch * .48, start + duration);
    envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(volume, start + .006);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    filter.type = 'lowpass'; filter.frequency.value = 190; filter.Q.value = .7;
    oscillator.connect(filter); filter.connect(envelope); envelope.connect(layer.gain);
    this.ownSource(layer, oscillator, [filter, envelope]); oscillator.start(start); oscillator.stop(start + duration + .01);
  }
  private stopHeartbeat() {
    this.heartbeatGeneration++;
    if (this.heartbeatTimer !== null) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.heartbeatLayer) this.stopLayer(this.heartbeatLayer);
    this.heartbeatLayer = null; this.heartbeatBeats = [];
  }
  /** This is the same audio-clock beat envelope used by the vignette. */
  getHeartbeatLevel() {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.muted || !this.heartbeatLayer) return 0;
    const period = 60 / heartbeatSettings(this.heartbeatState.chambersFired, this.heartbeatState.pulling).bpm;
    let level = 0;
    for (const start of this.heartbeatBeats) {
      const age = ctx.currentTime - start;
      if (age >= 0 && age < .18) level = Math.max(level, Math.sin(age / .18 * Math.PI));
      const second = age - Math.min(.17, period * .24);
      if (second >= 0 && second < .13) level = Math.max(level, Math.sin(second / .13 * Math.PI) * .62);
    }
    return level;
  }
  setEvent(event: RoundEvent | null) {
    if (this.event?.kind === event?.kind && this.event?.startedAt === event?.startedAt && this.event?.seed === event?.seed && this.event?.duration === event?.duration) return;
    this.stopEvent(); this.event = event;
    this.startEvent();
  }
  private startEvent() {
    const ctx = this.context, event = this.event;
    if (!ctx || !this.master || !event || this.muted || this.eventLayer) return;
    if (ctx.state !== 'running') {
      const request = this.eventRequest;
      void this.unlock?.then(() => {
        if (this.eventRequest === request && ctx.state === 'running') this.startEvent();
      });
      return;
    }
    const elapsed = Math.max(0, Date.now() - event.startedAt);
    if (elapsed >= event.duration) return;
    const layer = this.makeLayer(this.master); this.eventLayer = layer;
    const now = ctx.currentTime, random = voiceRandom(event.seed ^ 0x9e3779b9);
    const at = (offset: number) => now + Math.max(.005, (offset - elapsed) / 1000);
    if (event.kind === 'door') {
      for (const offset of eventBangOffsets(event)) {
        if (offset < elapsed) continue;
        this.noise(layer, at(offset), .44, .4, 610, random, 'lowpass');
        this.resonance(layer, at(offset), .48, .18, 92, 38);
      }
    } else if (event.kind === 'blackout') {
      for (const offset of [0, event.duration - 280, event.duration - 140, event.duration - 35]) {
        if (offset + 60 < elapsed) continue;
        this.noise(layer, at(offset), .065, .075, 1100, random, 'bandpass');
        this.resonance(layer, at(offset), .075, .025, 110, 64, 'sawtooth');
      }
    } else {
      const duration = (event.duration - elapsed) / 1000;
      this.noise(layer, now + .005, duration, .055, 1800, random, 'highpass', true);
    }
    layer.closed = true;
    if (layer.sources.size === 0) this.disposeLayer(layer);
  }
  private stopEvent() {
    this.eventRequest++;
    if (this.eventLayer) this.stopLayer(this.eventLayer);
    this.eventLayer = null;
  }
  private playMechanism(sound: 'hammer' | 'clack' | 'spin') {
    const ctx = this.context!, layer = this.makeLayer(this.master!), now = ctx.currentTime;
    const random = voiceRandom((sound === 'spin' ? 0x51a7 : sound === 'hammer' ? 0xc0c4 : 0xc1ac) ^ ++this.revolverSerial);
    const clicks = sound === 'spin' ? 12 : 1;
    let offset = .005;
    for (let index = 0; index < clicks; index++) {
      const start = now + offset;
      const volume = sound === 'spin' ? .10 + (index === clicks - 1 ? .05 : 0) : sound === 'hammer' ? .22 : .25;
      // The ratchet slows into its last detent. Short, fixed inharmonic modes
      // sound like steel contact rather than an oscillator sweeping in pitch.
      this.impact(layer, start, sound === 'clack' ? .055 : .025, volume, sound === 'clack' ? 1500 : 2800, random, 'bandpass');
      this.resonance(layer, start, .032, volume * .13, 1327, 1327);
      this.resonance(layer, start + .001, .047, volume * .08, 2789, 2789);
      this.resonance(layer, start + (sound === 'hammer' ? .020 : .008), .027, volume * .15, 613, 613);
      offset += .029 + index * .0044;
    }
    layer.closed = true;
  }
  /** A fast physical impact: sub-millisecond attack and a decaying noise body. */
  private impact(layer: AudioLayer, start: number, duration: number, volume: number, cutoff: number, random: () => number, type: BiquadFilterType) {
    const ctx = this.context!, buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = (random() * 2 - 1) * Math.exp(-index / samples.length * 5);
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), envelope = ctx.createGain();
    source.buffer = buffer; filter.type = type; filter.frequency.value = cutoff; filter.Q.value = type === 'bandpass' ? .8 : .65;
    envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(volume, start + .0005);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(layer.gain);
    this.ownSource(layer, source, [filter, envelope]); source.start(start); source.stop(start + duration);
  }
  private playRevolver(sound: 'click' | 'shot') {
    const ctx = this.context!, now = ctx.currentTime + .002, layer = this.makeLayer(this.master!);
    const random = voiceRandom((sound === 'shot' ? 0x5a07 : 0xc11c) ^ ++this.revolverSerial);
    if (sound === 'click') {
      // Hammer against an empty chamber: a hard pin strike and brief frame ring.
      this.impact(layer, now, .031, .38, 3300, random, 'highpass');
      for (const [frequency, volume, duration] of [[1469, .050, .028], [2953, .027, .040], [4313, .012, .019]]) {
        this.resonance(layer, now + .001, duration, volume, frequency, frequency);
      }
    } else {
      layer.gain.gain.value = .8;
      // Separate the high pressure front, low report, and barrel/body vibration.
      // None of these random samples consume the deck/cylinder's RNG stream.
      this.impact(layer, now, .046, .92, 1900, random, 'highpass');
      this.impact(layer, now + .002, .13, .62, 1350, random, 'lowpass');
      this.resonance(layer, now, .12, .42, 170, 48);
      this.resonance(layer, now + .002, .035, .055, 2471, 2471);
      // Concrete early reflections lose high frequencies with every bounce.
      for (const [delay, volume, cutoff] of [[.037, .17, 2400], [.081, .105, 1700], [.129, .060, 1100]]) {
        this.impact(layer, now + delay, .085, volume, cutoff, random, 'lowpass');
      }
      const room = ctx.createConvolver(), wet = ctx.createGain();
      const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * .30), ctx.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const samples = impulse.getChannelData(channel);
        for (let index = 0; index < samples.length; index++) {
          const age = index / ctx.sampleRate;
          samples[index] = age < .014 ? 0 : (random() * 2 - 1) * Math.exp(-age * 22) * .45;
        }
      }
      room.buffer = impulse; wet.gain.value = .14;
      layer.gain.connect(room); room.connect(wet); wet.connect(this.master!);
      layer.nodes.add(room); layer.nodes.add(wet);
      // Keep the graph alive for its bounded room tail, then disconnect it all.
      const finish = ctx.createBufferSource(); finish.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      this.ownSource(layer, finish, []); finish.connect(layer.gain); finish.start(now + .52);
    }
    layer.closed = true;
  }
  private makeLayer(destination: AudioNode): AudioLayer {
    const gain = this.context!.createGain(); gain.connect(destination);
    return { gain, sources: new Set(), nodes: new Set(), closed: false };
  }
  private ownSource(layer: AudioLayer, source: AudioScheduledSourceNode, nodes: AudioNode[]) {
    layer.sources.add(source); layer.nodes.add(source); nodes.forEach(node => layer.nodes.add(node));
    source.onended = () => {
      [source, ...nodes].forEach(node => { node.disconnect(); layer.nodes.delete(node); });
      layer.sources.delete(source);
      if (layer.closed && layer.sources.size === 0) this.disposeLayer(layer);
    };
  }
  private stopLayer(layer: AudioLayer) {
    const ctx = this.context!; layer.closed = true;
    const now = ctx.currentTime;
    layer.gain.gain.cancelScheduledValues(now); layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
    layer.gain.gain.linearRampToValueAtTime(0, now + .025);
    for (const source of layer.sources) source.stop(now + .03);
    if (layer.sources.size === 0) this.disposeLayer(layer);
  }
  private disposeLayer(layer: AudioLayer) {
    layer.nodes.forEach(node => node.disconnect()); layer.nodes.clear(); layer.gain.disconnect();
    if (this.eventLayer === layer) this.eventLayer = null;
  }
  private noise(layer: AudioLayer, start: number, duration: number, volume: number, cutoff: number, random: () => number, type: BiquadFilterType, flutter = false) {
    const ctx = this.context!, buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate), samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = (random() * 2 - 1) * (flutter ? .55 + random() * .45 : Math.pow(1 - index / samples.length, 2));
    const source = ctx.createBufferSource(), envelope = ctx.createGain(), filter = ctx.createBiquadFilter();
    source.buffer = buffer; filter.type = type; filter.frequency.value = cutoff; filter.Q.value = type === 'bandpass' ? 2.4 : .7;
    envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(volume, start + .006);
    envelope.gain.setValueAtTime(volume, start + Math.max(.007, duration - .04));
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(layer.gain);
    this.ownSource(layer, source, [filter, envelope]); source.start(start); source.stop(start + duration);
  }
  private resonance(layer: AudioLayer, start: number, duration: number, volume: number, pitch: number, endPitch: number, type: OscillatorType = 'sine') {
    const ctx = this.context!, source = ctx.createOscillator(), envelope = ctx.createGain(); source.type = type;
    source.frequency.setValueAtTime(pitch, start); source.frequency.exponentialRampToValueAtTime(endPitch, start + duration);
    envelope.gain.setValueAtTime(volume, start); envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(envelope); envelope.connect(layer.gain);
    this.ownSource(layer, source, [envelope]); source.start(start); source.stop(start + duration);
  }
  play(sound: Sound) {
    if (!this.context || !this.master || this.muted) return;
    if (sound === 'hammer' || sound === 'clack' || sound === 'spin') {
      if (!this.muted) this.playMechanism(sound);
      return;
    }
    const ctx = this.context, now = ctx.currentTime;
    // End the suspense tone at the trigger pull so the click is followed by silence.
    if (this.tension) { this.tension.stop(); this.tension = null; }
    if (sound === 'click' || sound === 'shot') { this.playRevolver(sound); return; }
    if (sound === 'tension') {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.frequency.setValueAtTime(48, now); oscillator.frequency.linearRampToValueAtTime(58, now + 2.5);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.13, now + .5); gain.gain.exponentialRampToValueAtTime(.001, now + 2.5);
      oscillator.connect(gain); gain.connect(this.tensionDuck!);
      this.tension = oscillator;
      oscillator.onended = () => { if (this.tension === oscillator) this.tension = null; };
      oscillator.start(); oscillator.stop(now + 2.5); return;
    }
    const duration = .08, random = voiceRandom(0xca4d);
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate), samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (random() * 2 - 1) * Math.pow(1 - i / samples.length, 2);
    const source = ctx.createBufferSource(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    source.buffer = buffer; filter.type = 'highpass'; filter.frequency.value = 900;
    gain.gain.value = .11;
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
}
export const tableAudio = new TableAudio();
