/**
 * Story mode text for the secret broadcast: LAST HAND is a paid, live death game in its sixth season.
 * The guests answered a gold invitation to a private casino night and woke up hooded in Sublevel 06.
 */
export const SEASON = 6;
/** The flashback before the room (12 s, three cards of 4 / 4 / 4 s). */
export const FLASHBACK = [
  'Three weeks ago, an invitation arrived. Gold ink. No return address.',
  'A private table. Free drinks. Everyone was so kind.',
  'Then the lights went out.',
] as const;
/** Captions over the 3D security-camera film; the last line is prefixed with the player's name. */
export const FILM = ['Sublevel 06. Eight guests. Four tables.', 'Every table is on camera.', 'Seat six. You are live.'] as const;
/** The survivor's ending: the Host's mask is offered for next season. */
export const MASK_MS = 8500;
export const MASK_LINE = 'The audience has voted. Put it on.';
export const MASK_CAPTIONS = (name: string) => [`Congratulations, ${name}.`, `Season ${SEASON + 1} needs a new Host.`] as const;
/** The death ending: the stream settles its bets over the dead feed. */
export const PAYOUT_MS = 4500;
export const PAYOUT_CAPTION = 'Seat six is available.';
/** A stable, plausible audience size for this run's broadcast (no randomness in render). */
export function viewerCount(seed: number) { return 41000 + Math.abs(Math.round(Math.sin(seed * 12.9898) * 43758.5453)) % 17000; }
