import { CONFIG, type RandomSource } from './game';

/** The opponent speaks only these authored lines; no network or AI is used. */
export const DIALOGUE = {
  intro: [
    'There is still time to leave.',
    'Pull up a chair; the room is patient.',
    'Six chambers, and only one way out.',
    'Let us see what your luck is worth.',
  ],
  confident: [
    'I would keep those hands very still.',
    'These cards have already made their choice.',
    'You can fold, but you cannot hide.',
    'I rather like my chances.',
    'Your silence tells me enough.',
  ],
  nervous: [
    'The light is getting on my nerves.',
    'Perhaps we should take our time.',
    'You are staring a little too closely.',
    'I have seen worse hands.',
    'Cards are only paper, after all.',
  ],
  bluff: [
    'You really should have walked away.',
    'I can hear your confidence slipping.',
    'Go on; I have nothing to fear.',
    'This will be a very short hand.',
    'My cards are the least of your problems.',
  ],
  player_folds: [
    'A little more time, bought with fear.',
    'You cannot do that forever.',
    'Keep saving yourself for later.',
    'Even an empty hand can tremble.',
    'We both know the chair has no exit.',
  ],
  player_goes: [
    'Then let us turn the last card.',
    'Now we find out who was pretending.',
    'There is no taking that back.',
    'Watch closely; this part matters.',
    'A brave word is still just a word.',
  ],
  ai_survives_click: [
    'It seems the room still wants me here.',
    'That was almost a conversation ender.',
    'Another breath I did not pay for.',
    'Listen carefully; the next one is closer.',
    'I shall try to enjoy the extra time.',
  ],
  player_survives_click: [
    'You remembered how to breathe.',
    'Do not mistake silence for mercy.',
    'A little louder inside your head now.',
    'You look surprised to still be here.',
    'The cylinder remembers, even if you forget.',
  ],
  danger: [
    'There is very little silence left.',
    'The empty chambers are behind us now.',
    'Neither of us has much room to bluff.',
    'Even the light is holding its breath.',
    'We are running out of harmless sounds.',
  ],
  ai_loses_hand: [
    'So the table turns.',
    'Give me a moment with the silence.',
    'It is only a matter of mechanics.',
    'I knew this hand would come.',
    'Keep your eyes on me.',
  ],
} as const;

export type DialogueCategory = keyof typeof DIALOGUE;

/** Excluding the last line before selecting prevents consecutive repeats. */
export function chooseDialogue(
  category: DialogueCategory,
  previous = '',
  random: RandomSource = Math.random,
): string {
  const lines: readonly string[] = DIALOGUE[category] ?? DIALOGUE.intro;
  const available = lines.filter(line => line !== previous);
  const index = Math.min(available.length - 1, Math.max(0, Math.floor(random() * available.length)));
  return available[index] ?? DIALOGUE.intro[0];
}

export function roundDialogueCategory(
  aiTotal: number,
  chamber: number,
  random: RandomSource = Math.random,
): DialogueCategory {
  if (chamber >= CONFIG.DANGER_CHAMBER) return 'danger';
  if (aiTotal >= CONFIG.CONFIDENT_THRESHOLD) return 'confident';
  return random() < CONFIG.BLUFF_CHANCE ? 'bluff' : 'nervous';
}
