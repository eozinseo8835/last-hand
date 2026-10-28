import type { Side } from './tension';

/** Presentation only: this never advances or randomizes a chamber. */
export type GunTransfer = {
  stage: 'to-shooter' | 'return';
  side: Side;
  owner?: Side|'host';
  startedAt: number;
  duration: number;
};
export const GUN_SLIDE_MS = 1500;
export const GUN_SET_DOWN_MS = 200;
/** SPIN is a hand motion: raise the revolver, swipe the cylinder with the other hand, lower it again. */
export const SPIN_MS = 1400;
/** The swipe lands (and the ratchet sounds) this long after SPIN starts. */
export const SPIN_SWIPE_MS = 600;
export function gunTransferProgress(transfer: GunTransfer, now = Date.now()): number {
  return Math.max(0, Math.min(1, (now - transfer.startedAt) / transfer.duration));
}
