export type CinematicMode = 'full' | 'short' | 'arrival' | 'transfer';
export const OPENING_STAGES = ['hooded', 'door-open', 'guard-approach', 'player-unhood', 'player-focus', 'opponent-unhood', 'guard-exit', 'rules', 'cut-opponent', 'cut-player', 'rub-wrists', 'complete'] as const;
export const TRANSFER_STAGES = ['guards-enter', 'transfer-hood', 'lift', 'dragging', 'door'] as const;
export type CinematicStage = typeof OPENING_STAGES[number] | typeof TRANSFER_STAGES[number];
export type CinematicState = { stage: CinematicStage; startedAt: number; mode: CinematicMode };
const DURATIONS: Record<CinematicStage, number> = {
  hooded: 700, 'door-open': 850, 'guard-approach': 3000, 'player-unhood': 850,
  'player-focus': 1500, 'opponent-unhood': 4500, 'guard-exit': 3500, rules: 0,
  'cut-opponent': 1500, 'cut-player': 3500, 'rub-wrists': 650, complete: 0,
  'guards-enter': 1500, 'transfer-hood': 850, lift: 650, dragging: 1600, door: 700,
};
export const stageDurationMs = (stage: CinematicStage) => DURATIONS[stage];
export function cinematicProgress(state: CinematicState | null | undefined, now = Date.now()): number {
  if (!state) return 1;
  const duration = stageDurationMs(state.stage);
  return duration === 0 ? 1 : Math.max(0, Math.min(1, (now - state.startedAt) / duration));
}
export function hoodCoverage(state: CinematicState | null | undefined, now = Date.now()): number {
  if (!state) return 0;
  const progress = cinematicProgress(state, now);
  if (['hooded', 'door-open', 'guard-approach', 'lift', 'dragging', 'door'].includes(state.stage)) return 1;
  if (state.stage === 'player-unhood') return 1 - progress;
  if (state.stage === 'transfer-hood') return progress;
  return 0;
}
export function focusRecovery(state: CinematicState | null | undefined, now = Date.now()): number {
  if (!state) return 1;
  if (state.stage === 'player-focus') return cinematicProgress(state, now);
  return hoodCoverage(state, now) > 0 || state.stage === 'player-unhood' ? 0 : 1;
}
export function tiesForStage(state: CinematicState | null | undefined): { player: boolean; ai: boolean } {
  if (!state || state.stage === 'complete' || state.stage === 'rub-wrists') return { player: true, ai: true };
  return { player: false, ai: state.stage === 'cut-player' };
}
export const hoodAllowsLook = (state: CinematicState | null | undefined) => !!state && ['hooded', 'door-open', 'guard-approach'].includes(state.stage);
