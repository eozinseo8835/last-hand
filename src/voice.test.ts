import { describe, expect, it, vi } from 'vitest';
import { createVoicePlan, voiceParameters } from './voice';
import { HOST, OPPONENTS } from './campaign';

describe('Stranger murmur pattern', () => {
  it('gives each captive a distinct configured voice without revealing a bluff', () => {
    const text = 'Keep your hands where I can see them.';
    const profiles = Object.values(OPPONENTS).map(opponent => opponent.voice);
    expect(new Set(profiles.map(profile => voiceParameters('confident', false, 0, profile).pitch)).size).toBe(3);
    for (const profile of profiles) {
      for (const fired of [0, 1, 4, 5]) {
        expect(createVoicePlan(text, 'confident', false, fired, profile)).toEqual(createVoicePlan(text, 'bluff', false, fired, profile));
      }
      expect(voiceParameters('player_hits', false, 0, profile)).toMatchObject(profile);
    }
    expect(voiceParameters('confident', false, 0, profiles[0]).pitch).toBeGreaterThan(voiceParameters('confident', false, 0, profiles[1]).pitch);
    expect(voiceParameters('confident', false, 0, profiles[1]).pitch).toBeGreaterThan(voiceParameters('confident', false, 0, profiles[2]).pitch);
  });

  it('keeps the Host deepest, slowest and calm regardless of cards, pressure or category', () => {
    const calm = voiceParameters('intro_rules', false, 0, HOST.voice);
    for (const category of ['deal', 'round_result', 'nervous', 'confident', 'bluff', 'danger', 'broken']) {
      expect(voiceParameters(category, true, 6, HOST.voice)).toEqual(calm);
    }
    for (const opponent of Object.values(OPPONENTS)) for (const danger of [false, true]) {
      const captive = voiceParameters('player_hits', danger, 0, opponent.voice);
      expect(calm.pitch).toBeLessThan(captive.pitch);
      expect(calm.speed).toBeLessThan(captive.speed);
      expect(calm.wobble).toBeLessThan(captive.wobble);
    }
  });
  it('uses the same text-seeded syllables regardless of unrelated game randomness', () => {
    const first = createVoicePlan('The room has been patient.', 'confident');
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Voice must not consume gameplay randomness'); });
    try { expect(createVoicePlan('The room has been patient.', 'confident')).toEqual(first); }
    finally { random.mockRestore(); }
    expect(createVoicePlan('The table has been patient.', 'confident')).not.toEqual(first);
  });

  it('gives confident and bluff exactly the same acoustic settings and text pattern', () => {
    expect(voiceParameters('confident')).toEqual(voiceParameters('bluff'));
    expect(voiceParameters('confident', true)).toEqual(voiceParameters('bluff', true));
    expect(createVoicePlan('You can fold, but you cannot hide.', 'confident')).toEqual(createVoicePlan('You can fold, but you cannot hide.', 'bluff'));
    for (const fired of [1, 2, 4, 5]) {
      expect(voiceParameters('confident', true, fired)).toEqual(voiceParameters('bluff', true, fired));
    }
  });

  it('adds breakdown speed and wobble from fired chambers without changing the calm base voice', () => {
    const baseline = voiceParameters('player_hits');
    expect(voiceParameters('player_hits', false, 0)).toEqual(baseline);
    for (let fired = 1; fired <= 5; fired++) {
      const previous = voiceParameters('player_hits', false, fired - 1), current = voiceParameters('player_hits', false, fired);
      expect(current.pitch).toBe(baseline.pitch);
      expect(current.speed).toBeGreaterThan(previous.speed);
      expect(current.wobble).toBeGreaterThan(previous.wobble);
    }
    const line = 'Keep it still.';
    expect(createVoicePlan(line, 'short', true, 4)).toEqual(createVoicePlan(line, 'short', true, 4));
    expect(createVoicePlan(line, 'short', true, 4).duration).toBeLessThan(createVoicePlan(line, 'short', true, 0).duration);
  });

  it('uses a faster wobblier nervous voice and a deeper slower danger or opening voice', () => {
    const calm = voiceParameters('player_hits'), nervous = voiceParameters('nervous');
    expect(nervous.speed).toBeGreaterThan(calm.speed);
    expect(nervous.wobble).toBeGreaterThan(calm.wobble);
    for (const slow of [voiceParameters('intro'), voiceParameters('danger'), voiceParameters('confident', true)]) {
      expect(slow.pitch).toBeLessThan(calm.pitch); expect(slow.speed).toBeLessThan(calm.speed);
    }
  });

  it('places one syllable on every two or three letters and none on spaces or punctuation', () => {
    const text = 'A quiet room. A stranger, who waits…';
    const plan = createVoicePlan(text, 'player_hits');
    let letters = 0;
    for (const step of plan.steps) {
      const character = text[step.count - 1];
      if (/\p{L}/u.test(character)) letters++;
      else expect(step.syllable).toBeUndefined();
      if (step.syllable) {
        expect(letters).toBeGreaterThanOrEqual(2); expect(letters).toBeLessThanOrEqual(3); letters = 0;
        expect(step.syllable.duration).toBeGreaterThanOrEqual(60); expect(step.syllable.duration).toBeLessThanOrEqual(120);
        expect(step.syllable.pitch).toBeGreaterThan(85); expect(step.syllable.pitch).toBeLessThan(110);
      }
    }
    expect(plan.steps).toHaveLength(text.length);
    expect(plan.steps.at(-1)?.count).toBe(text.length);
    expect(plan.duration).toBeGreaterThanOrEqual(plan.steps.at(-1)!.at);
  });

  it('pauses briefly at commas and longer at sentences and ellipses', () => {
    const gapAfter = (text: string, count: number) => {
      const { steps } = createVoicePlan(text, 'confident');
      return steps[count].at - steps[count - 1].at;
    };
    expect(gapAfter('a b', 1)).toBe(30);
    expect(gapAfter('a,b', 2)).toBe(170);
    expect(gapAfter('a.b', 2)).toBe(310);
    expect(gapAfter('a?b', 2)).toBe(310);
    expect(gapAfter('a...b', 4)).toBe(390);
    expect(gapAfter('a…b', 2)).toBe(390);
    expect(createVoicePlan('', 'intro')).toMatchObject({ steps: [], duration: 0 });
    expect(createVoicePlan(' ... ', 'intro').steps.every(step => !step.syllable)).toBe(true);
  });
});
