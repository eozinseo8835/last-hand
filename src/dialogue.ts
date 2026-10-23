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
  player_hits: [
    'You keep asking the deck to forgive you.',
    'Every card makes the table feel smaller.',
    'One more reason to doubt your hands.',
    'Borrow another number; the debt stays yours.',
  ],
  player_stands: [
    'Then we can stop pretending there is room.',
    'You have chosen where to stop breathing.',
    'Let us see what your restraint is worth.',
    'Now my cards get their turn to speak.',
  ],
  player_busts: [
    'You asked for one card too many.',
    'Even luck has a number it will not cross.',
    'The deck heard you clearly that time.',
    'You were safer before you reached for more.',
  ],
  ai_hits: [
    'I suppose I owe the table another card.',
    'Not enough to sit still yet.',
    'There are rules even I must follow.',
    'Let us see what the deck has kept for me.',
  ],
  ai_busts: [
    'That was more than I intended.',
    'The numbers can be cruel to either chair.',
    'I appear to have run out of arithmetic.',
    'So much for knowing when to stop.',
  ],
  push: [
    'For a moment, neither of us owes the chamber.',
    'The table has postponed its answer.',
    'Two equal hands still leave one bullet.',
    'Enjoy the silence while it belongs to us both.',
  ],
  impatient: [
    'The cylinder will not wait with you.',
    'Your hand has been hovering long enough.',
    'There is no safer way to hold it.',
    'The room can hear you putting this off.',
  ],
  opp_spins: [
    'Let the chamber forget where we were.',
    'I would prefer a different kind of silence.',
    'One turn, and the room must guess again.',
    'There is still one thing I can move.',
  ],
  opp_peeks: [
    'I need to see what waits beneath that edge.',
    'The deck has not earned my trust.',
    'One quiet look before I commit.',
    'I would rather know what I am refusing.',
  ],
  player_spins: [
    'You can move the bullet, but it stays here.',
    'A fresh beginning in the same small circle.',
    'Remember that sound. You only get it once.',
    'The cylinder forgets; I do not.',
  ],
  player_peeks: [
    'One look. The deck will remember it.',
    'You have bought knowledge, not another chance.',
    'Careful with that corner; paper keeps secrets.',
    'Now you must decide what knowing is worth.',
  ],
  short: [
    'Keep it still.',
    'Not another sound.',
    'Your hands. Now.',
    'Let it pass.',
    'Enough of this.',
  ],
  broken: [
    '...',
    '…',
    '[A shallow breath]',
    '[Breathing, unsteady]',
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
  _chamber: number,
  random: RandomSource = Math.random,
): DialogueCategory {
  if (aiTotal >= CONFIG.CONFIDENT_THRESHOLD) return 'confident';
  return random() < CONFIG.BLUFF_CHANCE ? 'bluff' : 'nervous';
}
