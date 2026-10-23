import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableAudio } from './audio';
import { CONFIG } from './game';
import { createVoicePlan } from './voice';

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
  Context.instances = []; Context.initialState = 'running';
  vi.stubGlobal('AudioContext', Context); audio = new TableAudio();
});
afterEach(() => { Object.assign(CONFIG, settings); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
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
