import type { DialogueCategory } from './dialogue';
import type { RoomNumber, Speaker } from './campaign';
import type { RandomSource } from './game';
import { cosmeticRandom } from './tension';

export type HostCategory = 'intro_rules' | 'deal' | 'round_result' | 'other_room_death' |
  'waiting_for_trigger' | 'transition' | 'ending_win' | 'ending_death' | 'cut_ties' | 'host_caught_player' | 'trigger_warning' | 'forced_shot';
export type SpeechLine = {
  addressedTo?: Speaker | 'player';
  id: number; speaker: Speaker; text: string; category: DialogueCategory | HostCategory;
  danger: boolean; chambersFired: number;
};
export type DialogueExchange = { captive: string; host: string };

/** The Host has no opinion about a hand: these lines describe procedure only. */
export const HOST_DIALOGUE: Record<HostCategory, readonly string[]> = {
  host_caught_player: ["Unauthorized contact has been observed.", "Return your hand. A penalty will follow.", "The audience has an unobstructed view.", "An attempted violation has been recorded."],
  trigger_warning: ["Ten seconds.", "Last chance to do it yourself.", "Five seconds remain in your allocation.", "The allotted time is nearly complete."],
  forced_shot: ["Your time has elapsed.", "The required action has now been completed.", "Assistance has been entered in your record.", "Future hesitation will receive the same assistance."],
  intro_rules: [
    'Eight guests have been assigned to four tables.',
    'The guest closest to twenty-one wins the hand.',
    'The losing guest will operate the shared revolver.',
    'One SPIN is allocated per room. A PEEK is unauthorized.',
  ],
  deal: [
    'The next hand will now be dealt.',
    'Both guests will receive their opening cards.',
    'The dealing sequence is in progress.',
    'Keep your hands clear while cards are distributed.',
  ],
  round_result: [
    'The hand is concluded. Its result is final.',
    'The totals have been recorded.',
    'The table has completed this hand.',
    'The next procedure follows the recorded result.',
  ],
  other_room_death: [
    'A guest at another table has been eliminated.',
    'The number of active guests has been updated.',
    'Another table has concluded its match.',
    'One fewer guest remains in the selection.',
  ],
  waiting_for_trigger: [
    'The assigned guest will complete the pull.',
    'Keep pressure on the trigger until the procedure concludes.',
    'The table is waiting for the required action.',
    'No substitution is permitted. Complete your turn.',
  ],
  transition: [
    'Your next table is prepared.',
    'Remain seated until the hood is secured.',
    'Do not resist the transfer.',
    'The next match will begin in another room.',
  ],
  ending_win: [
    'Your participation in this selection is complete.',
    'The exit has been made available.',
    'You are the final active guest.',
    'See you next season.',
  ],
  cut_ties: [
    'Keep your wrists still. The restraints will be removed.',
    'Both guests will now be released from their restraints.',
    'Do not move until the cutter is clear.',
    'Your hands are required for the next procedure.',
  ],
  ending_death: [
    'Your participation has ended.',
    'This table will be reassigned.',
    'This guest is no longer active.',
    'The remaining schedule is unchanged.',
  ],
};

export const OPENING_LINES = [
  'Eight guests. Four tables. One door.',
  'You will play blackjack. The hand closest to twenty-one wins. Going over loses.',
  'Choose HIT, STAND, or FOLD. Three folds are permitted in each room.',
  'Each table shares one revolver with one bullet. The loser of each hand pulls the trigger.',
  'Each guest may SPIN once per room. A PEEK will receive a penalty if observed.',
  'The last guest standing will be permitted to leave.',
] as const;
export const SHORT_INTRO = 'Your seat is ready. The procedure is unchanged.';
export const ROOM_ARRIVAL: Record<RoomNumber, string> = {
  1: 'All guests are present. Play will begin.',
  2: 'Four guests remain. Take your assigned seat.',
  3: 'Smile. They paid to see this.',
};
export const FINAL_HOST_LINE = 'See you next season.';

type CaptiveBanks = Record<DialogueCategory, readonly string[]>;
export const OPPONENT_DIALOGUE: Record<RoomNumber, CaptiveBanks> = {
  1: {
    intro: [
      'Where is this? I had a phone.',
      'Please tell me you know a way out.',
      'They took my shoes. Why take my shoes?',
      'I was supposed to be home before dark.',
    ],
    confident: [
      'Maybe I can do this. Maybe this one.',
      'I think I am all right. For once.',
      'These might be enough. Please let them be enough.',
      'You should stop. I think you should stop.',
    ],
    nervous: [
      'I cannot make my hands stay dry.',
      'I used to know these numbers.',
      'Please stop looking at me like that.',
      'The paper keeps sliding in my fingers.',
    ],
    bluff: [
      'You do not want me to turn these over.',
      'I have something good. I mean it.',
      'You could fold. You really could.',
      'I am not the one who should be scared.',
    ],
    player_folds: [
      'Thank you. I was not ready.',
      'That is another moment we both get.',
      'Please keep doing that. Please.',
      'I thought I was about to lose you.',
    ],
    player_goes: [
      'Wait. I need to look again.',
      'Do we really have to see them?',
      'All right. Just do it slowly.',
      'I cannot tell if I want to know.',
    ],
    ai_survives_click: [
      'It did not. It did not.',
      'I thought that was everything.',
      'My ears are still waiting for it.',
      'I can breathe. I can still breathe.',
    ],
    player_survives_click: [
      'You are still here. Thank God.',
      'I could not make myself look away.',
      'Please say something. Anything.',
      'I felt that in my own teeth.',
    ],
    danger: [
      'There cannot be much room left in it.',
      'My mother does not know where I am.',
      'I keep counting and getting the same answer.',
      'Please, I do not want to be next.',
    ],
    ai_loses_hand: [
      'No. I was trying so hard.',
      'Please ask him if I can wait.',
      'I do not think I can lift it.',
      'There must be something else I can do.',
    ],
    player_hits: [
      'Why would you ask for more?',
      'Please do not make this worse.',
      'I wish I could tell you to stop.',
      'I hate the sound that card makes.',
    ],
    player_stands: [
      'You have decided? Already?',
      'Then I have to find out.',
      'I was hoping you would take longer.',
      'All right. I will try not to shake.',
    ],
    player_busts: [
      'I am sorry. I needed that.',
      'That does not feel like winning.',
      'Please do not look at me.',
      'I did not want it to be you either.',
    ],
    ai_hits: [
      'Please, one that does not hurt.',
      'I cannot stay where I am.',
      'I think I need another. I think.',
      'Just let the next one be small.',
    ],
    ai_busts: [
      'I should have stopped. I knew it.',
      'No, that is not what I meant to do.',
      'I cannot count with you watching.',
      'Please say I added it wrong.',
    ],
    push: [
      'Neither of us has to. Right?',
      'We get to sit here a little longer.',
      'I never thought I would love a tie.',
      'Could we just keep doing that?',
    ],
    impatient: [
      'Please. I cannot keep watching this.',
      'I am scared it will happen while I blink.',
      'Do not make me wait for the sound.',
      'I wish I could hold your hand instead.',
    ],
    opp_spins: [
      'Maybe it will not remember me now.',
      'I need it somewhere else. Anywhere else.',
      'Please let that have helped.',
      'I cannot face the same place again.',
    ],
    opp_peeks: [
      'I have to know before I touch it.',
      'Just a corner. I can manage a corner.',
      'Please do not be something terrible.',
      'I cannot take another blind guess.',
    ],
    player_spins: [
      'That sound makes my stomach turn.',
      'Do you feel safer? Please say yes.',
      'I tried not to count the clicks.',
      'I hope it went far away from both of us.',
    ],
    player_peeks: [
      'Did you see something you can live with?',
      'I wish I could read your face.',
      'Knowing does not make your hands steadier.',
      'Please do not tell me what comes after.',
    ],
    opp_caught_player: ["No! Stop touching it. I was watching.", "Your fingers. I can see your fingers.", "Please do not make this worse by cheating.", "Host, their hand went under the card."],
    caught_by_player: ["Please. I did not get a proper look.", "I am putting it down. Do not shout.", "You caught me. I just panicked.", "I know. I know. My hands are back here."],
    glance_away: ["Was that a boot outside?", "I cannot watch this table for another second.", "That screen went dark. Did you see?", "If I look at the door, maybe it opens."],
    distant_shot: [
      'Was that the room next to us?',
      'I heard someone fall. I heard it.',
      'Please do not tell me who that was.',
      'There was a person breathing over there.',
    ],
    short: ['Please, not me.', 'Someone stop this.', 'I cannot breathe.', 'My hands will not.'],
    broken: ['...please...', '[A thin, panicked breath]', '[Muffled sobbing]', '...no...'],
  },
  2: {
    intro: [
      'They moved me before I could collect my chips.',
      'You made it through one. So did I.',
      'Never liked a room without a clock.',
      'Let us see whether surviving taught you anything.',
    ],
    confident: [
      'I have sat behind worse felt than this.',
      'My hands know when a table is friendly.',
      'That is the look I used to get paid for.',
      'I can afford to let you decide.',
    ],
    nervous: [
      'This knot gets tighter every time I breathe.',
      'Funny how quiet a bad room can get.',
      'I would usually order a drink about now.',
      'There is a mark on that card I do not like.',
    ],
    bluff: [
      'I would hate to waste a hand like this.',
      'Go on. Give me something worth collecting.',
      'You can read my face if it helps you lose.',
      'I have been waiting all night for these.',
    ],
    player_folds: [
      'An expensive habit, caution.',
      'You saved your chair. I keep the momentum.',
      'I have seen fortunes spent on another minute.',
      'That was almost a sensible wager.',
    ],
    player_goes: [
      'There it is. The moment a face becomes a number.',
      'Let us see what all that staring bought.',
      'I will show mine if you can stomach yours.',
      'No more stories for this hand.',
    ],
    ai_survives_click: [
      'Still in the game. That is enough.',
      'A house edge I can live with.',
      'I was not planning to tip for that.',
      'You will have to beat me again.',
    ],
    player_survives_click: [
      'Try not to spend that breath too quickly.',
      'You wear relief badly. Everyone can see it.',
      'I suppose we both get another hand.',
      'That was a generous little nothing.',
    ],
    danger: [
      'I have stopped liking the shape of these odds.',
      'My fingers used to do this for applause.',
      'No drink would settle that sound now.',
      'There is a point where a wager becomes a debt.',
    ],
    ai_loses_hand: [
      'I have swallowed worse losses. I think.',
      'Give me a second to straighten this tie.',
      'That is an ugly way to close a hand.',
      'I would offer double, if anyone here took credit.',
    ],
    player_hits: [
      'There is the appetite. I knew you had it.',
      'Keep reaching. The table likes an eager hand.',
      'You remind me of my first bad decision.',
      'I can almost hear the arithmetic turning sour.',
    ],
    player_stands: [
      'Found the edge you can tolerate?',
      'Then I had better earn my seat.',
      'You leave the worrying to me. How thoughtful.',
      'I wondered how long you would keep reaching.',
    ],
    player_busts: [
      'I know that feeling. I prefer it in your chair.',
      'A little appetite is an expensive thing.',
      'You should have left that last card lonely.',
      'I would be sorry if I could afford it.',
    ],
    ai_hits: [
      'I did not come this far to sit on that.',
      'Let it ride a little further.',
      'There is still room to make this interesting.',
      'I can feel another card in my fingers.',
    ],
    ai_busts: [
      'That was a dreadful read.',
      'I used to charge people for advice like that.',
      'The table finally called me on it.',
      'I should have kept my hands in my pockets.',
    ],
    push: [
      'A wash. I can work with a wash.',
      'Neither of us gets to feel clever.',
      'I have walked away happy with less.',
      'The table owes us another argument.',
    ],
    impatient: [
      'I can smell the waiting from over here.',
      'You are making the silence expensive.',
      'I would rather hear it than keep imagining it.',
      'My nerve is not part of your wager.',
    ],
    opp_spins: [
      'I have one last way to change the conversation.',
      'Never leave a bad arrangement untouched.',
      'I will take a fresh uncertainty.',
      'There. Now neither of us gets to count comfortably.',
    ],
    opp_peeks: [
      'I never turn down a little information.',
      'Let me see what kind of invitation that is.',
      'I have lost enough on blind faith.',
      'One small advantage. I intend to enjoy it.',
    ],
    player_spins: [
      'So you do know how to change a bad bet.',
      'I heard every one of those teeth.',
      'You look almost pleased with uncertainty.',
      'Careful. A fresh start still has an ending.',
    ],
    player_peeks: [
      'Now try not to let your eyebrows spend it.',
      'That is a familiar little appetite for certainty.',
      'I used to pay good money for that look.',
      'You have information. Let us see if you have nerve.',
    ],
    opp_caught_player: ["Nice reach. Shame about the audience.", "I know that move. Take your hand back.", "A little too bold with your fingers there.", "Dealer. Our friend is shopping ahead."],
    caught_by_player: ["You have a better eye than I gave you.", "Fine. No advantage taken.", "Caught clean. I will give you that.", "Old habit. Forget the card; watch my hands."],
    glance_away: ["That monitor has awful timing.", "Give me a second. Something knocked.", "I am checking the exit. Professional curiosity.", "Let the cameras have my good side."],
    distant_shot: [
      'That sounded expensive for somebody.',
      'Another chair the house can put away.',
      'I thought I had learned to ignore that sound.',
      'That wall is thinner than I would like.',
    ],
    short: ['Let it ride.', 'Hold that smile.', 'Not my chair.', 'Another bad bet.'],
    broken: ['...I misread it...', '[A smile without air]', 'That was not...', '[An uneven breath]'],
  },
  3: {
    intro: [
      'This room is darker than it used to be.',
      'You have learned to follow the footsteps.',
      'Do not waste your strength asking him why.',
      'I hoped the next chair would stay empty.',
    ],
    confident: [
      'I have had a long time to learn this feeling.',
      'My hands remember when to stop.',
      'You can take your time. I have done mine.',
      'Some silences are easier to sit inside.',
    ],
    nervous: [
      'He is standing closer than I remember.',
      'They changed the light, but not the smell.',
      'That card has a crease I remember.',
      'I thought I had stopped noticing that sound.',
    ],
    bluff: [
      'I have watched this hand end from your chair.',
      'You will not like what I have kept.',
      'There is nothing in my face you can use.',
      'I knew what I was waiting for before you sat down.',
    ],
    player_folds: [
      'Time can be a kind of shelter.',
      'I used to save mine for later too.',
      'You are learning what a minute costs.',
      'The chair is easier to keep than to leave.',
    ],
    player_goes: [
      'I know this part by the scrape of the paper.',
      'Look at the cards. It helps, sometimes.',
      'I cannot make the answer kinder.',
      'We both deserve to know where we are.',
    ],
    ai_survives_click: [
      'Again. It has let me hear it again.',
      'I had forgotten how heavy an empty sound can be.',
      'Do not ask me how many times that has happened.',
      'I am beginning to resent that small mercy.',
    ],
    player_survives_click: [
      'Breathe before you try to speak.',
      'You will remember that sound outside this room.',
      'For now, you still belong to yourself.',
      'I used to look at my hands afterward too.',
    ],
    danger: [
      'I did not think the counting could frighten me again.',
      'He said I would not have to sit here anymore.',
      'There is an old promise getting louder in my head.',
      'I remember what comes after this silence.',
    ],
    ai_loses_hand: [
      'I was certain I had paid for this already.',
      'Do not let him tell you this feels ordinary.',
      'I need a moment I thought I would never need again.',
      'My hands know the weight. That is the worst part.',
    ],
    player_hits: [
      'You still believe the next one will be different.',
      'I recognize that reach.',
      'There is courage in that. There is something else too.',
      'I wish wanting less had come to me sooner.',
    ],
    player_stands: [
      'You have found a place you can bear to stop.',
      'Then let me carry the uncertainty a while.',
      'I would have stopped there once.',
      'I know how difficult it is to leave a card alone.',
    ],
    player_busts: [
      'I am sorry. I know what the chair will feel like.',
      'I would rather not have recognized that ending.',
      'Do not waste your last quiet moment hating the paper.',
      'I have seen that little mistake take a great deal.',
    ],
    ai_hits: [
      'I do not trust myself to stay here.',
      'There is a familiar pull in the next card.',
      'I know the feeling. I have to move past it.',
      'Let me see whether memory is worth anything.',
    ],
    ai_busts: [
      'So memory has finally failed me.',
      'I thought recognizing the room would help.',
      'I have made that mistake before. I know I have.',
      'There is no comfort in knowing the shape of it.',
    ],
    push: [
      'A small postponement. I remember those.',
      'For a moment, we can both stay people.',
      'I wish an answer could remain unfinished.',
      'Take the breath. Do not ask what it means.',
    ],
    impatient: [
      'The waiting follows you longer than the sound.',
      'I cannot listen to another breath held that way.',
      'I know what you are trying to put off.',
      'Please do not make me remember it slowly.',
    ],
    opp_spins: [
      'I learned not to leave the pattern where it was.',
      'Even a familiar circle can be moved.',
      'I have been saving this small refusal.',
      'I will not trust the old arrangement again.',
    ],
    opp_peeks: [
      'I will not close my eyes to that corner again.',
      'I remember what ignorance cost me.',
      'Let me look before memory decides for me.',
      'There are things I refuse to learn the hard way twice.',
    ],
    player_spins: [
      'You have refused the pattern. I understand.',
      'It still sounds the same after all this time.',
      'I hope not knowing is kinder to you.',
      'Watch your hands. Relief makes them careless.',
    ],
    player_peeks: [
      'You will remember that little glimpse for a long time.',
      'I cannot tell you whether knowing helps.',
      'I have seen people wish they had not looked.',
      'Keep what you saw to yourself. It is yours.',
    ],
    opp_caught_player: ["Bring your hand back slowly.", "I have watched that trick end badly.", "The deck is not yours to touch.", "Host. There has been a breach."],
    caught_by_player: ["I misjudged where you were looking.", "Seen. I will not use it.", "My hands are here now.", "That was a mistake. Let it remain one."],
    glance_away: ["The monitor changed again.", "I count the footsteps when they pass.", "I need to check that door.", "The Host is watching a different table."],
    distant_shot: [
      'They always wait for us to listen.',
      'I remember the sound through that wall.',
      'One less table. It never gets quieter.',
      'Do not count the echoes. Count the people.',
    ],
    short: ['Not another season.', 'They said finished.', 'I was released.', 'The season ended.'],
    broken: ['They promised me this was the last season.', '...I already left...', '[A breath that catches]', '...not again...'],
  },
};

export const NERVOUS_BEGGING = [
  'Please let me call my mother. She will be waiting.',
  'I will do anything else. Please ask for anything else.',
  'I have not even started my life yet.',
  'Please do not make me disappear in this room.',
] as const;

export const EXCHANGES: Record<RoomNumber, readonly DialogueExchange[]> = {
  1: [
    { captive: 'Can I call someone? Just once?', host: 'Communication is not part of the procedure.' },
    { captive: 'Does anybody know we are here?', host: 'Your presence has been recorded.' },
    { captive: 'Please, can you take this thing off my wrist?', host: 'Guest equipment remains in place until release.' },
    { captive: 'What if I cannot make my hand move?', host: 'Your assigned action remains unchanged.' },
    { captive: 'How long have you kept us down here?', host: 'Elapsed time does not affect the schedule.' },
    { captive: 'My mother will come looking. Will you tell her?', host: 'Outside inquiries are not handled at this table.' },
  ],
  2: [
    { captive: 'What is the house taking from this?', host: 'The terms of participation are not negotiable.' },
    { captive: 'Does a table like this ever come with a drink?', host: 'No additional service is scheduled.' },
    { captive: 'Do I get a receipt for what I lost in the other room?', host: 'All concluded matches remain on record.' },
    { captive: 'You ever sit down and try your own game?', host: 'My assignment does not include a guest seat.' },
    { captive: 'If I win, do you at least straighten my tie?', host: 'The exit procedure does not include that service.' },
    { captive: 'Who taught you to deal like a machine?', host: 'The dealing sequence is standardized.' },
  ],
  3: [
    { captive: 'Was the last room not supposed to be the last room?', host: 'Your current assignment is the final table.' },
    { captive: 'Do they remember people from the earlier seasons?', host: 'Audience records are not available to guests.' },
    { captive: 'How many times have you brought this chair back?', host: 'The equipment is maintained between selections.' },
    { captive: 'Was the daylight real the last time?', host: 'The exit remains at the end of the designated route.' },
    { captive: 'Why am I looking at that hood again?', host: 'Transfers follow the current schedule.' },
    { captive: 'Do you ever learn our names?', host: 'Your assigned identification is sufficient.' },
  ],
};

function select(lines: readonly string[], previous: string, random: RandomSource): string {
  const available = lines.filter(line => line !== previous);
  const pool = available.length ? available : lines;
  return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))];
}

export function chooseHostLine(category: HostCategory, previous = '', random: RandomSource = cosmeticRandom): string {
  return select(HOST_DIALOGUE[category], previous, random);
}

export function chooseOpponentLine(room: RoomNumber, category: DialogueCategory, previous = '', random: RandomSource = cosmeticRandom): string {
  return select(OPPONENT_DIALOGUE[room][category], previous, random);
}

export function chooseBeggingLine(previous = '', random: RandomSource = cosmeticRandom): string {
  return select(NERVOUS_BEGGING, previous, random);
}

export function shouldExchange(random: RandomSource = cosmeticRandom): boolean { return random() < .2; }

export function chooseExchange(room: RoomNumber, previous: DialogueExchange | null = null, random: RandomSource = cosmeticRandom): DialogueExchange {
  const alternatives = EXCHANGES[room].filter(pair => pair !== previous);
  const pool = alternatives.length ? alternatives : EXCHANGES[room];
  return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))];
}
