import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableAudio, type StoryCue } from './audio';
import { AMBIENT_KINDS, type AmbientEvent } from './roomLife';
import { CONFIG } from './game';
import { createVoicePlan } from './voice';
import { eventBangOffsets, type RoundEvent } from './tension';

class Parameter {
  value = 1;
  setValueAtTime = vi.fn((value: number, _time: number) => { this.value = value; return this; });
  linearRampToValueAtTime = vi.fn((_value: number, _time: number) => this);
  exponentialRampToValueAtTime = vi.fn((_value: number, _time: number) => this);
  cancelScheduledValues = vi.fn((_time: number) => this);
}
class Node {
  gain = new Parameter(); frequency = new Parameter(); detune = new Parameter(); Q = new Parameter(); delayTime = new Parameter(); pan = new Parameter();
  type = ''; buffer: ReturnType<Context['createBuffer']> | null = null; curve: Float32Array | null = null; oversample = '';
  onended: (() => void) | null = null;
  connect = vi.fn((_target: Node) => _target); disconnect = vi.fn();
  start = vi.fn((_time?: number) => {}); stop = vi.fn((_time?: number) => {});
  constructor(readonly kind: string) {}
}
class Context {
  static instances: Context[] = [];
  static initialState = 'running';
  state = Context.initialState; currentTime = 2; sampleRate = 8000; destination = new Node('destination'); nodes: Node[] = [];
  constructor() { Context.instances.push(this); }
  resume = vi.fn(() => { this.state = 'running'; return Promise.resolve(); });
  make(kind: string) { const node = new Node(kind); this.nodes.push(node); return node; }
  createGain = () => this.make('gain'); createOscillator = () => this.make('oscillator');
  createBufferSource = () => this.make('source'); createBiquadFilter = () => this.make('filter');
  createWaveShaper = () => this.make('distortion'); createConvolver = () => this.make('reverb'); createDelay = () => this.make('delay');
  createBuffer = (channels: number, size: number, _rate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(size));
    return { getChannelData: (channel: number) => data[channel] };
  };
}
const settings = { ...CONFIG };
const plan = () => createVoicePlan('The room is patient. It can wait.', 'confident');
let audio: TableAudio;
beforeEach(() => {
  vi.useFakeTimers();
  Context.instances = []; Context.initialState = 'running';
  vi.stubGlobal('AudioContext', Context); audio = new TableAudio();
});
afterEach(() => {
  audio.setHeartbeat({ active: false, chambersFired: 0, pulling: false }); audio.setEvent(null); audio.setHooded(false); audio.playAmbient(null);
  vi.clearAllTimers(); vi.useRealTimers(); Object.assign(CONFIG, settings); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function context() { return Context.instances[0]; }

describe('Web Audio Stranger voice', () => {
  it('places the final Host line behind the listener after click-authorized resume and cleans up its HRTF panner', async () => {
    const score = plan();
    audio.startVoice(score, 'host', true); expect(Context.instances).toHaveLength(0);
    audio.init(); const ctx = context(); let resumed!: () => void;
    const panners: Array<Node & { panningModel: string; positionX: Parameter; positionY: Parameter; positionZ: Parameter }> = [];
    Object.assign(ctx, {
      createStereoPanner: () => ctx.make('stereo'),
      createPanner: () => {
        const panner = Object.assign(ctx.make('panner'), { panningModel: '', positionX: new Parameter(), positionY: new Parameter(), positionZ: new Parameter() });
        panners.push(panner); return panner;
      },
    });
    ctx.state = 'suspended';
    ctx.resume.mockImplementation(() => new Promise<void>(resolve => { resumed = () => { ctx.state = 'running'; resolve(); }; }));
    audio.init(); audio.startVoice(score, 'host', true);
    expect(panners).toHaveLength(0);
    resumed(); await Promise.resolve(); await Promise.resolve();
    const rear = panners[0]; expect(rear).toBeDefined();
    expect(rear.panningModel).toBe('HRTF');
    expect([rear.positionX.value, rear.positionY.value, rear.positionZ.value]).toEqual([0, 0, 1]);
    expect(ctx.nodes.some(node => node.kind === 'stereo')).toBe(false);
    expect(audio.getVoiceSpeaker()).toBe('host');
    const finish = ctx.nodes.at(-1)!; audio.stopVoice();
    expect(finish.stop).toHaveBeenCalledWith(ctx.currentTime + .08);
    finish.onended?.(); expect(rear.disconnect).toHaveBeenCalled();
  });

  it('uses a centered stereo fallback for the rear line while preserving left positioning at the table', () => {
    audio.init(); const ctx = context();
    Object.assign(ctx, { createStereoPanner: () => ctx.make('stereo') });
    audio.startVoice(plan(), 'host', true);
    expect(ctx.nodes.find(node => node.kind === 'stereo')!.pan.value).toBe(0);
    const previous = ctx.nodes.length; audio.startVoice(plan(), 'host');
    expect(ctx.nodes.slice(previous).find(node => node.kind === 'stereo')!.pan.value).toBe(-.7);
  });

  it('positions Host speech left and captive speech in front, exposing only the active speaker envelope', () => {
    audio.init(); const ctx = context();
    Object.assign(ctx, { createStereoPanner: () => ctx.make('stereo') });
    const score = plan(), syllable = score.steps.find(step => step.syllable)!;
    audio.startVoice(score, 'host');
    const firstPosition = ctx.nodes.find(node => node.kind === 'stereo')!;
    expect(firstPosition.pan.value).toBe(-.7);
    ctx.currentTime += (syllable.at + syllable.syllable!.duration / 2) / 1000;
    expect(audio.getVoiceSpeaker()).toBe('host'); expect(audio.getVoiceLevel('host')).toBeCloseTo(1); expect(audio.getVoiceLevel('captive')).toBe(0);
    const previous = ctx.nodes.length;
    audio.startVoice(score, 'captive');
    const secondPosition = ctx.nodes.slice(previous).find(node => node.kind === 'stereo')!;
    expect(secondPosition.pan.value).toBe(0); expect(audio.getVoiceSpeaker()).toBe('captive'); expect(audio.getVoiceLevel('host')).toBe(0);
    audio.stopVoice(); expect(audio.getVoiceSpeaker()).toBeNull();
    ctx.nodes.at(-1)!.onended?.(); expect(secondPosition.disconnect).toHaveBeenCalled();
  });

  it('keeps speech usable when spatial audio is unsupported and never reports a muted speaker', () => {
    audio.init(); const ctx = context();
    Object.assign(ctx, { createStereoPanner: () => { throw Error('Unsupported device'); } });
    expect(() => audio.startVoice(plan(), 'host')).not.toThrow();
    expect(audio.getVoiceSpeaker()).toBe('host');
    audio.mute(true); expect(audio.getVoiceSpeaker()).toBeNull(); expect(audio.getVoiceLevel('host')).toBe(0);
    audio.mute(false); expect(audio.getVoiceSpeaker()).toBe('host');
  });
  it('does not construct or resume an AudioContext before the Sit Down click', () => {
    audio.startVoice(plan()); audio.stopVoice(); audio.mute(true); audio.play('card');
    expect(audio.getVoiceLevel()).toBe(0); expect(Context.instances).toHaveLength(0);
    audio.init(); expect(Context.instances).toHaveLength(1); expect(context().resume).toHaveBeenCalledTimes(1);
  });

  it('stays silent with no audio API or a rejected resume, without an unhandled rejection', async () => {
    vi.stubGlobal('AudioContext', undefined); expect(() => audio.init()).not.toThrow();
    vi.stubGlobal('AudioContext', Context); audio.init();
    context().state = 'suspended'; context().resume.mockImplementation(() => Promise.reject(new Error('Device unavailable')));
    audio.init(); audio.startVoice(plan()); await Promise.resolve(); await Promise.resolve();
    expect(audio.getVoiceLevel()).toBe(0); expect(context().nodes.filter(node => node.kind === 'oscillator')).toHaveLength(0);
  });

  it('does not schedule any voice when muted or VOICE_ENABLED is false', () => {
    audio.init(); audio.mute(true); audio.startVoice(plan());
    expect(context().nodes.filter(node => node.kind === 'oscillator')).toHaveLength(0);
    audio.mute(false); CONFIG.VOICE_ENABLED = false; audio.startVoice(plan());
    expect(context().nodes.filter(node => node.kind === 'oscillator')).toHaveLength(0);
    expect(audio.getVoiceLevel()).toBe(0);
  });

  it('schedules seeded syllables through vowel filters, distortion, a mask filter and generated room effects', () => {
    audio.init(); const score = plan(); audio.startVoice(score);
    const ctx = context(), syllables = score.steps.filter(step => step.syllable);
    const oscillators = ctx.nodes.filter(node => node.kind === 'oscillator');
    expect(oscillators).toHaveLength(syllables.length * 2);
    expect(oscillators[0].type).toBe('sawtooth'); expect(oscillators[1].type).toBe('square');
    expect(oscillators[0].start).toHaveBeenCalledWith(ctx.currentTime + syllables[0].at / 1000);
    expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(syllables[0].syllable!.pitch, ctx.currentTime + syllables[0].at / 1000);
    expect(ctx.nodes.filter(node => node.type === 'bandpass')).toHaveLength(syllables.length * 3);
    expect(ctx.nodes.some(node => node.type === 'lowpass' && node.frequency.value === 1400)).toBe(true);
    expect(ctx.nodes.find(node => node.kind === 'distortion')?.curve).toBeInstanceOf(Float32Array);
    const impulse = ctx.nodes.find(node => node.kind === 'reverb')!.buffer!.getChannelData(0);
    expect(impulse.some(sample => sample !== 0)).toBe(true);
    expect(ctx.nodes.find(node => node.kind === 'delay')?.delayTime.value).toBe(.085);
    ctx.currentTime += (syllables[0].at + syllables[0].syllable!.duration / 2) / 1000;
    expect(audio.getVoiceLevel()).toBeCloseTo(1);
    ctx.currentTime += 100; expect(audio.getVoiceLevel()).toBe(0);
  });

  it('fades both the dry voice and room tail within 100ms, cancels future syllables, and restores ducking on skip', () => {
    audio.init(); audio.startVoice(plan());
    const ctx = context(), sources = ctx.nodes.filter(node => node.kind === 'oscillator' || node.kind === 'source');
    const line = ctx.nodes.find(node => node.kind === 'gain' && node.gain.value === CONFIG.VOICE_VOLUME)!;
    ctx.currentTime += .12; audio.stopVoice();
    expect(line.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, ctx.currentTime + .06);
    for (const source of sources) expect(source.stop).toHaveBeenLastCalledWith(ctx.currentTime + .08);
    expect(ctx.nodes[1].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, ctx.currentTime + .06);
    expect(audio.getVoiceLevel()).toBe(0);
    sources.at(-1)!.onended!();
    for (const node of ctx.nodes.slice(3)) expect(node.disconnect).toHaveBeenCalled();
  });

  it('mutes an active voice immediately and unmutes at the current subtitle time without restarting it', () => {
    audio.init(); audio.startVoice(plan()); const ctx = context();
    const syllable = plan().steps.find(step => step.syllable)!;
    ctx.currentTime += (syllable.at + syllable.syllable!.duration / 2) / 1000;
    const oscillator = ctx.nodes.find(node => node.kind === 'oscillator')!;
    audio.mute(true);
    expect(ctx.nodes[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0, ctx.currentTime);
    expect(audio.getVoiceLevel()).toBe(0);
    expect(ctx.nodes[1].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, ctx.currentTime + .06);
    audio.mute(false); expect(audio.getVoiceLevel()).toBeCloseTo(1); expect(oscillator.start).toHaveBeenCalledTimes(1);
    ctx.currentTime += 100; expect(audio.getVoiceLevel()).toBe(0);
  });

  it('ducks only the existing tension bus and restores it after the last syllable without a new dialogue', () => {
    audio.init(); audio.play('tension'); const ctx = context(), tension = ctx.nodes.find(node => node.kind === 'oscillator')!;
    const envelope = tension.connect.mock.calls[0][0]; expect(envelope.connect).toHaveBeenCalledWith(ctx.nodes[1]);
    audio.startVoice(plan());
    expect(ctx.nodes[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(.76, ctx.currentTime + .06);
    expect(ctx.nodes[1].gain.linearRampToValueAtTime.mock.calls.at(-1)![0]).toBe(1);
    const finish = ctx.nodes.at(-1)!; finish.onended!(); expect(audio.getVoiceLevel()).toBe(0);
  });

  it('waits for an authorized pending resume and can cancel that pending line on skip', async () => {
    Context.initialState = 'suspended';
    let resume!: () => void;
    vi.spyOn(Context.prototype, 'make');
    audio.init(); const ctx = context(); ctx.state = 'suspended';
    ctx.resume.mockImplementation(() => new Promise<void>(resolve => { resume = () => { ctx.state = 'running'; resolve(); }; }));
    audio.init(); audio.startVoice(plan()); expect(ctx.nodes.filter(node => node.kind === 'oscillator')).toHaveLength(0);
    resume(); await Promise.resolve(); await Promise.resolve();
    expect(ctx.nodes.some(node => node.kind === 'oscillator')).toBe(true);
    audio.stopVoice(); ctx.state = 'suspended'; audio.init(); audio.startVoice(plan()); audio.stopVoice();
    const count = ctx.nodes.length; resume(); await Promise.resolve(); await Promise.resolve(); expect(ctx.nodes).toHaveLength(count);
  });
});

describe('heartbeat, trigger mechanics and room events', () => {
  it('shapes a muffled inhale and exhale beneath the hood instead of a continuous hiss', () => {
    audio.init(); const ctx = context(); audio.playStory('hood');
    const breathing = ctx.nodes.find(node => node.kind === 'source' && node.buffer!.getChannelData(0).length > ctx.sampleRate)!;
    expect(breathing).toBeDefined();
    const body = breathing.connect.mock.calls[0][0];
    const cloth = body.connect.mock.calls[0][0];
    const envelope = cloth.connect.mock.calls[0][0];
    expect(body.type).toBe('highpass'); expect(body.frequency.value).toBeGreaterThan(0);
    expect(cloth.type).toBe('lowpass'); expect(cloth.frequency.value).toBeLessThan(1000);
    const contours = envelope.gain.linearRampToValueAtTime.mock.calls;
    expect(contours).toHaveLength(4);
    expect(contours[0][0]).toBeGreaterThan(0); expect(contours[1][0]).toBe(0);
    expect(contours[2][0]).toBeGreaterThan(0); expect(contours[3][0]).toBe(0);
    expect(contours.every((contour, index) => index === 0 || contour[1] > contours[index - 1][1])).toBe(true);
    expect(envelope.gain.setValueAtTime.mock.calls.some(([volume, at]) => volume === 0 && at > contours[1][1] && at < contours[2][1])).toBe(true);
    const duration = breathing.stop.mock.calls[0][0]! - breathing.start.mock.calls[0][0]!;
    expect(duration).toBeGreaterThan(1); expect(duration).toBeLessThan(1.3);
    const nodes = ctx.nodes.slice(3);
    for (const source of nodes.filter(node => node.kind === 'source' || node.kind === 'oscillator')) source.onended?.();
    for (const node of nodes) expect(node.disconnect).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps story cues click-gated and muted, then synthesizes them without files or gameplay randomness', () => {
    const kinds = ['hood', 'drag', 'door', 'feed-shot', 'escape'] as const;
    for (const kind of kinds) audio.playStory(kind);
    expect(Context.instances).toHaveLength(0);
    audio.init(); audio.mute(true); const ctx = context();
    for (const kind of kinds) audio.playStory(kind);
    expect(ctx.nodes).toHaveLength(3);
    audio.mute(false);
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('Story cue changed gameplay randomness'); });
    for (const kind of kinds) {
      const previous = ctx.nodes.length;
      audio.playStory(kind);
      const nodes = ctx.nodes.slice(previous), sources = nodes.filter(node => node.kind === 'oscillator' || node.kind === 'source');
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.every(node => node.start.mock.calls[0][0]! >= ctx.currentTime)).toBe(true);
      sources.forEach(source => source.onended?.());
      expect(nodes[0].disconnect).toHaveBeenCalled();
    }
    random.mockRestore(); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not unlock audio for heartbeat or events and starts a requested beat only after init', async () => {
    audio.setHeartbeat({ active: true, chambersFired: 0, pulling: false });
    audio.setEvent({ kind: 'door', startedAt: Date.now(), duration: 4000, seed: 43 });
    audio.play('spin');
    expect(Context.instances).toHaveLength(0); expect(audio.getHeartbeatLevel()).toBe(0);
    audio.init(); await Promise.resolve(); await Promise.resolve();
    expect(context().resume).toHaveBeenCalledTimes(1);
    expect(context().nodes.some(node => node.kind === 'oscillator')).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('uses the BPM interval for fired chambers and a faster, louder beat while pulling', () => {
    audio.init(); const ctx = context();
    audio.setHeartbeat({ active: true, chambersFired: 0, pulling: false });
    let beats = ctx.nodes.filter(node => node.kind === 'oscillator');
    const first = beats[0].start.mock.calls[0][0]!;
    ctx.currentTime += .92; vi.advanceTimersByTime(25);
    beats = ctx.nodes.filter(node => node.kind === 'oscillator');
    expect(beats[2].start.mock.calls[0][0]! - first).toBeCloseTo(1);
    const baselineVolume = ctx.nodes.find(node => node.kind === 'gain' && node.gain.linearRampToValueAtTime.mock.calls.some(([gain]) => gain === .09))!;
    expect(baselineVolume).toBeDefined();

    const previous = ctx.nodes.length;
    audio.setHeartbeat({ active: true, chambersFired: 3, pulling: true });
    const pullingFirst = ctx.nodes.slice(previous).find(node => node.kind === 'oscillator')!;
    ctx.currentTime += .4; vi.advanceTimersByTime(25);
    const fastBeats = ctx.nodes.slice(previous).filter(node => node.kind === 'oscillator');
    expect(fastBeats[2].start.mock.calls[0][0]! - pullingFirst.start.mock.calls[0][0]!).toBeCloseTo(60 / 130);
    expect(ctx.nodes.slice(previous).some(node => node.kind === 'gain' && node.gain.linearRampToValueAtTime.mock.calls.some(([gain]) => gain > .09))).toBe(true);
    const start = pullingFirst.start.mock.calls[0][0]!;
    ctx.currentTime = start + .09; expect(audio.getHeartbeatLevel()).toBeCloseTo(1);
  });

  it('mutes the heartbeat, cancels its scheduler, and resumes only its current state on unmute', () => {
    audio.init(); audio.mute(true);
    audio.setHeartbeat({ active: true, chambersFired: 2, pulling: false });
    const ctx = context(); expect(ctx.nodes.filter(node => node.kind === 'oscillator')).toHaveLength(0);
    audio.mute(false); const sources = ctx.nodes.filter(node => node.kind === 'oscillator');
    expect(sources).toHaveLength(2); expect(vi.getTimerCount()).toBe(1);
    audio.mute(true);
    expect(ctx.nodes[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0, ctx.currentTime);
    for (const source of sources) expect(source.stop).toHaveBeenLastCalledWith(ctx.currentTime + .03);
    expect(vi.getTimerCount()).toBe(0); expect(audio.getHeartbeatLevel()).toBe(0);
    const count = ctx.nodes.length; ctx.currentTime += 30; vi.advanceTimersByTime(30000);
    expect(ctx.nodes).toHaveLength(count);
    audio.mute(false); expect(vi.getTimerCount()).toBe(1);
    audio.setHeartbeat({ active: false, chambersFired: 2, pulling: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ducks the heartbeat through the same speaking bus and restores it when speech is skipped', () => {
    audio.init(); audio.setHeartbeat({ active: true, chambersFired: 0, pulling: false });
    const ctx = context(), heartbeatBus = ctx.nodes[3];
    expect(heartbeatBus.connect).toHaveBeenCalledWith(ctx.nodes[1]);
    audio.startVoice(plan());
    expect(ctx.nodes[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(.76, ctx.currentTime + .06);
    audio.stopVoice();
    expect(ctx.nodes[1].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, ctx.currentTime + .06);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('bounds a resumed scheduler to a single new beat after a long suspended tab', () => {
    audio.init(); audio.setHeartbeat({ active: true, chambersFired: 5, pulling: true }); const ctx = context();
    const count = ctx.nodes.filter(node => node.kind === 'oscillator').length;
    ctx.currentTime += 60; vi.advanceTimersByTime(25);
    expect(ctx.nodes.filter(node => node.kind === 'oscillator')).toHaveLength(count + 2);
    expect(vi.getTimerCount()).toBe(1);
    audio.setHeartbeat({ active: false, chambersFired: 5, pulling: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('schedules each deterministic door bang once and cancels future bangs when the decision ends', () => {
    audio.init(); const ctx = context();
    const event: RoundEvent = { kind: 'door', startedAt: Date.now(), duration: 4000, seed: 614 };
    const offsets = eventBangOffsets(event);
    audio.setEvent(event);
    const oscillators = ctx.nodes.filter(node => node.kind === 'oscillator');
    expect(oscillators).toHaveLength(offsets.length);
    expect(oscillators.map(node => node.start.mock.calls[0][0])).toEqual(offsets.map(ms => ctx.currentTime + ms / 1000));
    const count = ctx.nodes.length; audio.setEvent({ ...event }); expect(ctx.nodes).toHaveLength(count);
    audio.setEvent(null);
    for (const source of ctx.nodes.filter(node => node.kind === 'oscillator' || node.kind === 'source')) expect(source.stop).toHaveBeenLastCalledWith(ctx.currentTime + .03);
    expect(vi.getTimerCount()).toBe(0);
    const eventBus = ctx.nodes[3];
    for (const source of ctx.nodes.filter(node => node.kind === 'oscillator' || node.kind === 'source')) source.onended?.();
    expect(eventBus.disconnect).toHaveBeenCalled();
  });

  it('keeps room events and trigger mechanisms silent while muted and avoids replaying expired events', () => {
    audio.init(); audio.mute(true); const ctx = context();
    for (const sound of ['hammer', 'clack', 'spin'] as const) audio.play(sound);
    audio.setEvent({ kind: 'tv', startedAt: Date.now(), duration: 4000, seed: 3 });
    expect(ctx.nodes).toHaveLength(3);
    vi.setSystemTime(Date.now() + 5000); audio.mute(false);
    expect(ctx.nodes).toHaveLength(3);
    audio.play('spin');
    expect(ctx.nodes.filter(node => node.kind === 'source')).toHaveLength(12);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses seeded generated static and blackout buzzes without consuming gameplay randomness', () => {
    audio.init(); const ctx = context();
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('Presentation audio used gameplay RNG'); });
    const event: RoundEvent = { kind: 'tv', startedAt: Date.now(), duration: 3400, seed: 86 };
    audio.setEvent(event);
    const buffer = ctx.nodes.find(node => node.kind === 'source')!.buffer!.getChannelData(0).slice();
    audio.setEvent(null); const previous = ctx.nodes.length;
    audio.setEvent(event);
    expect(ctx.nodes.slice(previous).find(node => node.kind === 'source')!.buffer!.getChannelData(0)).toEqual(buffer);
    audio.setEvent({ ...event, kind: 'blackout' });
    expect(ctx.nodes.filter(node => node.kind === 'oscillator')).toHaveLength(4);
    audio.play('hammer'); audio.play('clack'); random.mockRestore();
  });
});

describe('physical revolver reports', () => {
  const sounds = ['hammer', 'clack', 'spin', 'click', 'shot'] as const;

  it('never unlocks audio for a mechanism or shot and allocates no effects while muted', () => {
    for (const sound of sounds) audio.play(sound);
    expect(Context.instances).toHaveLength(0);
    audio.init(); audio.mute(true);
    const nodes = context().nodes.length;
    for (const sound of sounds) audio.play(sound);
    expect(context().nodes).toHaveLength(nodes);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses isolated synthesized noise for every report without changing gameplay randomness', () => {
    audio.init();
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('Revolver audio consumed gameplay RNG'); });
    for (const sound of [...sounds, 'card'] as const) expect(() => audio.play(sound)).not.toThrow();
    expect(random).not.toHaveBeenCalled();
    for (const node of context().nodes.filter(node => node.kind === 'source' && node.buffer)) {
      const samples = node.buffer!.getChannelData(0);
      expect(samples.length).toBeLessThanOrEqual(context().sampleRate * .53);
      if (samples.length > 1) expect(samples.some(sample => sample !== 0)).toBe(true);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('separates a dry empty strike from one composite bang, continuous room tail, and quiet ear ring', () => {
    audio.init(); const ctx = context(); audio.play('click');
    expect(ctx.nodes.filter(node => node.kind === 'reverb')).toHaveLength(0);
    const drySources = ctx.nodes.filter(node => node.kind === 'source');
    expect(drySources).toHaveLength(1);
    expect(drySources[0].stop.mock.calls[0][0]! - drySources[0].start.mock.calls[0][0]!).toBeCloseTo(.031);
    const before = ctx.nodes.length; audio.play('shot');
    const shot = ctx.nodes.slice(before), start = ctx.currentTime + .002;
    const reports = shot.filter(node => node.kind === 'source' && node.buffer!.getChannelData(0).length > 1);
    expect(reports).toHaveLength(1);
    expect(reports[0].start).toHaveBeenCalledWith(start);
    expect(reports[0].stop).toHaveBeenCalledWith(start + .20);
    const ring = shot.find(node => node.kind === 'oscillator')!;
    expect(ring.start).toHaveBeenCalledWith(start + .11);
    expect(ring.frequency.setValueAtTime).toHaveBeenCalledWith(2920, start + .11);
    const room = shot.find(node => node.kind === 'reverb')!;
    expect(room.buffer!.getChannelData(0)).not.toEqual(room.buffer!.getChannelData(1));
    expect(shot.some(node => node.type === 'lowpass' && node.frequency.value <= ctx.sampleRate * .45)).toBe(true);
  });

  it('slows the cylinder detents and disconnects every one-shot graph after its final source ends', () => {
    audio.init(); const ctx = context(); audio.play('spin');
    const detents = ctx.nodes.filter(node => node.kind === 'source').map(node => node.start.mock.calls[0][0]!);
    expect(detents).toHaveLength(12);
    expect(detents[11] - detents[10]).toBeGreaterThan(detents[1] - detents[0]);
    expect(detents[11] - ctx.currentTime).toBeLessThan(.8);
    audio.play('click'); audio.play('shot'); audio.play('card');
    for (const source of ctx.nodes.filter(node => node.kind === 'source' || node.kind === 'oscillator')) source.onended?.();
    for (const node of ctx.nodes.slice(3)) expect(node.disconnect).toHaveBeenCalled();
    expect(ctx.nodes[0].disconnect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('single-id shots, guard cues, and hooded room mixing', () => {
  const ambient = (kind: AmbientEvent['kind'], id = kind): AmbientEvent => ({
    id, kind, startedAt: Date.now(), duration: 4000, loud: true, direction: -1, seed: 741,
  });
  const reports = (nodes: Node[]) => nodes.filter(node => node.kind === 'source' && node.buffer && node.buffer.getChannelData(0).length > 1);

  it('can store a hood and ambient cue before the first click without creating an AudioContext', () => {
    audio.setHooded(true); audio.playAmbient(ambient('speaker'));
    expect(audio.playShot({ id: 'pre-click', kind: 'local' })).toBe(false);
    for (const cue of ['door-creak', 'boots', 'burlap-tug', 'snip'] as StoryCue[]) audio.playStory(cue);
    expect(Context.instances).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  });

  it('routes the entire room through one hood lowpass, then unmuffles and cancels close breathing', async () => {
    audio.setHooded(true); audio.init(); await Promise.resolve(); await Promise.resolve();
    const ctx = context(), filter = ctx.nodes[2];
    expect(filter.kind).toBe('filter'); expect(filter.type).toBe('lowpass');
    expect(filter.frequency.value).toBe(350);
    expect(ctx.nodes[0].connect).toHaveBeenCalledExactlyOnceWith(filter);
    expect(filter.connect).toHaveBeenCalledExactlyOnceWith(ctx.destination);
    expect(ctx.nodes[0].connect).not.toHaveBeenCalledWith(ctx.destination);
    expect(reports(ctx.nodes).length).toBeGreaterThan(0); expect(vi.getTimerCount()).toBe(1);
    const nodes = ctx.nodes.length;
    audio.setHooded(true); audio.init(); await Promise.resolve(); await Promise.resolve();
    expect(ctx.nodes).toHaveLength(nodes); expect(vi.getTimerCount()).toBe(1);
    audio.setHooded(false);
    expect(filter.frequency.exponentialRampToValueAtTime).toHaveBeenLastCalledWith(19000, ctx.currentTime + .24);
    expect(vi.getTimerCount()).toBe(0);
    for (const source of ctx.nodes.filter(node => node.kind === 'source' || node.kind === 'oscillator')) {
      expect(source.stop).toHaveBeenLastCalledWith(ctx.currentTime + .03); source.onended?.();
    }
    for (const node of ctx.nodes.slice(3)) expect(node.disconnect).toHaveBeenCalled();
    expect(filter.disconnect).not.toHaveBeenCalled();
  });

  it('cancels a covered breath before losing ownership when the audio clock is suspended', async () => {
    audio.init(); await Promise.resolve(); await Promise.resolve();
    audio.setHooded(true); const ctx = context();
    const oldSources = ctx.nodes.filter(node => node.kind === 'source' || node.kind === 'oscillator');
    ctx.state = 'suspended';
    vi.advanceTimersByTime(2900); await Promise.resolve();
    for (const source of oldSources) expect(source.stop).toHaveBeenLastCalledWith(ctx.currentTime + .03);
    audio.setHooded(false); const before = ctx.nodes.length;
    ctx.state = 'running'; audio.init(); await Promise.resolve(); await Promise.resolve();
    expect(ctx.nodes).toHaveLength(before); expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts a shot identity only once across all delivery paths and creates one bang onset', () => {
    audio.init(); const ctx = context();
    expect(audio.playShot({ id: 'run1-room1-pull1', kind: 'local' })).toBe(true);
    const count = ctx.nodes.length;
    expect(audio.playShot({ id: 'run1-room1-pull1', kind: 'local' })).toBe(false);
    expect(audio.playShot({ id: 'run1-room1-pull1', kind: 'distant', roomId: 3 })).toBe(false);
    expect(ctx.nodes).toHaveLength(count); expect(reports(ctx.nodes)).toHaveLength(1);
    expect(audio.playShot({ id: 'run1-room1-table3', kind: 'distant', roomId: 3 })).toBe(true);
    expect(reports(ctx.nodes)).toHaveLength(2);
    for (const report of reports(ctx.nodes)) expect(report.start).toHaveBeenCalledExactlyOnceWith(ctx.currentTime + .002);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('makes each distant shot one strong filtered report from the fixed wall direction without an ear ring', () => {
    audio.init(); const ctx = context(); Object.assign(ctx, { createStereoPanner: () => ctx.make('stereo') });
    for (const direction of [-1, 1]) {
      const start = ctx.nodes.length;
      audio.playShot({ id: `wall${direction}`, kind: 'distant', roomId: 2, direction });
      const nodes = ctx.nodes.slice(start), body = reports(nodes);
      expect(body).toHaveLength(1); expect(body[0].buffer!.getChannelData(0).some(sample => Math.abs(sample) > .4)).toBe(true);
      expect(nodes.filter(node => node.kind === 'oscillator')).toHaveLength(0);
      expect(nodes.find(node => node.kind === 'stereo')!.pan.value).toBe(direction * .72);
      expect(nodes.some(node => node.type === 'lowpass' && node.frequency.value === 1350)).toBe(true);
      for (const source of nodes.filter(node => node.kind === 'source')) source.onended?.();
      for (const node of nodes) expect(node.disconnect).toHaveBeenCalled();
    }
  });

  it('never replays muted shots, and bounds the dedupe history without allocating sound graphs', () => {
    audio.init(); audio.mute(true); const ctx = context(), count = ctx.nodes.length;
    for (let index = 0; index < 300; index++) audio.playShot({ id: `muted:${index}`, kind: 'local' });
    expect(ctx.nodes).toHaveLength(count); audio.mute(false);
    expect(audio.playShot({ id: 'muted:299', kind: 'local' })).toBe(false);
    expect(audio.playShot({ id: 'muted:0', kind: 'local' })).toBe(true);
    expect(reports(ctx.nodes)).toHaveLength(1);
  });

  it('deduplicates a shot while its click-authorized resume is pending', async () => {
    audio.init(); const ctx = context(); let resume!: () => void;
    ctx.state = 'suspended'; ctx.resume.mockImplementation(() => new Promise<void>(resolve => { resume = () => { ctx.state = 'running'; resolve(); }; }));
    audio.init();
    const event = { id: 'pending', kind: 'local' as const };
    expect(audio.playShot(event)).toBe(true); expect(audio.playShot(event)).toBe(false);
    expect(reports(ctx.nodes)).toHaveLength(0);
    resume(); await Promise.resolve(); await Promise.resolve();
    expect(reports(ctx.nodes)).toHaveLength(1);
  });

  it('synthesizes all guard and ambient cues with isolated randomness and cancels pending room activity', () => {
    audio.init(); const ctx = context();
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('Presentation consumed gameplay RNG'); });
    const cues: StoryCue[] = ['door-creak', 'door-slam', 'boots', 'burlap-tug', 'hood-cinch', 'gasp', 'sob', 'snip'];
    for (const cue of cues) expect(() => audio.playStory(cue)).not.toThrow();
    for (const kind of AMBIENT_KINDS) {
      const event = ambient(kind); audio.playAmbient(event); const count = ctx.nodes.length;
      audio.playAmbient({ ...event }); expect(ctx.nodes).toHaveLength(count);
      audio.playAmbient(null);
    }
    expect(random).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    for (const source of ctx.nodes.filter(node => node.kind === 'source' || node.kind === 'oscillator')) source.onended?.();
    for (const node of ctx.nodes.slice(3)) expect(node.disconnect).toHaveBeenCalled();
  });

  it('does not replay expired ambient sounds or missed footsteps when unmuting', () => {
    audio.init(); const ctx = context(), event = ambient('footsteps');
    audio.mute(true); audio.playAmbient(event); const count = ctx.nodes.length;
    vi.setSystemTime(event.startedAt + 700); audio.mute(false);
    const nodes = ctx.nodes.slice(count), steps = reports(nodes);
    expect(steps).toHaveLength(3);
    for (const [index, offset] of [.005, .355, .705].entries()) expect(steps[index].start.mock.calls[0][0]!).toBeCloseTo(ctx.currentTime + offset, 8);
    audio.mute(true); vi.setSystemTime(event.startedAt + event.duration + 1);
    const previous = ctx.nodes.length; audio.mute(false); expect(ctx.nodes).toHaveLength(previous);
    audio.playAmbient(null);
  });
});
