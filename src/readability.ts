export const TEXT_SPEEDS = { Slow: 22, Normal: 30, Fast: 42 } as const;
export type TextSpeed = keyof typeof TEXT_SPEEDS;
export const readingHold = (text: string) => 1500 + Array.from(text).length * 60;
export const STATUS_HOLD_MS = 2500;
export const openingWords = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}']+/gu)?.slice(0, 2).join(' ') ?? text;
/** Reserved lines include queued speech, so a burst of events cannot repeat it. */
export class DialogueMemory {
  private used = new Set<string>();
  private opening = '';
  available(text:string){return !!text&&!this.used.has(text)&&openingWords(text)!==this.opening;}
  reserve(text: string): boolean {
    if (!text || this.used.has(text) || openingWords(text) === this.opening) return false;
    this.used.add(text); this.opening = openingWords(text); return true;
  }
  choose(lines: readonly string[], random: () => number): string | null {
    const pool = lines.filter(text => !this.used.has(text) && openingWords(text) !== this.opening);
    if (!pool.length) return null; // Silence is preferable to recycled or invented dialogue.
    const text = pool[Math.min(pool.length - 1, Math.floor(Math.max(0, random()) * pool.length))];
    this.reserve(text); return text;
  }
  reset() { this.used.clear(); this.opening = ''; }
}
