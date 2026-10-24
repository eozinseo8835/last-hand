export const CARD_WIDTH = .32;
export const CARD_HEIGHT = .42;
export const TABLE_CARD_Y = .900;
export const DECK_POSITION = [-1.34, .923, -.25] as const;
export const GUN_REST = [1.35, .962, -.65] as const;
export function tableCardPosition(owner: 'player' | 'ai', index: number, count: number): [number, number, number] {
  const perRow = 6, row = Math.floor(index / perRow), rowCount = Math.min(perRow, count - row * perRow);
  return [(index % perRow - (rowCount - 1) / 2) * .355, TABLE_CARD_Y + index * .0002,
    owner === 'ai' ? -.44 - row * .47 : .50 - row * .47];
}
export type TableBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export function cardBounds(owner: 'player' | 'ai', index: number, count: number): TableBounds {
  const [x,,z] = tableCardPosition(owner, index, count);
  return { minX: x - CARD_WIDTH / 2, maxX: x + CARD_WIDTH / 2, minZ: z - CARD_HEIGHT / 2, maxZ: z + CARD_HEIGHT / 2 };
}
export const GUN_BOUNDS: TableBounds = { minX: 1.14, maxX: 1.68, minZ: -.78, maxZ: -.51 };
export function boundsOverlap(a: TableBounds, b: TableBounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}
