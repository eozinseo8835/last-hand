// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hoodPresentation } from './Scene';
import type { CinematicState } from './cinematics';

function frame(stage: CinematicState['stage'], elapsed: number, mode: CinematicState['mode'] = 'full') {
  return hoodPresentation({ stage, startedAt: 1000, mode }, 1000 + elapsed);
}

describe('first-person burlap removal and focus recovery', () => {
  it('keeps the view covered until the player hood is pulled, then reveals from bottom to top', () => {
    for (const stage of ['hooded', 'door-open', 'guard-approach'] as const) {
      expect(frame(stage, 200).covered).toBe(1); expect(frame(stage, 200).lift).toBe(0);
    }
    expect(frame('player-unhood', 0).lift).toBe(0);
    const middle = frame('player-unhood', 425);
    expect(middle.covered).toBe(1); expect(middle.lift).toBeCloseTo(.5);
    expect(frame('player-unhood', 850).lift).toBe(1);
    expect(frame('opponent-unhood', 200).covered).toBe(0);
    expect(hoodPresentation(null).covered).toBe(0);
  });
  it('jerks the view with the tug, drops the head free, and resolves glare before full focus', () => {
    const tug = frame('player-unhood', 140);
    expect(tug.cameraY).toBeGreaterThan(.04); expect(tug.cameraZ).toBeLessThan(-.035);
    expect(frame('player-unhood', 850).cameraY).toBeCloseTo(0);
    expect(frame('player-focus', 150).cameraY).toBeLessThan(0);
    expect(frame('player-focus', 0)).toMatchObject({ blur: 1, glare: 1, squint: .68 });
    expect(frame('player-focus', 750).glare).toBeLessThan(.025);
    expect(frame('player-focus', 750).blur).toBeCloseTo(.5);
    expect(frame('player-focus', 1500).blur).toBe(0);
    expect(frame('player-focus', 1500).squint).toBe(0);
  });
  it('drops the transfer hood down over the view and preserves full cover during dragging', () => {
    expect(frame('transfer-hood', 0, 'transfer').drop).toBe(0);
    expect(frame('transfer-hood', 425, 'transfer').drop).toBeCloseTo(.5);
    expect(frame('transfer-hood', 850, 'transfer').drop).toBe(1);
    expect(frame('dragging', 600, 'transfer').covered).toBe(1);
    expect(frame('complete', 0).covered).toBe(0);
  });
});
