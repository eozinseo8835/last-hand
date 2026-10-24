import { describe, expect, it, vi } from 'vitest';
import { DIALOGUE, type DialogueCategory } from './dialogue';
import { createTensionRandom } from './tension';
import type { RoomNumber } from './campaign';
import {
  EXCHANGES, FINAL_HOST_LINE, HOST_DIALOGUE, NERVOUS_BEGGING, OPENING_LINES,
  OPPONENT_DIALOGUE, ROOM_ARRIVAL, SHORT_INTRO, chooseBeggingLine, chooseExchange,
  chooseHostLine, chooseOpponentLine, shouldExchange, type HostCategory,
} from './campaignDialogue';

const rooms: RoomNumber[] = [1, 2, 3];

describe('the Host and three captive voices', () => {
  it('has at least four original personality lines for every existing category and every opponent', () => {
    const oldLines = new Set<string>(Object.values(DIALOGUE).flat());
    const seen = new Set<string>();
    for (const room of rooms) {
      expect(Object.keys(OPPONENT_DIALOGUE[room]).sort()).toEqual(Object.keys(DIALOGUE).sort());
      for (const category of Object.keys(DIALOGUE) as DialogueCategory[]) {
        const lines = OPPONENT_DIALOGUE[room][category];
        expect(lines.length).toBeGreaterThanOrEqual(4); expect(new Set(lines).size).toBe(lines.length);
        for (const line of lines) {
          expect(line.trim().length).toBeGreaterThan(0); expect(oldLines.has(line)).toBe(false);
          expect(seen.has(line)).toBe(false); seen.add(line);
        }
      }
      for (const line of OPPONENT_DIALOGUE[room].short) {
        expect(line.split(/\s+/).length).toBeGreaterThanOrEqual(2);
        expect(line.split(/\s+/).length).toBeLessThanOrEqual(4);
      }
    }
    expect(NERVOUS_BEGGING.length).toBeGreaterThanOrEqual(4);
    expect(OPPONENT_DIALOGUE[3].broken).toContain('They promised me this was the last season.');
  });

  it('keeps Host pools procedural and separate from the captive strength or bluff categories', () => {
    expect(Object.keys(HOST_DIALOGUE).sort()).toEqual(['intro_rules', 'deal', 'round_result', 'other_room_death', 'waiting_for_trigger', 'transition', 'ending_win', 'ending_death', 'cut_ties', 'host_caught_player', 'trigger_warning', 'forced_shot'].sort());
    for (const lines of Object.values(HOST_DIALOGUE)) {
      expect(lines.length).toBeGreaterThanOrEqual(4); expect(new Set(lines).size).toBe(lines.length);
      for (const line of lines) expect(line).not.toMatch(/strong hand|weak hand|bluff|my cards|my hand|nervous/i);
    }
    expect(ROOM_ARRIVAL[3]).toBe('Smile. They paid to see this.');
    expect(FINAL_HOST_LINE).toBe('See you next season.');
  });

  it('covers every rule in the six-line full opening and provides a single shorter return line', () => {
    expect(OPENING_LINES).toHaveLength(6);
    const script = OPENING_LINES.join(' ');
    expect(script).toMatch(/Eight guests.*Four tables.*One door/);
    for (const term of ['blackjack', 'twenty-one', 'HIT', 'STAND', 'FOLD', 'revolver', 'bullet', 'loser', 'SPIN', 'PEEK']) expect(script).toContain(term);
    expect(script).toContain('last guest standing'); expect(SHORT_INTRO).toBeTruthy();
    expect(SHORT_INTRO.length).toBeLessThan(script.length);
  });

  it('provides six original captive questions and cold Host responses for each opponent', () => {
    const text = new Set<string>();
    for (const room of rooms) {
      expect(EXCHANGES[room].length).toBeGreaterThanOrEqual(6);
      for (const pair of EXCHANGES[room]) {
        expect(pair.captive).toContain('?'); expect(pair.host.length).toBeGreaterThan(0);
        expect(text.has(pair.captive)).toBe(false); expect(text.has(pair.host)).toBe(false);
        text.add(pair.captive); text.add(pair.host);
        expect(pair.host).not.toMatch(/strong hand|weak hand|bluff|my cards|my hand/i);
      }
    }
    const random = createTensionRandom(682345); let exchanges = 0;
    for (let round = 0; round < 20000; round++) if (shouldExchange(random)) exchanges++;
    expect(Math.abs(exchanges / 20000 - .2)).toBeLessThan(.012);
  });

  it('avoids immediate line and exchange repeats while keeping story selection out of game RNG', () => {
    for (const category of Object.keys(HOST_DIALOGUE) as HostCategory[]) {
      const first = chooseHostLine(category, '', () => 0);
      expect(chooseHostLine(category, first, () => 0)).not.toBe(first);
    }
    for (const room of rooms) {
      for (const category of Object.keys(DIALOGUE) as DialogueCategory[]) {
        const first = chooseOpponentLine(room, category, '', () => 0);
        expect(chooseOpponentLine(room, category, first, () => 0)).not.toBe(first);
      }
      const first = chooseExchange(room, null, () => 0);
      expect(chooseExchange(room, first, () => 0)).not.toBe(first);
    }
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('Story lines must not move the deck or bullet RNG'); });
    try {
      expect(chooseHostLine('deal')).toBeTruthy(); expect(chooseOpponentLine(1, 'nervous')).toBeTruthy();
      expect(chooseBeggingLine()).toBeTruthy(); expect(chooseExchange(3)).toBeTruthy();
      expect(typeof shouldExchange()).toBe('boolean');
    } finally { random.mockRestore(); }
  });
});
