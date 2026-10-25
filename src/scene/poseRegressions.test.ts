// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {CONFIG,type GamePhase} from '../game';
import {DECK_POSITION,playerPeekDeck} from '../tableLayout';
import {createActors,type ActorState} from './actors';

let scene:THREE.Scene,camera:THREE.PerspectiveCamera,actors:ReturnType<typeof createActors>;
const state:ActorState={phase:'PLAYER_DECISION',suspense:false,dead:null,shotEffect:null,roundNumber:1,revealed:false};
beforeEach(()=>{
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(()=>({fillRect(){},strokeRect(){},fillText(){},save(){},restore(){},translate(){},rotate(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}} as unknown as CanvasRenderingContext2D));
 vi.spyOn(Date,'now').mockReturnValue(100000);
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(68,1.6,.055,28);camera.rotation.order='YXZ';camera.position.set(0,1.20,1.05);camera.rotation.x=-.12;scene.add(camera);actors=createActors(scene,camera);
});
afterEach(()=>{
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);}});
 textures.forEach(o=>o.dispose());materials.forEach(o=>o.dispose());geometries.forEach(o=>o.dispose());vi.restoreAllMocks();
});
function reachable(rig:typeof actors.skeletons.host,side:'left'|'right',label:string){
 const d=rig.arms[side].diagnostics;
 expect(d.requestedDistance,label).toBeLessThanOrEqual(d.reachLimit+.0001);expect(d.relocateRequired,label).toBe(false);
 expect(rig.arms[side].upper.scale.toArray()).toEqual([1,1,1]);expect(rig.arms[side].forearm.scale.toArray()).toEqual([1,1,1]);
}
describe('skeleton rebuild regression contacts',()=>{
 it('keeps the actual PEEK pack and hinged corner reachable throughout the leaned camera motion',()=>{
  for(const progress of [.05,.20,.40,.60,.80,.95]){
   const lean=Math.sin(progress*Math.PI),pack=playerPeekDeck(progress);
   camera.position.set(-lean*.16,1.20,1.05-lean*.14);camera.rotation.set(-.12,0,0);
   const facing=camera.quaternion.clone();camera.lookAt(new THREE.Vector3(...pack.position));camera.quaternion.slerpQuaternions(facing,camera.quaternion.clone(),Math.min(1,lean*2));
   actors.update(progress,.016,{...state,phase:'PLAYER_PEEKING',peekActor:'player',peekSerial:1,peekStartedAt:100000-progress*CONFIG.PEEK_DURATION_MS,peekedCard:{rank:'Q',suit:'hearts',id:'hearts-Q'}});
   reachable(actors.skeletons.player,'right',`PEEK ${progress}`);
   expect(actors.deckCorner.parent).toBe(actors.deck);
   if(actors.deckCorner.visible){const corner=actors.deckCorner.getWorldPosition(new THREE.Vector3()).project(camera);expect(Math.abs(corner.x)).toBeLessThan(1);expect(Math.abs(corner.y)).toBeLessThan(1);}
  }
  actors.update(2,.016,{...state,peekActor:null,peekedCard:null});
  expect(actors.deck.position.toArray()).toEqual([...DECK_POSITION]);expect(actors.deckCorner.visible).toBe(false);
 });
 it('animates the shuffle and Host dealing hand without stretching or exceeding reach',()=>{
  const pack=actors.deck.getObjectByName('Shuffling upper pack')!;
  const phases=['SHUFFLING','DEALING','HITTING','DEALER_TURN','REVEAL','SWEEPING'] as GamePhase[];
  for(const [index,phase] of phases.entries()){
   const positions:THREE.Vector3[]=[],packX:number[]=[],packYaw:number[]=[],base=index*2;
   actors.update(base,0,{...state,phase});
   for(const elapsed of [0,.125,.25,.375,.5,.65]){
    actors.update(base+elapsed,.016,{...state,phase});reachable(actors.skeletons.host,'right',`${phase} ${elapsed}`);
    const hand=actors.skeletons.host.arms.right,palmWrist=hand.hand.getWorldPosition(new THREE.Vector3());
    const fingertip=hand.fingers[0][2].localToWorld(new THREE.Vector3(0,0,.0225));
    expect(fingertip.y,`${phase}: fingers reach down toward the pack`).toBeLessThan(palmWrist.y-.10);
    const arm=actors.skeletons.host.arms.right;
    const shoulder=arm.shoulder.getWorldPosition(new THREE.Vector3()),elbow=arm.forearm.getWorldPosition(new THREE.Vector3()),wrist=arm.hand.getWorldPosition(new THREE.Vector3());
    expect(shoulder.distanceTo(elbow)).toBeCloseTo(.30,7);expect(elbow.distanceTo(wrist)).toBeCloseTo(.27,7);
    positions.push(wrist);packX.push(pack.position.x);packYaw.push(pack.rotation.y);
   }
   if(['SHUFFLING','DEALING','HITTING','DEALER_TURN'].includes(phase))expect(Math.max(...positions.map(p=>p.distanceTo(positions[0]))),`${phase} actual hand motion`).toBeGreaterThan(.01);
   if(phase==='SHUFFLING'){
    expect(Math.max(...packX)-Math.min(...packX)).toBeGreaterThan(.08);expect(Math.max(...packYaw)-Math.min(...packYaw)).toBeGreaterThan(.4);
   }else expect(Math.max(...packX.map(Math.abs)),`${phase} stops shuffling`).toBe(0);
  }
 });
 it('keeps the Host public gaze and speaking bob during dealing and gun transfer',()=>{
  const gaze={away:true,returning:false,amount:1,direction:-1},attention={host:gaze,captive:{...gaze,direction:1},window:true};
  for(const phase of ['DEALING','DEALER_TURN','PLAYER_SHOOTING'] as GamePhase[]){
   for(let frame=0;frame<40;frame++)actors.update(2+frame*.02,.02,{...state,phase,attention,speaker:'host',hostVoiceLevel:1,gunTransfer:phase==='PLAYER_SHOOTING'?{stage:'to-shooter',side:'player',startedAt:100000,duration:900}:null});
   expect(actors.hostHead.rotation.y,phase).toBeGreaterThan(.4);expect(Math.abs(actors.hostHead.rotation.x)).toBeLessThan(Math.PI/6);
   const eyeDirection=camera.getWorldPosition(new THREE.Vector3()).sub(actors.hostHead.getWorldPosition(new THREE.Vector3())).normalize();
   expect(actors.hostHead.getWorldDirection(new THREE.Vector3()).dot(eyeDirection),`${phase} Host actually looks away`).toBeLessThan(.2);
  }
  actors.update(3,.016,{...state,attention:{...attention,host:{...gaze,returning:true,amount:.25}}});
  expect(actors.hostHead.rotation.y).toBeGreaterThan(0);
 });
});
