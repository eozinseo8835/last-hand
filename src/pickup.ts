/** One presentation timeline shared by every shooter. No card/chamber logic. */
export const PICKUP_MS=1500;
export const PICKUP_PHASES=['look','lean','reach','grip','lift','return'] as const;
export function smooth(a:number,b:number,t:number){const p=Math.max(0,Math.min(1,(t-a)/(b-a)));return p*p*(3-2*p);}
export function pickupPose(progress:number){const p=Math.max(0,Math.min(1,progress));return{phase:PICKUP_PHASES[p<.12?0:p<.28?1:p<.50?2:p<.66?3:p<.82?4:5],reach:smooth(.25,.5,p),contact:p>=.5,grip:smooth(.50,.66,p),lift:smooth(.66,1,p),lean:smooth(.12,.38,p)*(1-smooth(.78,1,p))};}
