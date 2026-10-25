// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import * as T from 'three';
import {createActors,type ActorState} from './actors';
import {reactionPose,type Reaction} from '../reactions';
import {GUN_REST} from '../tableLayout';
let scene:T.Scene,camera:T.PerspectiveCamera,actors:ReturnType<typeof createActors>,now:number;
const base:ActorState={phase:'ROUND_RESULT',suspense:false,dead:null,shotEffect:null,roundNumber:1,revealed:true};
const reaction=(room:1|2|3,kind:Reaction['kind']='loss'):Reaction=>({id:room,kind,room,startedAt:100000,duration:1500});
function frame(age:number,patch:Partial<ActorState>={}){now=100000+age*1000;actors.update(2+age,.03,{...base,...patch});scene.updateMatrixWorld(true);}
beforeEach(()=>{now=100000;vi.spyOn(Date,'now').mockImplementation(()=>now);vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({fillRect(){},strokeRect(){},fillText(){},save(){},restore(){},translate(){},rotate(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}} as unknown as CanvasRenderingContext2D);scene=new T.Scene();camera=new T.PerspectiveCamera(68,16/9,.055,28);camera.position.set(0,1.2,1.05);scene.add(camera);actors=createActors(scene,camera);actors.setCards({player:[{id:'p',rank:'9',suit:'hearts'}],ai:[{id:'a',rank:'8',suit:'clubs'}],deck:[]},true);frame(0);frame(1);});
afterEach(()=>{const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();scene.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());vi.restoreAllMocks();});
describe('additive captive reactions',()=>{
 it.each([1,2,3] as const)('uses the room %i impact, fixed bones and an exact rest after the reaction',room=>{
  const r=reaction(room);frame(0,{reaction:r,roomNumber:room});const cards=actors.cardSlots.filter(s=>s.active).map(s=>s.group.position.clone()),rest=actors.gun.getWorldPosition(new T.Vector3());
  frame(room===2?.99:.69,{reaction:r,roomNumber:room});const event=actors.captive.userData.reactionImpact;expect(event.sound).toBe(room===1?'thud':room===2?'slap':'tap');expect(new T.Vector3(...event.position).distanceTo(actors.rightHand.getWorldPosition(new T.Vector3()))).toBeLessThan(.003);expect(actors.gun.parent).toBe(scene);
  expect(actors.cardSlots.find(s=>s.active)!.group.position.y).toBeGreaterThan(cards[0].y);
  for(const arm of Object.values(actors.skeletons.captive.arms)){expect(arm.shoulder.getWorldPosition(new T.Vector3()).distanceTo(arm.forearm.getWorldPosition(new T.Vector3()))).toBeCloseTo(.3,7);expect(arm.forearm.getWorldPosition(new T.Vector3()).distanceTo(arm.hand.getWorldPosition(new T.Vector3()))).toBeCloseTo(.27,7);expect(arm.diagnostics.relocateRequired).toBe(false);}
  frame(1.6,{reaction:r,roomNumber:room});expect(actors.captive.userData.reactionActive).toBe(false);expect(actors.gun.getWorldPosition(new T.Vector3()).distanceTo(rest)).toBeLessThan(1e-8);expect(actors.gun.position.toArray()).toEqual([...GUN_REST]);actors.cardSlots.filter(s=>s.active).forEach((s,i)=>expect(s.group.position.distanceTo(cards[i])).toBeLessThan(1e-8));
 });
 it('gives a positioned thud priority over a glare and makes the Host turn toward the real fist',()=>{
  const r=reaction(1),sound={id:'fist',at:100650,source:'reaction:thud',position:[.22,.79,-.43] as const,loudness:.9};frame(.7,{reaction:r,worldSound:sound});expect(actors.captive.userData.gazePriority).toBe('sound');expect(actors.host.userData.gazeTarget).toEqual([...sound.position]);expect(actors.captive.userData.gazeTarget).toEqual([...sound.position]);
  frame(.8,{reaction:r});expect(actors.captive.userData.gazePriority).toBe('reaction');expect(actors.captive.userData.gazeTarget).toEqual(camera.position.toArray());frame(.9,{reaction:reaction(1,'relief')});expect(actors.captive.userData.gazeTarget).toEqual([0,.76,-.27]);
 });
 it('suppresses every reaction during silent shooting, any gun handling, and death',()=>{
  for(const kind of ['loss','survive','glare','relief','player-click'] as const){const r=reaction(1,kind);for(const safety of [{phase:'PLAYER_SHOOTING' as const,suspense:true,dead:false,holding:false},{phase:'ROUND_RESULT' as const,suspense:false,dead:false,holding:true},{phase:'ROUND_RESULT' as const,suspense:false,dead:true,holding:false}])expect(reactionPose(r,100700,safety).active).toBe(false);}
  frame(.7,{reaction:reaction(1),phase:'AI_SHOOTING'});expect(actors.captive.userData.reactionImpact).toBeNull();frame(.8,{reaction:reaction(1),dead:'ai',shotEffect:'shot'});expect(actors.captive.userData.reactionImpact).toBeNull();
 });
});
