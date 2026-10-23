import { describe, expect, it } from 'vitest';
import { createLookState, createLookKeys, dragLook, LOOK_LIMITS, shouldRecenter, updateKeyboardLook, updateLook } from './camera';
import type { GamePhase } from '../game';

const SENSITIVITY = .0035;

describe('seated camera controls', () => {
  it('starts centered and creates independent reset state', () => {
    const first = createLookState();
    dragLook(first, 100, 100, SENSITIVITY);
    expect(createLookState()).toEqual({ yaw:0, pitch:0, targetYaw:0, targetPitch:0, yawVelocity:0, pitchVelocity:0 });
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
    const phases: GamePhase[] = ['SHUFFLING','DEALING','PEEKING','HITTING','REVEAL','DEALER_TURN','DEALER_PEEKING','SWEEPING','AI_SHOOTING','PLAYER_SHOOTING','GAME_OVER'];
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


describe('WASD head look', () => {
  const SPEED = 1.25;
  it('creates independent released-key state', () => {
    const keys = createLookKeys(); keys.left = true;
    expect(createLookKeys()).toEqual({ left:false, right:false, up:false, down:false });
  });

  it('smoothly accelerates left/up and right/down in the same directions as mouse look', () => {
    const leftUp = createLookState(), keys = createLookKeys(); keys.left = keys.up = true;
    updateKeyboardLook(leftUp, keys, 1/60, SPEED, false);
    expect(leftUp.yawVelocity).toBeGreaterThan(0);
    expect(leftUp.yawVelocity).toBeLessThan(SPEED);
    expect(leftUp.targetYaw).toBeGreaterThan(0);
    expect(leftUp.targetPitch).toBeGreaterThan(0);
    const rightDown = createLookState(); keys.left = keys.up = false; keys.right = keys.down = true;
    updateKeyboardLook(rightDown, keys, 1/60, SPEED, false);
    expect(rightDown.targetYaw).toBeCloseTo(-leftUp.targetYaw, 12);
    expect(rightDown.targetPitch).toBeCloseTo(-leftUp.targetPitch, 12);
    expect(leftUp.yaw).toBe(0);
    expect(leftUp.pitch).toBe(0);
  });

  it('releases smoothly, stops, and does not keep turning after velocity has decayed', () => {
    const state = createLookState(), keys = createLookKeys(); keys.left = true;
    for (let i=0; i<30; i++) updateKeyboardLook(state, keys, 1/60, SPEED, false);
    const heldVelocity = state.yawVelocity, beforeRelease = state.targetYaw;
    keys.left = false;
    updateKeyboardLook(state, keys, 1/60, SPEED, false);
    expect(state.yawVelocity).toBeGreaterThan(0);
    expect(state.yawVelocity).toBeLessThan(heldVelocity);
    expect(state.targetYaw).toBeGreaterThan(beforeRelease);
    for (let i=0; i<120; i++) updateKeyboardLook(state, keys, 1/60, SPEED, false);
    const stoppedAt = state.targetYaw;
    updateKeyboardLook(state, keys, 1, SPEED, false);
    expect(state.yawVelocity).toBeLessThan(.000001);
    expect(state.targetYaw).toBeCloseTo(stoppedAt, 8);
  });

  it('uses exactly the mouse yaw/pitch limits in both directions', () => {
    const state = createLookState(), keys = createLookKeys(); keys.left = keys.up = true;
    for (let i=0; i<600; i++) { updateKeyboardLook(state, keys, 1/60, SPEED, false); updateLook(state, 1/60, false); }
    expect(state.targetYaw).toBe(LOOK_LIMITS.yaw);
    expect(state.targetPitch).toBe(LOOK_LIMITS.pitch);
    keys.left = keys.up = false; keys.right = keys.down = true;
    for (let i=0; i<600; i++) { updateKeyboardLook(state, keys, 1/60, SPEED, false); updateLook(state, 1/60, false); }
    expect(state.targetYaw).toBe(-LOOK_LIMITS.yaw);
    expect(state.targetPitch).toBe(-LOOK_LIMITS.pitch);
    expect(state.yaw).toBeGreaterThanOrEqual(-LOOK_LIMITS.yaw);
    expect(state.pitch).toBeGreaterThanOrEqual(-LOOK_LIMITS.pitch);
  });

  it('ignores opposing keys and nonpositive frame deltas', () => {
    const state = createLookState(), keys = { left:true, right:true, up:true, down:true };
    updateKeyboardLook(state, keys, 1, SPEED, false);
    expect(state.targetYaw).toBe(0); expect(state.targetPitch).toBe(0);
    keys.right = keys.down = false;
    updateKeyboardLook(state, keys, 0, SPEED, false);
    updateKeyboardLook(state, keys, -1, SPEED, false);
    expect(state.targetYaw).toBe(0); expect(state.yawVelocity).toBe(0);
  });

  it('never fights automatic recentering, even when a key stays held', () => {
    const keys = createLookKeys(); keys.left = keys.up = true;
    for (const phase of ['SHUFFLING','DEALING','PEEKING','HITTING','REVEAL','DEALER_TURN','DEALER_PEEKING','SWEEPING','AI_SHOOTING','PLAYER_SHOOTING'] as GamePhase[]) {
      const state = createLookState();
      updateKeyboardLook(state, keys, .3, SPEED, false);
      const yaw = state.targetYaw, pitch = state.targetPitch;
      updateKeyboardLook(state, keys, .5, SPEED, shouldRecenter(phase, false));
      expect(state.targetYaw).toBe(yaw); expect(state.targetPitch).toBe(pitch);
      expect(state.yawVelocity).toBe(0); expect(state.pitchVelocity).toBe(0);
      updateLook(state, .5, true);
      expect(state.targetYaw).toBe(0); expect(state.targetPitch).toBe(0);
    }
  });

  it('integrates keyboard velocity consistently at 30, 60, and 120 fps', () => {
    const keys = createLookKeys(); keys.left = true;
    const states = [30, 60, 120].map(fps => {
      const state = createLookState();
      for (let i=0; i<fps; i++) updateKeyboardLook(state, keys, 1/fps, SPEED, false);
      return state;
    });
    for (const state of states.slice(1)) {
      expect(state.targetYaw).toBeCloseTo(states[0].targetYaw, 12);
      expect(state.yawVelocity).toBeCloseTo(states[0].yawVelocity, 12);
    }
  });
});
