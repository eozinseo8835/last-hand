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
  yawVelocity: number;
  pitchVelocity: number;
};

export type LookKeys = { left: boolean; right: boolean; up: boolean; down: boolean };

export function createLookKeys(): LookKeys {
  return { left: false, right: false, up: false, down: false };
}

export function createLookState(): LookState {
  return { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0, yawVelocity: 0, pitchVelocity: 0 };
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/** Positive screen X turns the camera right; positive screen Y looks down. */
export function dragLook(state: LookState, dx: number, dy: number, sensitivity: number): void {
  state.targetYaw = clamp(state.targetYaw - dx * sensitivity, LOOK_LIMITS.yaw);
  state.targetPitch = clamp(state.targetPitch - dy * sensitivity, LOOK_LIMITS.pitch);
}

/** Keyboard movement only changes head rotation; it never changes camera position.
 * Integrating the exponential velocity curve keeps holds/releases consistent at any fps.
 */
export function updateKeyboardLook(state: LookState, keys: LookKeys, delta: number, speed: number, locked: boolean): void {
  if (locked) {
    state.yawVelocity = 0;
    state.pitchVelocity = 0;
    return;
  }
  const dt = Math.max(0, delta);
  if (dt === 0) return;
  const acceleration = 10;
  const decay = Math.exp(-acceleration * dt);
  const desiredYaw = (Number(keys.left) - Number(keys.right)) * Math.max(0, speed);
  const desiredPitch = (Number(keys.up) - Number(keys.down)) * Math.max(0, speed);
  const yawStep = desiredYaw * dt + (state.yawVelocity - desiredYaw) * (1 - decay) / acceleration;
  const pitchStep = desiredPitch * dt + (state.pitchVelocity - desiredPitch) * (1 - decay) / acceleration;
  state.yawVelocity = desiredYaw + (state.yawVelocity - desiredYaw) * decay;
  state.pitchVelocity = desiredPitch + (state.pitchVelocity - desiredPitch) * decay;
  state.targetYaw = clamp(state.targetYaw + yawStep, LOOK_LIMITS.yaw);
  state.targetPitch = clamp(state.targetPitch + pitchStep, LOOK_LIMITS.pitch);
  if (Math.abs(state.targetYaw) === LOOK_LIMITS.yaw && Math.sign(state.yawVelocity) === Math.sign(state.targetYaw)) state.yawVelocity = 0;
  if (Math.abs(state.targetPitch) === LOOK_LIMITS.pitch && Math.sign(state.pitchVelocity) === Math.sign(state.targetPitch)) state.pitchVelocity = 0;
}

/** Exponential damping has the same response at 30, 60, or 120 frames per second. */
export function updateLook(state: LookState, delta: number, recenter: boolean): void {
  if (recenter) {
    state.targetYaw = 0;
    state.targetPitch = 0;
    state.yawVelocity = 0;
    state.pitchVelocity = 0;
  }
  const amount = 1 - Math.exp(-8 * Math.max(0, delta));
  state.yaw = clamp(state.yaw + (state.targetYaw - state.yaw) * amount, LOOK_LIMITS.yaw);
  state.pitch = clamp(state.pitch + (state.targetPitch - state.pitch) * amount, LOOK_LIMITS.pitch);
}

/** Presentation phases keep the deal, reveal, and trigger pull in the player's view. */
export function shouldRecenter(phase: GamePhase, suspense: boolean): boolean {
  return suspense || phase === 'SHUFFLING' || phase === 'DEALING' || phase === 'PEEKING' ||
    phase === 'HITTING' || phase === 'REVEAL' || phase === 'DEALER_TURN' ||
    phase === 'SWEEPING' || phase === 'AI_SHOOTING' || phase === 'PLAYER_SHOOTING' || phase === 'GAME_OVER';
}
