import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableAudio } from './audio';
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
  gain = new Parameter(); frequency = new Parameter(); detune = new Parameter(); Q = new Parameter(); delayTime = new Parameter();
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
  audio.setHeartbeat({ active: false, chambersFired: 0, pulling: false }); audio.setEvent(null);
  vi.clearAllTimers(); vi.useRealTimers(); Object.assign(CONFIG, settings); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function context() { return Context.instances[0]; }

describe('Web Audio Stranger voice', () => {
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
    for (const node of ctx.nodes.slice(2)) expect(node.disconnect).toHaveBeenCalled();
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
    const ctx = context(), heartbeatBus = ctx.nodes[2];
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
    const eventBus = ctx.nodes[2];
    for (const source of ctx.nodes.filter(node => node.kind === 'oscillator' || node.kind === 'source')) source.onended?.();
    expect(eventBus.disconnect).toHaveBeenCalled();
  });

  it('keeps room events and trigger mechanisms silent while muted and avoids replaying expired events', () => {
    audio.init(); audio.mute(true); const ctx = context();
    for (const sound of ['hammer', 'clack', 'spin'] as const) audio.play(sound);
    audio.setEvent({ kind: 'tv', startedAt: Date.now(), duration: 4000, seed: 3 });
    expect(ctx.nodes).toHaveLength(2);
    vi.setSystemTime(Date.now() + 5000); audio.mute(false);
    expect(ctx.nodes).toHaveLength(2);
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

  it('separates a dry empty hammer strike from the shot crack, pressure body and concrete reflections', () => {
    audio.init(); const ctx = context();
    audio.play('click');
    expect(ctx.nodes.filter(node => node.kind === 'reverb')).toHaveLength(0);
    const drySources = ctx.nodes.filter(node => node.kind === 'source');
    expect(drySources).toHaveLength(1);
    expect(drySources[0].stop.mock.calls[0][0]! - drySources[0].start.mock.calls[0][0]!).toBeCloseTo(.031);

    const before = ctx.nodes.length; audio.play('shot');
    const shot = ctx.nodes.slice(before), start = ctx.currentTime + .002;
    const starts = shot.filter(node => node.kind === 'source').map(node => node.start.mock.calls[0][0]!);
    for (const delay of [.037, .081, .129]) expect(starts.some(at => Math.abs(at - start - delay) < .00001)).toBe(true);
    expect(shot.some(node => node.type === 'highpass' && node.frequency.value === 1900)).toBe(true);
    expect(shot.some(node => node.type === 'lowpass' && node.frequency.value === 1350)).toBe(true);
    expect(shot.some(node => node.kind === 'oscillator' && node.frequency.setValueAtTime.mock.calls[0][0] === 170)).toBe(true);
    const room = shot.find(node => node.kind === 'reverb')!;
    expect(room.buffer!.getChannelData(0)).not.toEqual(room.buffer!.getChannelData(1));
    expect(starts.at(-1)).toBeCloseTo(start + .52);
  });

  it('slows the cylinder detents and disconnects every one-shot graph after its final source ends', () => {
    audio.init(); const ctx = context(); audio.play('spin');
    const detents = ctx.nodes.filter(node => node.kind === 'source').map(node => node.start.mock.calls[0][0]!);
    expect(detents).toHaveLength(12);
    expect(detents[11] - detents[10]).toBeGreaterThan(detents[1] - detents[0]);
    expect(detents[11] - ctx.currentTime).toBeLessThan(.8);
    audio.play('click'); audio.play('shot'); audio.play('card');
    for (const source of ctx.nodes.filter(node => node.kind === 'source' || node.kind === 'oscillator')) source.onended?.();
    for (const node of ctx.nodes.slice(2)) expect(node.disconnect).toHaveBeenCalled();
    expect(ctx.nodes[0].disconnect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
