import { describe, expect, it } from 'vitest';
import { OPENING_STAGES, TRANSFER_STAGES, cinematicProgress, focusRecovery, hoodCoverage, stageDurationMs, tiesForStage, type CinematicState } from './cinematics';
import { createAmbientEvent, monitorActivityAt, nextAmbientDelay, reactionLevel, shotSequenceActive } from './roomLife';
import { boundsOverlap, cardBounds, GUN_BOUNDS } from './tableLayout';
import { createTensionRandom } from './tension';

describe('guard and hood presentation clock', () => {
  it('removes the player hood first, recovers focus, then releases each wrist in order', () => {
    expect(OPENING_STAGES.indexOf('player-unhood')).toBeLessThan(OPENING_STAGES.indexOf('opponent-unhood'));
    expect(OPENING_STAGES.indexOf('guard-exit')).toBeLessThan(OPENING_STAGES.indexOf('rules'));
    const state: CinematicState = { stage: 'player-unhood', startedAt: 1000, mode: 'full' };
    expect(hoodCoverage(state, 1000)).toBe(1); expect(hoodCoverage(state, 1425)).toBeCloseTo(.5);
    expect(hoodCoverage(state, 1850)).toBe(0);
    expect(focusRecovery({ ...state, stage: 'player-focus' }, 1750)).toBe(.5);
    expect(tiesForStage({ ...state, stage: 'cut-opponent' })).toEqual({ player: false, ai: false });
    expect(tiesForStage({ ...state, stage: 'cut-player' })).toEqual({ player: false, ai: true });
    expect(tiesForStage({ ...state, stage: 'complete' })).toEqual({ player: true, ai: true });
  });
  it('clamps cinematic time and covers the transfer after the hood falls', () => {
    for (const stage of [...OPENING_STAGES, ...TRANSFER_STAGES]) {
      const state: CinematicState = { stage, startedAt: 1000, mode: 'transfer' };
      expect(cinematicProgress(state, 1000 + stageDurationMs(stage) + 1)).toBe(1);
      expect(Number.isFinite(cinematicProgress(state, 500))).toBe(true);
    }
    expect(hoodCoverage({ stage: 'transfer-hood', startedAt: 1000, mode: 'transfer' }, 1850)).toBe(1);
    expect(hoodCoverage({ stage: 'dragging', startedAt: 1000, mode: 'transfer' }, 1400)).toBe(1);
  });
});
describe('room life timing and table separation', () => {
  it('keeps ambient timing bounded and cosmetic, and rejects every local shot phase', () => {
    const random = createTensionRandom(741);
    for (let index = 0; index < 100; index++) {
      expect(nextAmbientDelay(random)).toBeGreaterThanOrEqual(15000);
      expect(nextAmbientDelay(random)).toBeLessThanOrEqual(30000);
      const event = createAmbientEvent(String(index), 1000, random);
      expect(reactionLevel(event, 1100)).toBeGreaterThan(0);
      if (!event.loud) expect(reactionLevel(event, 1100, true)).toBe(0);
    }
    expect(shotSequenceActive('AI_SHOOTING')).toBe(true); expect(shotSequenceActive('PLAYER_SHOOTING')).toBe(true);
    expect(shotSequenceActive('PLAYER_DECISION')).toBe(false);
  });
  it('makes some readable monitor activity available at least once per 20 seconds', () => {
    for (let start = 0; start < 100; start++) {
      const noticeable = Array.from({ length: 20 }, (_, i) => monitorActivityAt(3, start + i)).some(event => event.kind !== 'deal');
      expect(noticeable).toBe(true);
    }
  });
  it('keeps all eleven possible cards of each hand apart and clear of the revolver', () => {
    for (let playerCount = 1; playerCount <= 11; playerCount++) for (let aiCount = 1; aiCount <= 11; aiCount++) {
      const cards = [...Array.from({ length: playerCount }, (_, i) => cardBounds('player', i, playerCount)), ...Array.from({ length: aiCount }, (_, i) => cardBounds('ai', i, aiCount))];
      for (let i = 0; i < cards.length; i++) {
        expect(boundsOverlap(cards[i], GUN_BOUNDS)).toBe(false);
        for (let j = i + 1; j < cards.length; j++) expect(boundsOverlap(cards[i], cards[j])).toBe(false);
      }
    }
  });
});
