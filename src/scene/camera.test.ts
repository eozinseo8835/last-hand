import { describe, expect, it } from 'vitest';
import { createLookState, dragLook, LOOK_LIMITS, shouldRecenter, updateLook } from './camera';
import type { GamePhase } from '../game';

const SENSITIVITY = .0035;

describe('seated camera controls', () => {
  it('starts centered and creates independent reset state', () => {
    const first = createLookState();
    dragLook(first, 100, 100, SENSITIVITY);
    expect(createLookState()).toEqual({ yaw:0, pitch:0, targetYaw:0, targetPitch:0 });
    expect(first.targetYaw).not.toBe(0);
  });

  it('clamps large diagonal drags at ±100 degrees yaw and ±35 degrees pitch', () => {
    const state = createLookState();
    dragLook(state, 100_000, 100_000, SENSITIVITY);
    expect(state.targetYaw).toBe(-LOOK_LIMITS.yaw);
    expect(state.targetPitch).toBe(-LOOK_LIMITS.pitch);
    dragLook(state, -200_000, -200_000, SENSITIVITY);
    expect(state.targetYaw).toBe(LOOK_LIMITS.yaw);
    expect(state.targetPitch).toBe(LOOK_LIMITS.pitch);
    expect(LOOK_LIMITS.yaw * 180 / Math.PI).toBeCloseTo(100);
    expect(LOOK_LIMITS.pitch * 180 / Math.PI).toBeCloseTo(35);
  });

  it('looks right/down for right/down drags without directly snapping current rotation', () => {
    const state = createLookState();
    dragLook(state, 40, 20, SENSITIVITY);
    expect(state.targetYaw).toBeCloseTo(-.14);
    expect(state.targetPitch).toBeCloseTo(-.07);
    expect(state.yaw).toBe(0);
    expect(state.pitch).toBe(0);
  });

  it('smoothly approaches a target and never overshoots it', () => {
    const state = createLookState();
    dragLook(state, -200, -100, SENSITIVITY);
    updateLook(state, 1/60, false);
    expect(state.yaw).toBeGreaterThan(0);
    expect(state.yaw).toBeLessThan(state.targetYaw);
    expect(state.pitch).toBeGreaterThan(0);
    expect(state.pitch).toBeLessThan(state.targetPitch);
    for (let i=0; i<180; i++) updateLook(state, 1/60, false);
    expect(state.yaw).toBeCloseTo(state.targetYaw, 6);
    expect(state.pitch).toBeCloseTo(state.targetPitch, 6);
  });

  it('produces the same one-second motion at 30, 60, and 120 fps', () => {
    const results = [30,60,120].map(fps => {
      const state = createLookState();
      dragLook(state, -250, 100, SENSITIVITY);
      for (let i=0; i<fps; i++) updateLook(state, 1/fps, false);
      return state;
    });
    for (const state of results.slice(1)) {
      expect(state.yaw).toBeCloseTo(results[0].yaw, 12);
      expect(state.pitch).toBeCloseTo(results[0].pitch, 12);
    }
  });

  it('eases back to center and replaces stale look targets during presentation', () => {
    const state = createLookState();
    dragLook(state, -300, 150, SENSITIVITY);
    updateLook(state, 1, false);
    const previousYaw = state.yaw;
    updateLook(state, 1/60, true);
    expect(state.targetYaw).toBe(0);
    expect(state.targetPitch).toBe(0);
    expect(state.yaw).toBeGreaterThan(0);
    expect(state.yaw).toBeLessThan(previousYaw);
    for (let i=0; i<90; i++) updateLook(state, 1/60, true);
    expect(Math.abs(state.yaw)).toBeLessThan(.0001);
    expect(Math.abs(state.pitch)).toBeLessThan(.0001);
  });

  it('does not move with a zero or negative frame delta', () => {
    const state = createLookState();
    dragLook(state, -200, 200, SENSITIVITY);
    updateLook(state, 0, false);
    updateLook(state, -1, false);
    expect(state.yaw).toBe(0);
    expect(state.pitch).toBe(0);
  });

  it('automatically recenters for every deal, reveal, shooting, and ending phase', () => {
    const phases: GamePhase[] = ['DEALING','REVEAL','AI_SHOOTING','PLAYER_SHOOTING','GAME_OVER'];
    for (const phase of phases) expect(shouldRecenter(phase, false)).toBe(true);
  });

  it('allows looking around while idle or deciding, but always locks suspense', () => {
    const phases: GamePhase[] = ['START','PLAYER_DECISION','ROUND_RESULT'];
    for (const phase of phases) {
      expect(shouldRecenter(phase, false)).toBe(false);
      expect(shouldRecenter(phase, true)).toBe(true);
    }
  });
});
