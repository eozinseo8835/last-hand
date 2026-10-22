import type { GamePhase } from '../game';

/** Head rotation only: the seated camera never translates in response to input. */
export const LOOK_LIMITS = {
  yaw: Math.PI * 100 / 180,
  pitch: Math.PI * 35 / 180,
} as const;

export type LookState = {
  yaw: number;
  pitch: number;
  targetYaw: number;
  targetPitch: number;
};

export function createLookState(): LookState {
  return { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 };
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/** Positive screen X turns the camera right; positive screen Y looks down. */
export function dragLook(state: LookState, dx: number, dy: number, sensitivity: number): void {
  state.targetYaw = clamp(state.targetYaw - dx * sensitivity, LOOK_LIMITS.yaw);
  state.targetPitch = clamp(state.targetPitch - dy * sensitivity, LOOK_LIMITS.pitch);
}

/** Exponential damping has the same response at 30, 60, or 120 frames per second. */
export function updateLook(state: LookState, delta: number, recenter: boolean): void {
  if (recenter) {
    state.targetYaw = 0;
    state.targetPitch = 0;
  }
  const amount = 1 - Math.exp(-8 * Math.max(0, delta));
  state.yaw = clamp(state.yaw + (state.targetYaw - state.yaw) * amount, LOOK_LIMITS.yaw);
  state.pitch = clamp(state.pitch + (state.targetPitch - state.pitch) * amount, LOOK_LIMITS.pitch);
}

/** Presentation phases keep the deal, reveal, and trigger pull in the player's view. */
export function shouldRecenter(phase: GamePhase, suspense: boolean): boolean {
  return suspense || phase === 'DEALING' || phase === 'REVEAL' ||
    phase === 'AI_SHOOTING' || phase === 'PLAYER_SHOOTING' || phase === 'GAME_OVER';
}
