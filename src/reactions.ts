import type { GamePhase } from './game';
import type { RoomNumber } from './campaign';
export const REACTION_KINDS=['loss','survive','glare','relief','player-click'] as const;
export type ReactionKind=typeof REACTION_KINDS[number];
export type Reaction={id:number;kind:ReactionKind;room:RoomNumber;startedAt:number;duration:number};
export type ReactionSound='thud'|'slap'|'tap'|'laugh'|'sob'|'exhale';
export function reactionPose(reaction:Reaction|null|undefined,now:number,safety:{phase:GamePhase;suspense:boolean;dead:boolean;holding:boolean}){
 const age=reaction?(now-reaction.startedAt)/1000:-1;
 const active=!!reaction&&age>=0&&age<reaction.duration/1000&&!safety.dead&&!safety.holding&&!safety.suspense&&!['AI_SHOOTING','PLAYER_SHOOTING','HOST_FORCE_SHOT','OPENING','TRANSITION','ENDING_DEATH','ENDING_WIN','GAME_OVER'].includes(safety.phase);
 const impact=reaction?.room===2?.95:.65;
 const ring=active&&age>=impact?Math.exp(-(age-impact)*14)*Math.sin((age-impact)*40):0;
 return {active,age,impact,ring,kind:reaction?.kind,room:reaction?.room,
  sound:(reaction?.kind==='loss'?reaction.room===1?'thud':reaction.room===2?'slap':'tap':reaction?.kind==='survive'?reaction.room===1?'sob':'laugh':'exhale') as ReactionSound,
  gaze:active?(reaction?.kind==='loss'||reaction?.kind==='glare'?'player':reaction?.kind==='relief'?'table':null):null};
}
