import type {TextSpeed} from './readability';
import type { DialogueCategory } from './dialogue';
import type { RoomNumber, Speaker } from './campaign';
import type { RandomSource } from './game';
import { cosmeticRandom } from './tension';

export type HostCategory = 'intro_rules' | 'deal' | 'round_result' | 'other_room_death' |
  'waiting_for_trigger' | 'transition' | 'ending_win' | 'ending_death' | 'cut_ties' | 'host_caught_player' | 'trigger_warning' | 'forced_shot';
export type SpeechLine = {
  textSpeed?:TextSpeed;
  addressedTo?: Speaker | 'player';
  id: number; speaker: Speaker; text: string; category: DialogueCategory | HostCategory;
  danger: boolean; chambersFired: number;
};
export type DialogueExchange = { captive: string; host: string };

/** The Host has no opinion about a hand: these lines describe procedure only. */
export const HOST_DIALOGUE: Record<HostCategory, readonly string[]> = {
  "host_caught_player": [
    "Unauthorized.",
    "Hands back.",
    "A penalty is due.",
    "The violation is recorded."
  ],
  "trigger_warning": [
    "Ten seconds.",
    "Last chance to do it yourself.",
    "Five seconds.",
    "Complete the pull."
  ],
  "forced_shot": [
    "Your time has elapsed.",
    "Procedure complete.",
    "Assistance recorded.",
    "Your turn is concluded."
  ],
  "intro_rules": [
    "Eight guests. Four tables.",
    "Closest to twenty-one wins.",
    "The loser pulls the trigger.",
    "One SPIN. PEEK is unauthorized."
  ],
  "deal": [
    "Cards.",
    "Check your cards.",
    "Hands clear.",
    "Your decision."
  ],
  "round_result": [
    "Result recorded.",
    "The hand is concluded.",
    "The odds have changed.",
    "Proceed as assigned."
  ],
  "other_room_death": [
    "One guest has left us.",
    "The count is updated.",
    "Another table is concluded.",
    "One fewer guest."
  ],
  "waiting_for_trigger": [
    "The audience is waiting.",
    "Complete your turn.",
    "Maintain pressure.",
    "The assigned guest must proceed."
  ],
  "transition": [
    "Your next table is ready.",
    "Remain seated.",
    "Do not resist.",
    "Secure the hood."
  ],
  "ending_win": [
    "Selection complete.",
    "The exit has been made available.",
    "One guest remains.",
    "See you next season."
  ],
  "cut_ties": [
    "Wrists still.",
    "Release the restraints.",
    "Keep clear of the cutter.",
    "Hands on the table."
  ],
  "ending_death": [
    "Participation ended.",
    "Reassign this table.",
    "This guest is inactive.",
    "The schedule is unchanged."
  ]
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
  "1": {
    "intro": [
      "Where... where'd they bring us?",
      "Hey. You awake? Please be awake.",
      "My phone. They took my damn phone.",
      "Someone's got to know we're missing. Right?"
    ],
    "confident": [
      "Okay. Okay, these'll do.",
      "Maybe... maybe I get through this one.",
      "Don't ask me to show you yet. Please.",
      "Look, I've got a {upcard}. That's... that's something."
    ],
    "nervous": [
      "Sorry. My hands won't stop.",
      "Wait, I... I forgot what I was counting.",
      "Please don't stare. I can't think.",
      "God, the cards keep sticking to me."
    ],
    "bluff": [
      "You should fold. Seriously. Please.",
      "I've got enough. I do. Stop looking.",
      "Go on, then. I'm... I'm fine.",
      "Don't make me turn these over. You'll regret it."
    ],
    "player_folds": [
      "Thank you. Oh, thank you.",
      "Wait... neither of us? We just go again?",
      "Please save one for later. Please.",
      "Only {folds} folds left. Oh, God."
    ],
    "player_goes": [
      "Hang on. Let me count again.",
      "Do it slow. I... I need a second.",
      "All right. Turn them over, then.",
      "Maybe I read mine wrong. Can I check?"
    ],
    "ai_survives_click": [
      "Ha... hah. Sorry. I can't stop.",
      "Oh, God. Oh, God, I'm still here.",
      "That... that wasn't it. It wasn't it.",
      "{pulls} empty now. I can't keep doing this."
    ],
    "player_survives_click": [
      "Jesus... you made me jump.",
      "Hey. Hey, you're okay. Say something.",
      "Don't... don't point it anywhere yet.",
      "That's {pulls} empty. We're still here. Somehow."
    ],
    "danger": [
      "Please. I don't want to die here.",
      "Someone call my mum. She won't know.",
      "No, stop. I keep losing count.",
      "{pulls} gone. There can't be many left. Can there?"
    ],
    "ai_loses_hand": [
      "No, no. I counted. I counted!",
      "Wait! That's not... let me look again.",
      "Please don't make me pick that up.",
      "You got {playerTotal}? No. No, I can't do this."
    ],
    "player_hits": [
      "Why? Why would you want another?",
      "Please... just stop when it's enough.",
      "Careful. I can't watch you do that.",
      "Shit. That card scared me."
    ],
    "player_stands": [
      "Already? You're... you're sure?",
      "Okay. Now I have to look.",
      "Wait. I wasn't ready for you to stop.",
      "I've only got this {upcard} showing. Don't look at me."
    ],
    "player_busts": [
      "I'm sorry. I... I'm so sorry.",
      "Don't look at me. Please don't.",
      "God. I wanted to win, but... not like this.",
      "That last one... you shouldn't have taken it."
    ],
    "ai_hits": [
      "Small one. Please, a small one.",
      "I need another. I think I do.",
      "Just... just slide it over.",
      "Come on. Don't do this to me."
    ],
    "ai_busts": [
      "No! I knew I should've stopped.",
      "Please tell me I added it wrong.",
      "Wait, that ace... can't it be one?",
      "Why'd I ask? Why the hell did I ask?"
    ],
    "push": [
      "A tie? So we don't... right?",
      "Oh. Oh, thank God.",
      "Nobody touches it. Leave it there.",
      "Can we do that again? Just... again?"
    ],
    "impatient": [
      "Please. I can't keep watching.",
      "Do it before I... no. Sorry.",
      "God, I'm scared to blink.",
      "Whatever happens... I'm sorry."
    ],
    "opp_spins": [
      "I need it somewhere else. Please.",
      "Maybe... maybe this helps.",
      "Don't count. Please don't count with me.",
      "There. I used it. That's it, then."
    ],
    "opp_peeks": [
      "Just a corner. No one... just a corner.",
      "I can't guess again. I can't.",
      "Please don't look at my hand.",
      "One second. That's all I need."
    ],
    "player_spins": [
      "I hate that sound. God, I hate it.",
      "Did it help? You think it helped?",
      "Stop... sorry. Keep going, I guess.",
      "Now I've lost count. Maybe that's good."
    ],
    "player_peeks": [
      "Did you see it? Don't tell me.",
      "Hey, your hand's shaking too.",
      "Careful. He'll see you.",
      "Please put it back. Please."
    ],
    "opp_caught_player": [
      "Hey! No, I saw your hand.",
      "Stop! You're going to get us both...",
      "Host! They touched the deck!",
      "Don't cheat. Please, it's all I've got."
    ],
    "caught_by_player": [
      "Sorry! Sorry, I'm putting it back.",
      "Please don't tell him. I panicked.",
      "Look, my hands are here. See?",
      "You saw me. Okay. Okay, I'm done."
    ],
    "glance_away": [
      "Was that someone outside?",
      "Sorry... I can't look at it anymore.",
      "That screen. It... it went dark.",
      "Maybe someone's coming. Maybe..."
    ],
    "distant_shot": [
      "Oh, God. Was that next door?",
      "Someone was screaming. Now they're...",
      "Please don't tell me who.",
      "That... that was real. That was a person."
    ],
    "short": [
      "Please, not yet.",
      "God, help me.",
      "Can't do it.",
      "Someone, please stop."
    ],
    "broken": [
      "...no. Please...",
      "[A breath catches]",
      "Mum... I'm sorry.",
      "[A quiet sob]"
    ],
    "player_loses_hand": [
      "Oh... oh, it's not me. I'm sorry.",
      "Please don't hate me. I didn't...",
      "Can't look. Sorry, I can't look.",
      "You had {playerTotal}. I thought... never mind."
    ]
  },
  "2": {
    "intro": [
      "Hey. You came from the other room?",
      "Christ, I need a cigarette.",
      "Don't ask me how I got here.",
      "My tie's... can you see if it's crooked?"
    ],
    "confident": [
      "All right. I can work with this.",
      "Don't rush me. I know what I'm doing.",
      "Yeah. These'll do. They'll have to.",
      "That {upcard} isn't all I've got."
    ],
    "nervous": [
      "Damn. My jaw won't unclench.",
      "Wait... let me check that again.",
      "Could use a drink. A real one.",
      "Sorry. That light's getting to me."
    ],
    "bluff": [
      "Take another. Go on. See what happens.",
      "Yeah, I'd stand if I were you.",
      "Don't smile at me. I've got this.",
      "You're staring awful hard for someone who's winning."
    ],
    "player_folds": [
      "Fine. More time. I'll take it.",
      "Didn't think you'd fold that one.",
      "Good. Neither of us was ready.",
      "Down to {folds} folds. Don't waste them."
    ],
    "player_goes": [
      "Show me, then. Just show me.",
      "All right. No more talking.",
      "Let's get it over with.",
      "Wait. Let me put mine straight."
    ],
    "ai_survives_click": [
      "Ha. Hah... shit. Sorry.",
      "Jesus. I really thought... never mind.",
      "Still here. That's enough. That's enough.",
      "{pulls} empty. Don't tell me what that leaves."
    ],
    "player_survives_click": [
      "Shit... keep your finger still.",
      "Easy. Put it down slow.",
      "You flinched. So did I.",
      "{pulls} now. I heard every one."
    ],
    "danger": [
      "I can't keep pretending I'm fine.",
      "Look at my hand. It's shaking now.",
      "No. Don't tell me the odds.",
      "{pulls} used. Yeah, I can count. I wish I couldn't."
    ],
    "ai_loses_hand": [
      "Damn... no. That's not right.",
      "Wait. Let me... give me a second.",
      "Don't look so pleased. Please.",
      "{playerTotal}? And I stood. I bloody stood."
    ],
    "player_hits": [
      "Another? You sure about that?",
      "Go ahead. I won't stop you.",
      "Careful. You're doing what I did.",
      "Yeah. Keep your hand steady."
    ],
    "player_stands": [
      "That's it? Fine. My turn.",
      "All right... let me look.",
      "Don't say anything. I'm counting.",
      "This {upcard}... I thought it'd be enough."
    ],
    "player_busts": [
      "Shit. Sorry. I didn't want...",
      "Don't look at me like that.",
      "Yeah, I saw. Put the cards down.",
      "That's too many. I'm sorry."
    ],
    "ai_hits": [
      "One more. Slow, please.",
      "Can't stay on this. Can't.",
      "Come on. Something small.",
      "Yeah. Deal it. Before I change my mind."
    ],
    "ai_busts": [
      "Damn it. Damn it!",
      "Why didn't I stop? I knew better.",
      "No. Check it again.",
      "There goes my... no. Never mind."
    ],
    "push": [
      "Even? Okay. Nobody moves.",
      "Fine. I'll take another minute.",
      "Don't touch it. We tied.",
      "Hah... neither of us. Right?"
    ],
    "impatient": [
      "Look, I can't watch this all night.",
      "Please. Just... decide.",
      "God, the waiting's worse.",
      "Do what you have to. I'm sorry."
    ],
    "opp_spins": [
      "Not leaving it there. No.",
      "One turn. Then I've got nothing.",
      "Don't count the clicks out loud.",
      "Come on... be somewhere else."
    ],
    "opp_peeks": [
      "Just checking. Don't make a thing of it.",
      "I need to know. That's all.",
      "Give me a second. Look away.",
      "Can't afford another guess."
    ],
    "player_spins": [
      "Yeah. I'd have done that too.",
      "Careful with it. Christ.",
      "Now neither of us knows. Great.",
      "Don't grin. It's still loaded."
    ],
    "player_peeks": [
      "Keep your face still. He'll notice.",
      "Saw something? Don't say it.",
      "Easy. Hand back, slow.",
      "Now you've got to live with knowing."
    ],
    "opp_caught_player": [
      "Hey. I know that move.",
      "Hand back. I saw you.",
      "Host. Look at their fingers.",
      "Don't try that with me. Please."
    ],
    "caught_by_player": [
      "All right. Fair enough. You saw.",
      "Old habit. Bad habit, I know.",
      "Look, I'm putting it down.",
      "Please. Don't make this worse."
    ],
    "glance_away": [
      "Something knocked. You heard it?",
      "Sorry. Need to look away a second.",
      "That screen's... never mind.",
      "Door's still shut. Of course it is."
    ],
    "distant_shot": [
      "Jesus. That was close.",
      "Don't tell me whose table.",
      "I... I used to ignore noises like that.",
      "Someone's chair just... yeah."
    ],
    "short": [
      "Easy. Stay steady.",
      "Not yet, please.",
      "Give me time.",
      "Can't watch this."
    ],
    "broken": [
      "...I screwed up...",
      "[A laugh breaks]",
      "Didn't mean to...",
      "[A shaking breath]"
    ],
    "player_loses_hand": [
      "Okay... it's you. God, I'm sorry.",
      "Can't look at you right now.",
      "Don't thank me. I didn't help.",
      "{playerTotal}. You were close. Too damn close."
    ]
  },
  "3": {
    "intro": [
      "Sit slow. The chair catches.",
      "You made it. I... didn't think you would.",
      "Don't ask him why. I did.",
      "Sorry. I was hoping no one would come."
    ],
    "confident": [
      "Enough. I think it's enough.",
      "Take your time. I'll wait.",
      "Don't watch me. Watch your cards.",
      "A {upcard}. Seen worse. Seen better, too."
    ],
    "nervous": [
      "Something's different. Can't place it.",
      "Wait... that noise again.",
      "Sorry. Thought I was past this.",
      "My hand's doing it again. See?"
    ],
    "bluff": [
      "Can't tell from my face. Don't try.",
      "Go on. See if you're right.",
      "You looked away first.",
      "Think what you like. I'm staying."
    ],
    "player_folds": [
      "Good. Another minute.",
      "Keep one. You'll want it.",
      "Don't apologize. I'd do it too.",
      "{folds} left. Remember that."
    ],
    "player_goes": [
      "Slowly. Put them down slowly.",
      "All right. Let's see.",
      "Don't look at him. Look here.",
      "Wait. I need to see yours."
    ],
    "ai_survives_click": [
      "Hah... sorry. Didn't expect that.",
      "Again. I'm... still here.",
      "Give me a second. Just one.",
      "{pulls} empty. I know. I know."
    ],
    "player_survives_click": [
      "Easy... breathe first.",
      "Put it down. You're shaking.",
      "Sorry. I jumped too.",
      "{pulls}. Don't count the next one yet."
    ],
    "danger": [
      "They said I wouldn't do this again.",
      "Don't... don't look away.",
      "Thought I'd stopped being scared.",
      "{pulls} gone. Same as before. God."
    ],
    "ai_loses_hand": [
      "Need a second. That's all.",
      "Don't say you're sorry.",
      "Look after yourself. Please.",
      "You got {playerTotal}. I should've... no."
    ],
    "player_hits": [
      "Careful. You don't have to rush.",
      "Another? All right.",
      "Don't ask me. I don't know.",
      "That's how I reached last time."
    ],
    "player_stands": [
      "Fine. Leave them there.",
      "Don't change your mind now.",
      "Okay... let me see mine.",
      "This {upcard} won't help by itself."
    ],
    "player_busts": [
      "I'm sorry. Look at me. I'm sorry.",
      "Don't argue with him. Please.",
      "Put them down. Slow.",
      "Wish I hadn't seen that."
    ],
    "ai_hits": [
      "Another. Please.",
      "Can't stop on this.",
      "Small one. Just this once.",
      "Go on. I'll look."
    ],
    "ai_busts": [
      "...damn.",
      "No. Not again.",
      "Should've known. Should've stopped.",
      "Wait... I remember doing this."
    ],
    "push": [
      "Neither of us. Good.",
      "Leave it. We don't need it.",
      "Take a breath. I will too.",
      "Another hand. Okay."
    ],
    "impatient": [
      "Easy. He's watching.",
      "Can't hold it forever.",
      "I'm sorry you're doing this.",
      "Don't think about the sound."
    ],
    "opp_spins": [
      "Didn't use it last time. Should have.",
      "There. Done.",
      "Can't trust where it was.",
      "One change. That's all I get."
    ],
    "opp_peeks": [
      "I need to see. Sorry.",
      "Just the edge.",
      "Don't look at me yet.",
      "Can't do this blind again."
    ],
    "player_spins": [
      "Good. Now put it flat.",
      "Don't grip it so hard.",
      "Heard that. We're starting over.",
      "Maybe it helps. Maybe."
    ],
    "player_peeks": [
      "Hand back. Slow.",
      "Don't show it on your face.",
      "Saw it? Remember it.",
      "Careful. That's how he caught me."
    ],
    "opp_caught_player": [
      "Stop. I can see your hand.",
      "Put it back. Please.",
      "Host's watching. Don't.",
      "Not worth it. Hand back."
    ],
    "caught_by_player": [
      "Yes. You saw. I'm stopping.",
      "Sorry. Couldn't help it.",
      "Look. Hands back.",
      "Don't say anything else. Please."
    ],
    "glance_away": [
      "That door... still shut.",
      "Sorry. Need a second.",
      "Heard someone walking.",
      "Screen's gone. Don't look."
    ],
    "distant_shot": [
      "Someone else. God.",
      "Don't ask who.",
      "I knew that voice. I think.",
      "Wait... listen. Nothing now."
    ],
    "short": [
      "Stay with me.",
      "Easy. Hands down.",
      "Not this again.",
      "Please, look here."
    ],
    "broken": [
      "They promised me this was the last season.",
      "...can't. Not again.",
      "[Breathing falters]",
      "Please... I believed them."
    ],
    "player_loses_hand": [
      "Sorry. I can't watch this part.",
      "Take your time. I'll look down.",
      "Don't look at me. Please.",
      "{playerTotal}. Close doesn't... sorry."
    ]
  }
};

export const NERVOUS_BEGGING = ["Please. I've got to get home.", "No, wait... I can't. I can't.", "Someone tell him to stop. Please.", "Let me call my mum first. Please."] as const;
export const EXCHANGES:Record<RoomNumber,readonly DialogueExchange[]> = {
  "1": [
    {
      "captive": "Please, can't you just let us go?",
      "host": "Remain seated."
    },
    {
      "captive": "My mum... can I call her?",
      "host": "No calls."
    },
    {
      "captive": "Does anyone know we're here?",
      "host": "Your turn continues."
    },
    {
      "captive": "Why'd you take my shoes?",
      "host": "Personal items are withheld."
    },
    {
      "captive": "Can we just stop for a minute?",
      "host": "The schedule stands."
    },
    {
      "captive": "What if I can't lift it?",
      "host": "Assistance is available."
    }
  ],
  "2": [
    {
      "captive": "Look, how much would it take?",
      "host": "Payment is closed."
    },
    {
      "captive": "Who the hell's watching this?",
      "host": "The audience."
    },
    {
      "captive": "Can I at least have a drink?",
      "host": "No refreshments."
    },
    {
      "captive": "You do this every night?",
      "host": "Attend to your table."
    },
    {
      "captive": "Will you tell my brother?",
      "host": "No messages."
    },
    {
      "captive": "Could you stop staring at me?",
      "host": "Observation continues."
    }
  ],
  "3": [
    {
      "captive": "You said I was done, didn't you?",
      "host": "Your assignment remains."
    },
    {
      "captive": "Do they remember me?",
      "host": "Audience records are sealed."
    },
    {
      "captive": "That chair... is it the same one?",
      "host": "Equipment is retained."
    },
    {
      "captive": "Was there really daylight last time?",
      "host": "Follow the exit route."
    },
    {
      "captive": "Why's the hood back?",
      "host": "Transfer procedure."
    },
    {
      "captive": "Do you even know my name?",
      "host": "Identification is sufficient."
    }
  ]
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
