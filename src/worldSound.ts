export type WorldPosition=readonly[number,number,number];
export type WorldSound={id:string;at:number;position:WorldPosition;loudness:number;source:string};
export function soundReaction(sound:WorldSound|null|undefined,now:number,host=false){if(!sound)return 0;const age=(now-sound.at)/1000,attack=host?.45:.18,hold=host?1.2:1;return age<0||age>hold+.4?0:age<attack?age/attack:age<hold?1:1-(age-hold)/.4;}
