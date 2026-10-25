// @vitest-environment jsdom
import {StrictMode,act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {DialogueMemory,openingWords,readingHold,STATUS_HOLD_MS,TEXT_SPEEDS} from './readability';
import {useStatusQueue} from './useStatusQueue';
import {createVoicePlan} from './voice';
import {HOST,OPPONENTS} from './campaign';
import {OPPONENT_DIALOGUE} from './campaignDialogue';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
afterEach(()=>{vi.useRealTimers();});
describe('readable subtitle and message clocks',()=>{
 it('uses 28–32 letters/second for every Normal voice, with synchronized seeded syllables at every setting',()=>{
  for(const profile of [HOST.voice,...Object.values(OPPONENTS).map(o=>o.voice)]){
   const text='a'.repeat(90),plan=createVoicePlan(text,'nervous',false,0,profile);
   const cps=89*1000/(plan.steps[89].at-plan.steps[0].at);expect(cps).toBeGreaterThanOrEqual(28);expect(cps).toBeLessThanOrEqual(32);
   for(const speed of Object.keys(TEXT_SPEEDS) as Array<keyof typeof TEXT_SPEEDS>){const score=createVoicePlan(text,'confident',false,0,profile,speed);expect(score).toEqual(createVoicePlan(text,'bluff',false,0,profile,speed));expect(score.steps.filter(s=>s.syllable).map(s=>s.count)).toEqual(plan.steps.filter(s=>s.syllable).map(s=>s.count));}
   expect(createVoicePlan(text,'confident',false,0,profile,'Slow').duration).toBeGreaterThan(createVoicePlan(text,'confident',false,0,profile,'Fast').duration);
  }
  expect(readingHold('hello')).toBe(1800);
 });
 it('reserves an entire match without repeating lines or opening words and becomes silent on exhaustion',()=>{
  const memory=new DialogueMemory(),seen=new Set<string>();let last='';
  const lines=Object.values(OPPONENT_DIALOGUE[1]).flat();
  for(let i=0;i<lines.length;i++){const text=memory.choose(lines,()=>.5);expect(text).toBeTruthy();expect(seen.has(text!)).toBe(false);expect(openingWords(text!)).not.toBe(last);seen.add(text!);last=openingWords(text!);}
  expect(memory.choose(lines,()=>0)).toBeNull();memory.reset();expect(memory.choose(lines,()=>0)).toBeTruthy();
 });
 it('queues status/result messages for 2.5 seconds each under StrictMode without pausing input',()=>{
  vi.useFakeTimers();const container=document.createElement('div'),root=createRoot(container);let clicks=0;
  function Harness({message,reset=false}:{message:string;reset?:boolean}){const visible=useStatusQueue(message,reset);return <><output>{visible}</output><button onClick={()=>clicks++}>play</button></>;}
  const render=(message:string,reset=false)=>act(()=>root.render(<StrictMode><Harness message={message} reset={reset}/></StrictMode>));
  try{render('You win the hand');act(()=>vi.advanceTimersByTime(1000));render('BUST');render('Click. An empty chamber.');act(()=>container.querySelector('button')!.click());expect(clicks).toBe(1);
   act(()=>vi.advanceTimersByTime(1499));expect(container.textContent).toContain('You win the hand');act(()=>vi.advanceTimersByTime(1));expect(container.querySelector('output')!.textContent).toBe('BUST');act(()=>vi.advanceTimersByTime(STATUS_HOLD_MS));expect(container.querySelector('output')!.textContent).toBe('Click. An empty chamber.');render('',true);expect(container.querySelector('output')!.textContent).toBe('');
  }finally{act(()=>root.unmount());}
 });
});
