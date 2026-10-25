/** Metre-scale table, cards and gun share these dimensions in every room. */
export const TABLE_HEIGHT = .750;
export const TABLE_HALF_WIDTH = .780;
export const TABLE_HALF_DEPTH = .650;
export const SEAT_HEIGHT = .450;
export const CARD_WIDTH = .100;
export const CARD_HEIGHT = .140;
export const TABLE_CARD_Y = .760;
export const DECK_POSITION = [-.61, .778, -.06] as const;
/** Bring the whole pack within the seated player's reach before a corner lift. */
export function playerPeekDeck(progress: number): { slide: number; position: [number, number, number] } {
  const smooth = (x: number) => { const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t); };
  const slide=Math.min(smooth(progress/.20),1-smooth((progress-.80)/.20));
  return {slide,position:[DECK_POSITION[0]+(.20-DECK_POSITION[0])*slide,DECK_POSITION[1],DECK_POSITION[2]+(.54-DECK_POSITION[2])*slide]};
}
export const GUN_REST = [0, .780, 0] as const;
export const GUN_PICKUP = {
  ai: [.48, .780, -.50] as const,
  player: [.48, .780, .50] as const,
};
/** The weapon slides alongside, never through, a complete laid-out hand. */
export const GUN_FLAT_ROTATION = [-Math.PI / 2, 0, 0] as const;
export function tableCardPosition(owner: 'player' | 'ai', index: number, count: number): [number, number, number] {
  const perRow = 6, row = Math.floor(index / perRow), rowCount = Math.min(perRow, count - row * perRow);
  return [(index % perRow - (rowCount - 1) / 2) * .115, TABLE_CARD_Y + index * .00005,
    owner === 'ai' ? -.27 - row * .17 : .27 + row * .17];
}
export type TableBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export function cardBounds(owner: 'player' | 'ai', index: number, count: number): TableBounds {
  const [x,,z] = tableCardPosition(owner, index, count);
  return { minX: x - CARD_WIDTH / 2, maxX: x + CARD_WIDTH / 2, minZ: z - CARD_HEIGHT / 2, maxZ: z + CARD_HEIGHT / 2 };
}
/** Bounds include the curved grip and sights after the flat table rotation. */
export function gunBoundsAt(position: readonly [number, number, number]): TableBounds {
  return { minX: position[0] - .123, maxX: position[0] + .152, minZ: position[2] - .083, maxZ: position[2] + .112 };
}
export const GUN_BOUNDS = gunBoundsAt(GUN_REST);
export function boundsOverlap(a: TableBounds, b: TableBounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}
