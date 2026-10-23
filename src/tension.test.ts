import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG, createRevolver, dealRound } from './game';
import { DIALOGUE, type DialogueCategory } from './dialogue';
import {
  breakdownCategory, breakdownLevel, chooseRoundEvent, chooseTell, createTensionRandom,
  eventBangOffsets, eventDoorPulse, freshAbilities, heartbeatSettings, type RoundEvent,
} from './tension';

const settings = { ...CONFIG };
afterEach(() => { Object.assign(CONFIG, settings); vi.restoreAllMocks(); });

describe('opponent tells without acoustic or gameplay leaks', () => {
  it('matches both strong and weak hands at the configured accuracy over many rounds', () => {
    for (const total of [16, 17, 21]) {
      const random = createTensionRandom(18976 + total);
      const rounds = 20000;
      let matched = 0;
      for (let round = 0; round < rounds; round++) {
        const tell = chooseTell(total, random);
        if ((tell.disposition === 'calm') === (total >= 17)) matched++;
        expect(tell).not.toHaveProperty('total');
      }
      expect(matched / rounds).toBeCloseTo(CONFIG.TELL_ACCURACY, 1);
      expect(Math.abs(matched / rounds - CONFIG.TELL_ACCURACY)).toBeLessThan(.012);
    }
  });

  it('selects one tell from its chosen pool and can make every tell honest or misleading', () => {
    const pools = { calm: ['still', 'steady', 'breathing'], nervous: ['tap', 'avert', 'touch', 'twitch'] };
    for (const accuracy of [0, 1]) {
      CONFIG.TELL_ACCURACY = accuracy;
      for (const total of [12, 17]) for (const kindRoll of [0, .3, .6, .99999]) {
        let roll = 0;
        const tell = chooseTell(total, () => roll++ === 0 ? .5 : kindRoll);
        expect((tell.disposition === 'calm') === (total >= 17)).toBe(accuracy === 1);
        expect(pools[tell.disposition]).toContain(tell.kind);
      }
    }
  });

  it('does not advance deck, bullet, or dialogue randomness when selecting cosmetic effects', () => {
    const sequence = (cosmetics: boolean) => {
      vi.spyOn(Math, 'random').mockImplementation(createTensionRandom(739128));
      return Array.from({ length: 30 }, () => {
        const round = dealRound();
        if (cosmetics) {
          chooseTell(17); chooseTell(12);
          for (let event = 0; event < 5; event++) chooseRoundEvent();
        }
        const revolver = createRevolver();
        return { cards: [...round.player, ...round.ai, ...round.deck].map(card => card.id), revolver };
      });
    };
    const baseline = sequence(false);
    expect(sequence(true)).toEqual(baseline);
  });
});

describe('cosmetic random event plans', () => {
  it('uses the configured round chance and produces bounded effects of all three kinds', () => {
    const random = createTensionRandom(42873), kinds = new Set<string>();
    let events = 0;
    for (let round = 0; round < 10000; round++) {
      const event = chooseRoundEvent(random);
      if (!event) continue;
      events++; kinds.add(event.kind);
      expect(event.duration).toBeGreaterThanOrEqual(3000);
      expect(event.duration).toBeLessThanOrEqual(5000);
      expect(event).not.toHaveProperty('startedAt');
      expect(event).not.toHaveProperty('winner');
    }
    expect(Math.abs(events / 10000 - CONFIG.RANDOM_EVENT_CHANCE)).toBeLessThan(.025);
    expect([...kinds].sort()).toEqual(['blackout', 'door', 'tv']);
    CONFIG.RANDOM_EVENT_CHANCE = 0;
    expect(chooseRoundEvent(() => 0)).toBeNull();
    CONFIG.RANDOM_EVENT_CHANCE = 1;
    expect(chooseRoundEvent(() => .99999)).not.toBeNull();
  });

  it('gives audio and the flinch the same three-to-five deterministic door impacts', () => {
    for (let seed = 0; seed < 40; seed++) {
      const event: RoundEvent = { kind: 'door', startedAt: 5000, duration: 4200, seed };
      const offsets = eventBangOffsets(event);
      expect(offsets).toEqual(eventBangOffsets(event));
      expect(offsets.length).toBeGreaterThanOrEqual(3);
      expect(offsets.length).toBeLessThanOrEqual(5);
      expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
      for (const offset of offsets) {
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThan(event.duration);
        expect(eventDoorPulse(event, event.startedAt + offset)).toBeCloseTo(1);
      }
      expect(eventDoorPulse(event, event.startedAt - 1)).toBe(0);
      expect(eventDoorPulse(event, event.startedAt + event.duration)).toBe(0);
    }
    const tv: RoundEvent = { kind: 'tv', startedAt: 0, duration: 3500, seed: 3 };
    expect(eventBangOffsets(tv)).toEqual([]);
    expect(eventDoorPulse(tv, 500)).toBe(0);
    expect(eventDoorPulse(null, 500)).toBe(0);
  });
});

describe('fear based solely on fired chambers', () => {
  it('raises the exact heartbeat BPM per fired chamber and raises speed and volume during a hold', () => {
    for (let fired = 0; fired <= CONFIG.NUM_CHAMBERS; fired++) {
      const calm = heartbeatSettings(fired), pulling = heartbeatSettings(fired, true);
      expect(calm.bpm).toBe(CONFIG.HEARTBEAT_BASE_BPM + 15 * fired);
      expect(pulling.bpm).toBeGreaterThan(calm.bpm);
      expect(pulling.volume).toBeGreaterThan(calm.volume);
      if (fired > 0) expect(calm.volume).toBeGreaterThan(heartbeatSettings(fired - 1).volume);
    }
    CONFIG.HEARTBEAT_BASE_BPM = 72;
    expect(heartbeatSettings(2).bpm).toBe(102);
  });

  it('switches only at chamber three and five, regardless of the previous dialogue category', () => {
    expect(breakdownLevel(0)).toBe('calm'); expect(breakdownLevel(1)).toBe('calm');
    expect(breakdownLevel(2)).toBe('short'); expect(breakdownLevel(3)).toBe('short');
    expect(breakdownLevel(4)).toBe('broken'); expect(breakdownLevel(5)).toBe('broken');
    for (const category of Object.keys(DIALOGUE) as DialogueCategory[]) {
      expect(breakdownCategory(category, 0)).toBe(category);
      expect(breakdownCategory(category, 2)).toBe('short');
      expect(breakdownCategory(category, 4)).toBe('broken');
    }
  });

  it('provides the requested new dialogue banks and restricts short lines to two-to-four words', () => {
    for (const category of ['impatient', 'opp_spins', 'opp_peeks', 'player_spins', 'player_peeks', 'short', 'broken'] as const) {
      expect(DIALOGUE[category].length).toBeGreaterThanOrEqual(4);
      expect(new Set(DIALOGUE[category]).size).toBe(DIALOGUE[category].length);
    }
    for (const line of DIALOGUE.short) {
      expect(line.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2);
      expect(line.trim().split(/\s+/).length).toBeLessThanOrEqual(4);
    }
  });

  it('creates independent one-use ability inventories for each match', () => {
    const first = freshAbilities(); first.player.spin = false; first.ai.peek = false;
    expect(freshAbilities()).toEqual({ player: { spin: true, peek: true }, ai: { spin: true, peek: true } });
    expect(first.player.peek).toBe(true); expect(first.ai.spin).toBe(true);
  });
});
