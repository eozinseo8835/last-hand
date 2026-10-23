// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Typewriter from './Typewriter';
import { tableAudio } from './audio';
import { createVoicePlan } from './voice';

vi.mock('./audio', () => ({ tableAudio: { startVoice: vi.fn(), stopVoice: vi.fn() } }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement, root: Root, mounted: boolean;
function advance(milliseconds: number) { act(() => vi.advanceTimersByTime(milliseconds)); }
function displayed() { return container.querySelectorAll('.dialogue > span')[1]?.textContent ?? ''; }

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container); mounted = true;
});
afterEach(() => {
  if (mounted) act(() => root.unmount());
  container.remove(); vi.useRealTimers(); vi.restoreAllMocks();
});

describe('spoken subtitle timing', () => {
  it('starts one murmur plan and reveals subtitles on that same clock', () => {
    const text = 'The room is patient.';
    const plan = createVoicePlan(text, 'nervous');
    act(() => root.render(<Typewriter text={text} category="nervous"/>));
    expect(displayed()).toBe('');
    expect(tableAudio.startVoice).toHaveBeenCalledExactlyOnceWith(plan);
    const firstSyllable = plan.steps.find(step => step.syllable)!;
    advance(Math.ceil(firstSyllable.at));
    expect(displayed()).toBe(text.slice(0, firstSyllable.count));
    advance(Math.ceil(plan.duration));
    expect(displayed()).toBe(text);
    expect(container.querySelector('.typing')).toBeNull();
    expect(tableAudio.startVoice).toHaveBeenCalledTimes(1);
  });

  it('holds the subtitle at commas and longer at an ellipsis before continuing', () => {
    const text = 'Still, now... Wait?';
    const plan = createVoicePlan(text, 'player_hits');
    act(() => root.render(<Typewriter text={text} category="player_hits"/>));
    const comma = plan.steps[text.indexOf(',')];
    const afterComma = plan.steps[text.indexOf(',') + 1];
    expect(afterComma.at - comma.at).toBeGreaterThan(100);
    advance(Math.ceil(comma.at));
    expect(displayed()).toBe('Still,');
    advance(100);
    expect(displayed()).toBe('Still,');
    const ellipsis = plan.steps[text.indexOf('...') + 2];
    advance(Math.ceil(ellipsis.at) - Math.ceil(comma.at) - 100);
    expect(displayed()).toBe('Still, now...');
    advance(250);
    expect(displayed()).toBe('Still, now...');
    advance(Math.ceil(plan.duration));
    expect(displayed()).toBe(text);
  });

  it('clicking to skip immediately stops the voice and leaves no scheduled letters', () => {
    const text = 'There is very little silence left.';
    act(() => root.render(<Typewriter text={text} category="danger"/>));
    advance(100);
    expect(displayed().length).toBeLessThan(text.length);
    const stops = vi.mocked(tableAudio.stopVoice).mock.calls.length;
    act(() => container.querySelector<HTMLButtonElement>('.dialogue')!.click());
    expect(displayed()).toBe(text);
    expect(tableAudio.stopVoice).toHaveBeenCalledTimes(stops + 1);
    expect(vi.getTimerCount()).toBe(0);
    act(() => root.render(<Typewriter text={text} category="danger"/>));
    advance(10000);
    expect(displayed()).toBe(text);
    expect(tableAudio.startVoice).toHaveBeenCalledTimes(1);
  });

  it('replacing an unfinished line stops its voice and cancels its remaining letters', () => {
    const oldText = 'You keep asking the deck to forgive you.';
    const newText = 'So the table turns.';
    act(() => root.render(<Typewriter text={oldText} category="player_hits"/>));
    advance(100);
    const stops = vi.mocked(tableAudio.stopVoice).mock.calls.length;
    act(() => root.render(<Typewriter text={newText} category="ai_loses_hand"/>));
    expect(tableAudio.stopVoice).toHaveBeenCalledTimes(stops + 1);
    expect(tableAudio.startVoice).toHaveBeenCalledTimes(2);
    expect(displayed()).toBe('');
    advance(Math.ceil(createVoicePlan(newText, 'ai_loses_hand').duration));
    expect(displayed()).toBe(newText);
    advance(10000);
    expect(displayed()).toBe(newText);
  });

  it('unmounting stops the voice and clears subtitle timers', () => {
    act(() => root.render(<Typewriter text="Let us see what your luck is worth." category="intro"/>));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    const stops = vi.mocked(tableAudio.stopVoice).mock.calls.length;
    act(() => root.unmount()); mounted = false;
    expect(tableAudio.stopVoice).toHaveBeenCalledTimes(stops + 1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
