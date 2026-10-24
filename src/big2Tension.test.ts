import { describe, expect, it } from 'vitest';
import { attentionAt, canOpponentPeek, planAttention } from './attention';
import { approachStress, bodyLanguage, smoothNoise, stressTarget } from './bodyLanguage';
import { createTensionRandom, heartbeatSettings } from './tension';
import { simulateStandRounds } from './bustSimulation';

describe('readable public attention', () => {
  it('gives most rounds a full one-second overlap with a 400ms returning-head warning', () => {
    const random = createTensionRandom(421);
    for(let round=0;round<1000;round++) {
      const plan = planAttention(1000, random);
      const start = Math.max(plan.host[0].start,plan.captive[0].start), end = Math.min(plan.host[0].end,plan.captive[0].end);
      expect(end-start).toBeGreaterThan(1600);
      expect(attentionAt(plan,start+100).window).toBe(true);
      expect(attentionAt(plan,end-200).window).toBe(true);
      expect(attentionAt(plan,end-200).host.returning || attentionAt(plan,end-200).captive.returning).toBe(true);
      expect(attentionAt(plan,end+1).window).toBe(false);
    }
  });
  it('requires both faces to be away for player PEEK and Host away plus off-center for captive PEEK', () => {
    const plan = { host:[{start:100,end:3100,direction:1}], captive:[{start:1000,end:4000,direction:-1}] };
    expect(attentionAt(plan,500).window).toBe(false);
    expect(attentionAt(plan,1500).window).toBe(true);
    expect(canOpponentPeek(attentionAt(plan,1500),true)).toBe(false);
    expect(canOpponentPeek(attentionAt(plan,1500),false)).toBe(true);
    expect(canOpponentPeek(attentionAt(plan,3500),false)).toBe(false);
    expect(attentionAt(null,1500,{event:{kind:'door',startedAt:1000,duration:3000,seed:2}}).window).toBe(true);
  });
});
describe('public stress and captive-only personalities', () => {
  const facts = {chambersFired:3,nextShooter:false,lossStreak:2,loudness:.5,clickRelief:0};
  it('uses no card inputs and grows smoothly with public pressure while relief lowers it', () => {
    for (const room of [1,2,3] as const) {
      const target = stressTarget(room,facts);
      expect(stressTarget(room,{...facts,nextShooter:true})).toBeGreaterThan(target);
      expect(stressTarget(room,{...facts,clickRelief:1})).toBeLessThan(target);
      const progressed = approachStress(.1,target,.1);
      expect(progressed).toBeGreaterThan(.1); expect(progressed).toBeLessThan(target);
    }
  });
  it('respects individual bounce thresholds and sudden chamber-four/five cracks', () => {
    expect(bodyLanguage(1,.5,.05,1,'PLAYER_DECISION').bounce).toBeGreaterThan(0);
    expect(bodyLanguage(2,.5,.05,3,'PLAYER_DECISION').bounce).toBe(0);
    expect(bodyLanguage(3,.8,.05,4,'PLAYER_DECISION').bounce).toBe(0);
    expect(bodyLanguage(2,.5,1,4,'PLAYER_DECISION').tremor).toBeGreaterThan(bodyLanguage(2,.5,1,3,'PLAYER_DECISION').tremor+.007);
    expect(bodyLanguage(3,.5,1,5,'PLAYER_DECISION').cracked).toBe(true);
    expect(bodyLanguage(3,.5,1,4,'PLAYER_DECISION').cracked).toBe(false);
    for (const phase of ['AI_SHOOTING','PLAYER_SHOOTING','HOST_FORCE_SHOT'] as const) {
      const b = bodyLanguage(1,1,3,5,phase); expect(b.fidget).toBeNull(); expect(b.bounce).toBe(0); expect(b.shift).toBe(0);
    }
  });
  it('has continuous seeded noise without a visible 30-second repeated cycle', () => {
    for(let t=0;t<35;t+=.1) expect(Math.abs(smoothNoise(t,21)-smoothNoise(t+.001,21))).toBeLessThan(.01);
    expect(Array.from({length:300},(_,i)=>smoothNoise(i*.1,21))).not.toEqual(Array.from({length:300},(_,i)=>smoothNoise(30+i*.1,21)));
    expect(heartbeatSettings(2,false,1).bpm).toBeGreaterThan(heartbeatSettings(2,false,0).bpm);
  });
});
describe('ten-thousand fresh-deck stand rounds per captive', () => {
  it.each([1,2,3] as const)('allows room %s to bust at a normal policy rate under observation', room => {
    const result = simulateStandRounds(room);
    console.info('Stand simulation',result);
    expect(result.rounds).toBe(10000); expect(result.bustRate).toBeGreaterThan(.19); expect(result.bustRate).toBeLessThan(.31);
  });
});

it('keeps the Gambler controlled before chamber four, then permits face-wiping fidgets',()=>{
 const before=Array.from({length:100},(_,i)=>bodyLanguage(2,.65,i*.7,3,'PLAYER_DECISION').fidget);
 const after=Array.from({length:100},(_,i)=>bodyLanguage(2,.65,i*.7,4,'PLAYER_DECISION').fidget);
 expect(before).not.toContain('sweat'); expect(after).toContain('sweat');
});
