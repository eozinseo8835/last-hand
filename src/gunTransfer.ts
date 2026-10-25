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
export function gunTransferProgress(transfer: GunTransfer, now = Date.now()): number {
  return Math.max(0, Math.min(1, (now - transfer.startedAt) / transfer.duration));
}
