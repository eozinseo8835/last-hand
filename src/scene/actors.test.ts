// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {CONFIG,type Card,type Round} from '../game';
import {createActors,type ActorState} from './actors';
import {CARD_WIDTH,CARD_HEIGHT,DECK_POSITION,GUN_REST,TABLE_CARD_Y,tableCardPosition,playerPeekDeck} from '../tableLayout';
import {GRIP_SOCKET,MUZZLE_LOCAL} from './revolver';
import {stageDurationMs,type CinematicStage} from '../cinematics';
import {PICKUP_MS,PICKUP_PHASES} from '../pickup';
import {HUMAN} from './poses';
import {applyNearCameraHiding,restoreNearCameraHiding} from './visibility';

const card=(rank:string,suit:Card['suit']):Card=>({rank,suit,id:`${suit}-${rank}`});
const opening=():Round=>({player:[card('A','spades'),card('6','hearts')],ai:[card('9','clubs'),card('7','diamonds')],deck:[]});
const empty=():Round=>({player:[],ai:[],deck:[]});
type Cast=ReturnType<typeof createActors>;
type Slot=Cast['cardSlots'][number];
let scene:THREE.Scene,camera:THREE.PerspectiveCamera,actors:Cast,state:ActorState,now:number;
const epoch=100000;
function tick(seconds:number,patch:Partial<ActorState>={}){state={...state,...patch};now+=seconds;actors.update(now,seconds,state);scene.updateMatrixWorld(true);}
function advance(seconds:number,patch:Partial<ActorState>={}){const frames=Math.max(1,Math.ceil(seconds/.05));for(let i=0;i<frames;i++)tick(seconds/frames,patch);}
function position(slot:Slot){return slot.front.getWorldPosition(new THREE.Vector3());}
function normal(slot:Slot){return new THREE.Vector3(0,0,1).transformDirection(slot.front.matrixWorld);}
function playerCards(){return actors.cardSlots.filter(s=>s.owner==='player'&&s.active&&s.group.visible);}
function settle(){const round=opening();actors.setCards(round,false);advance(CONFIG.DEAL_SPEED/1000+.25,{phase:'PLAYER_DECISION'});return round;}
function noFaceOnFelt(){for(const s of playerCards())expect(Math.abs(position(s).y-TABLE_CARD_Y)<.025&&normal(s).y>.7,s.group.name).toBe(false);}
function world(object:THREE.Object3D){return object.getWorldPosition(new THREE.Vector3());}
function muzzle(){return actors.gun.localToWorld(new THREE.Vector3(...MUZZLE_LOCAL));}
function prepareShot(side:'player'|'ai'){const started=Date.now();tick(0,{phase:side==='ai'?'AI_SHOOTING':'PLAYER_SHOOTING',aiShotStartedAt:null,gunTransfer:{stage:'to-shooter',side,startedAt:started,duration:PICKUP_MS}});advance(PICKUP_MS/1000);tick(0,{gunTransfer:null});}
function beginAiWindup(){prepareShot('ai');const started=Date.now();tick(0,{phase:'AI_SHOOTING',aiShotStartedAt:started,aiShotDurationMs:2000});advance(2);}
function openingStage(stage:CinematicStage,fraction=.5){const duration=stageDurationMs(stage);tick(0,{phase:'OPENING',storyStage:stage,cinematic:{stage,startedAt:Date.now()-duration*fraction,mode:'full'},tiesCut:{player:false,ai:false}});}
function visible(object:THREE.Object3D){for(let p:THREE.Object3D|null=object;p;p=p.parent)if(!p.visible)return false;return true;}

beforeEach(()=>{
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(()=>({fillRect(){},strokeRect(){},fillText(){},save(){},restore(){},translate(){},rotate(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}} as unknown as CanvasRenderingContext2D));
 now=0;vi.spyOn(Date,'now').mockImplementation(()=>epoch+now*1000);
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(68,16/9,.055,28);camera.position.set(0,1.20,1.05);camera.rotation.x=-.12;scene.add(camera);
 actors=createActors(scene,camera);state={phase:'SHUFFLING',suspense:false,dead:null,shotEffect:null,roundNumber:1,revealed:false};actors.setCards(empty(),false);tick(0);
});
afterEach(()=>{
 const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),geometries=new Set<THREE.BufferGeometry>();
 scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;geometries.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:[object.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);}});
 textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());vi.restoreAllMocks();
});

describe('production hierarchy, materials and speech',()=>{
 it('uses one Host, one human captive and the player with three distinct captive faces',()=>{
  settle();const roles:string[]=[];scene.traverse(o=>{if(o.userData.actorRole&&visible(o))roles.push(o.userData.actorRole);});expect(roles.sort()).toEqual(['captive','host','player']);
  expect(actors.stranger).toBe(actors.captive);expect(actors.deck.userData.owner).toBe('host');
  const looks=new Set<string>();for(const room of [1,2,3] as const){tick(.02,{roomNumber:room});const shown=actors.captiveHead.children.filter(o=>o instanceof THREE.Group&&o.name.includes('head look')&&o.visible);expect(shown).toHaveLength(1);looks.add(shown[0].name);}
  expect(looks.size).toBe(3);expect(actors.hostHead.getObjectByName('Featureless Host mask')).toBeDefined();
 });
 it('keeps every joint offset and mesh scale fixed through dealing, shooting, guards and replay',()=>{
  settle();const offsets=new Map<THREE.Object3D,number[]>();scene.traverse(o=>{if(o.userData.bindPosition)offsets.set(o,[...o.userData.bindPosition]);});
  for(const phase of ['DEALING','PLAYER_DECISION','REVEAL','AI_SHOOTING','PLAYER_SHOOTING','HOST_FORCE_SHOT','OPENING','TRANSITION'] as const){
   tick(.20,{phase,triggerProgress:.8,aiShotStartedAt:Date.now()-1800,aiShotDurationMs:2000,forceShotAt:phase==='HOST_FORCE_SHOT'?Date.now()-2800:null});
   for(const [joint,bind]of offsets)expect(joint.position.toArray(),joint.name).toEqual(bind);
   for(const rig of [actors.skeletons.captive,actors.skeletons.host,...actors.skeletons.guards,actors.skeletons.player])rig.group.traverse(o=>expect(o.scale.toArray(),o.name).toEqual([1,1,1]));
   for(const rig of [actors.skeletons.captive,actors.skeletons.host,actors.skeletons.player])for(const arm of Object.values(rig.arms)){
    expect(world(arm.shoulder).distanceTo(world(arm.forearm))).toBeCloseTo(HUMAN.upperArm,7);expect(world(arm.forearm).distanceTo(world(arm.hand))).toBeCloseTo(HUMAN.forearm,7);
   }
  }
 });
 it('relaxes the empty hand and returns the Host gesture to idle after 1.5 seconds',()=>{
  tick(.01,{phase:'PLAYER_DECISION',speaker:'host',hostVoiceLevel:1});const gesture=world(actors.hostLeftHand);
  advance(1.6);expect(world(actors.hostLeftHand).distanceTo(gesture)).toBeGreaterThan(.03);
  for(const rig of [actors.skeletons.player,actors.skeletons.host,actors.skeletons.captive,...actors.skeletons.guards])for(const arm of Object.values(rig.arms))for(const chain of [...arm.fingers,arm.thumb])for(const joint of chain){expect(-joint.rotation.x).toBeGreaterThanOrEqual(0);expect(-joint.rotation.x).toBeLessThanOrEqual(Math.PI/2);}
  expect(camera.worldToLocal(world(actors.playerHands.getObjectByName('player left wrist')!)).y).toBeLessThan(-.40);
 });
 it('gives every hand three finger segments, two thumb segments and readable skin materials',()=>{
  for(const rig of [actors.skeletons.captive,actors.skeletons.host,...actors.skeletons.guards,actors.skeletons.player])for(const arm of Object.values(rig.arms)){
   expect(arm.fingers).toHaveLength(4);for(const chain of arm.fingers)expect(chain).toHaveLength(3);expect(arm.thumb).toHaveLength(2);
   expect(arm.hand.parent).toBe(arm.forearm);expect(arm.forearm.parent).toBe(arm.upper);
   const material=arm.palm.material as THREE.MeshStandardMaterial;expect(material.isMeshStandardMaterial).toBe(true);
   const hsl={h:0,s:0,l:0};material.color.getHSL(hsl);expect(hsl.l).toBeGreaterThan(rig===actors.skeletons.host?.01:.08);
  }
 });
 it('bobs only the active speaker using rotation while leaving joint offsets unchanged',()=>{
  settle();const time=now;actors.update(time,0,{...state,speaker:null,hostVoiceLevel:1,captiveVoiceLevel:1});
  const h=actors.hostHead.rotation.x,c=actors.head.rotation.x,hp=actors.hostHead.position.clone(),cp=actors.head.position.clone();
  actors.update(time,0,{...state,speaker:'host',hostVoiceLevel:1,captiveVoiceLevel:1});expect(actors.hostHead.rotation.x-h).toBeCloseTo(.010);expect(actors.head.rotation.x).toBe(c);
  actors.update(time,0,{...state,speaker:'captive',hostVoiceLevel:1,captiveVoiceLevel:.5});expect(actors.hostHead.rotation.x).toBe(h);expect(actors.head.rotation.x-c).toBeCloseTo(.005);
  expect(actors.hostHead.position.equals(hp)).toBe(true);expect(actors.head.position.equals(cp)).toBe(true);
 });
 it('reduces speech motion and suppresses captive speech movement after death',()=>{
  settle();const time=now;actors.update(time,0,{...state,speaker:'captive',captiveVoiceLevel:0});const idle=actors.head.rotation.x;
  actors.update(time,0,{...state,speaker:'captive',captiveVoiceLevel:1,reducedMotion:true});expect(actors.head.rotation.x-idle).toBeCloseTo(.0025);
  actors.update(time,0,{...state,speaker:'captive',captiveVoiceLevel:0,dead:'ai'});const deadIdle=actors.head.rotation.x;actors.update(time,0,{...state,speaker:'captive',captiveVoiceLevel:1,dead:'ai'});expect(actors.head.rotation.x).toBe(deadIdle);
 });
 it('does not leak a hidden hand through public body stress, and restricts tells to decisions',()=>{
  const round=settle(),time=now;actors.update(time,0,{...state,stress:.8,tell:null});const head=actors.head.rotation.clone();
  actors.setCards({...round,ai:[card('2','clubs'),card('3','diamonds')]},false);actors.update(time,0,{...state,stress:.8,tell:null});expect(actors.head.rotation.equals(head)).toBe(true);
  actors.update(time,0,{...state,phase:'REVEAL',tell:{kind:'avert',disposition:'nervous'}});const reveal=actors.head.rotation.clone();actors.update(time,0,{...state,phase:'REVEAL',tell:null});expect(actors.head.rotation.equals(reveal)).toBe(true);
 });
 it('reacts to a positioned sound before context, then returns to context without random sideways targets',()=>{
  settle();const sound={id:'left',at:Date.now(),position:[-3,1.3,-.5] as const,loudness:1,source:'pipe'};
  advance(.3,{worldSound:sound,speaker:'host'});
  expect(actors.captive.userData.gazeTarget).toEqual([...sound.position]);expect(actors.captive.userData.gazePriority).toBe('sound');
  advance(.5,{speaker:'captive'});expect(actors.captive.userData.gazeTarget).toEqual([...sound.position]);
  advance(.8,{speaker:'host'});expect(new THREE.Vector3(...actors.captive.userData.gazeTarget).distanceTo(world(actors.hostHead))).toBeLessThan(.003);
  advance(.4,{speaker:null,worldSound:null,roomNumber:3});expect(new THREE.Vector3(...actors.captive.userData.gazeTarget).distanceTo(world(actors.aiHeldRig))).toBeLessThan(.015);
  for(let i=0;i<20;i++){tick(.2,{roomNumber:1});const t=new THREE.Vector3(...actors.captive.userData.gazeTarget);expect(Math.min(t.distanceTo(world(actors.aiHeldRig)),t.distanceTo(world(camera)),t.distanceTo(world(actors.gun)))).toBeLessThan(.015);expect(Math.abs(actors.head.rotation.y)).toBeLessThan(70*Math.PI/180);}
 });
});

describe('real cards and hidden information',()=>{
 it.each(['START','OPENING','TRANSITION'] as const)('renders no cards during %s even after a previous hand',phase=>{
  settle();tick(.02,{phase,cinematic:phase==='OPENING'?{stage:'rules',startedAt:Date.now(),mode:'full'}:null,tiesCut:{player:false,ai:false}});expect(actors.cardSlots.filter(s=>visible(s.group))).toHaveLength(0);
 });
 it('keeps every player face off the felt throughout deliveries, pickup and later HITs',()=>{
  const round=opening();actors.setCards(empty(),false);tick(.02,{phase:'DEALING'});
  for(let count=1;count<=2;count++){actors.setCards({...round,player:round.player.slice(0,count)},false);for(let i=0;i<18;i++){tick(.04);noFaceOnFelt();}}
  for(const next of [card('2','clubs'),card('3','hearts')]){round.player.push(next);actors.setCards(round,false);for(let i=0;i<18;i++){tick(.04,{phase:'HITTING'});noFaceOnFelt();}}
  tick(.3,{phase:'PLAYER_DECISION'});expect(playerCards()).toHaveLength(4);expect(playerCards().every(s=>s.group.userData.held)).toBe(true);
 });
 it('holds an unscaled readable fan facing the camera with only backs toward the captive',()=>{
  settle();const slots=playerCards();expect(slots).toHaveLength(2);expect(slots[0].group.position.x).toBeLessThan(slots[1].group.position.x);
  for(const s of slots){expect(s.group.parent).toBe(actors.heldRig);expect(s.group.scale.toArray()).toEqual([1,1,1]);const n=normal(s),p=position(s);expect(n.dot(world(camera).sub(p).normalize())).toBeGreaterThan(.9);expect(n.dot(world(actors.head).sub(p).normalize())).toBeLessThan(0);}
  camera.rotation.set(-.45,.60,0);tick(.02);for(const s of slots)expect(normal(s).dot(world(camera).sub(position(s)).normalize())).toBeGreaterThan(.9);
 });
 it('keeps a large legal held fan inside the view and clear of the bottom action area',()=>{
  const cards=[card('A','spades'),card('A','hearts'),card('A','diamonds'),card('A','clubs'),card('2','spades'),card('2','hearts'),card('2','diamonds'),card('2','clubs'),card('3','spades'),card('3','hearts'),card('3','diamonds')];
  for(const count of [2,4,11]){actors.setCards({player:cards.slice(0,count),ai:opening().ai,deck:[]},false);advance(1.1,{phase:'PLAYER_DECISION'});
   for(const s of playerCards())for(const x of [-CARD_WIDTH/2,CARD_WIDTH/2])for(const y of [-CARD_HEIGHT/2,CARD_HEIGHT/2]){const p=s.front.localToWorld(new THREE.Vector3(x,y,0)).project(camera);expect(p.y).toBeGreaterThan(1-2*710/810);expect(Math.abs(p.x)).toBeLessThan(1);}}
 });
 it('lays held cards on their actual table zones before the 950ms showdown result, including sparse frames',()=>{
  const round=settle();actors.setCards(round,true);tick(.95,{phase:'REVEAL',revealed:true});
  for(const s of playerCards()){expect(s.group.parent).toBe(scene);expect(s.group.position.distanceTo(new THREE.Vector3(...tableCardPosition('player',s.index,round.player.length)))).toBeLessThan(.01);expect(normal(s).y).toBeGreaterThan(.99);expect(s.group.userData.tableFaceUp).toBe(true);}
 });
 it('finishes pickup and the hole-card flip by their deadlines without depending on frame count',()=>{
  const round=opening();actors.setCards(round,false);tick(CONFIG.DEAL_SPEED/1000+.01,{phase:'PLAYER_DECISION'});expect(playerCards().every(s=>s.group.userData.held)).toBe(true);
  actors.setCards(round,true);tick(.80,{phase:'REVEAL',revealed:true});const hole=actors.cardSlots.find(s=>s.owner==='ai'&&s.index===1)!;expect(normal(hole).y).toBeGreaterThan(.99);
 });
 it('assigns every face texture from its own rank/suit and never assigns the hidden hole texture prematurely',()=>{
  settle();const hole=actors.cardSlots.find(s=>s.owner==='ai'&&s.index===1)!;expect((hole.front.material as THREE.MeshStandardMaterial).map).toBeNull();
  tick(.3,{phase:'PEEKING'});expect((hole.front.material as THREE.MeshStandardMaterial).map).toBeNull();actors.setCards(opening(),true);tick(.8,{phase:'REVEAL',revealed:true});
  for(const s of actors.cardSlots.filter(s=>s.active)){const texture=(s.front.material as THREE.MeshStandardMaterial).map!;const expected=opening()[s.owner][s.index];expect(texture.userData.rank).toBe(expected.rank);expect(texture.userData.suit).toBe(expected.suit);}
 });
 it('exposes just an attached hinged corner during PEEK and removes it on completion',()=>{
  settle();tick(.02,{phase:'PLAYER_PEEKING',peekActor:'player',peekSerial:1,peekStartedAt:Date.now(),peekedCard:card('Q','hearts')});advance(.4);
  expect(actors.deckCorner.visible).toBe(true);expect(actors.peekFront.parent).toBe(actors.deckCorner);expect(actors.peekFront.geometry.attributes.position.count).toBe(3);expect(actors.deckCorner.parent).toBe(actors.deck);
  const b=new THREE.Box3().setFromObject(actors.deckCorner);expect(b.max.y-b.min.y).toBeLessThan(CARD_HEIGHT/2);
  tick(.02,{phase:'PLAYER_DECISION',peekActor:null,peekedCard:null});expect(actors.deckCorner.visible).toBe(false);expect((actors.peekFront.material as THREE.MeshStandardMaterial).map).toBeNull();
  expect(actors.deck.position.toArray()).toEqual([...DECK_POSITION]);
 });
 it('keeps the low held fan and both hands clear of the private PEEK corner',()=>{
  settle();
  for(const progress of [.25,.5,.75]){
   camera.position.set(-Math.sin(progress*Math.PI)*.16,1.20,1.05-Math.sin(progress*Math.PI)*.14);camera.lookAt(new THREE.Vector3(...playerPeekDeck(progress).position));
   tick(0,{phase:'PLAYER_PEEKING',peekActor:'player',peekStartedAt:Date.now()-progress*CONFIG.PEEK_DURATION_MS,peekedCard:card('Q','hearts')});
   const corner=world(actors.deckCorner).project(camera),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(corner.x,corner.y),camera);
   expect(ray.intersectObjects(playerCards().map(s=>s.group),true)).toHaveLength(0);
   const index=actors.peekFront.localToWorld(new THREE.Vector3(.02,0,.04/3)).project(camera),hands:THREE.Object3D[]=[actors.peekFront];
   for(const arm of Object.values(actors.skeletons.player.arms))arm.shoulder.traverse(o=>{if(o instanceof THREE.Mesh&&visible(o)&&o.layers.test(camera.layers))hands.push(o);});
   ray.setFromCamera(new THREE.Vector2(index.x,index.y),camera);
   if(progress===.5)expect(ray.intersectObjects(hands,false)[0]?.object===actors.peekFront,'the lifted private index is visible past the fingers').toBe(true);
   for(const arm of Object.values(actors.skeletons.player.arms)){expect(arm.diagnostics.requestedDistance).toBeLessThanOrEqual(.5131);expect(arm.diagnostics.relocateRequired).toBe(false);}
  }
  tick(0,{phase:'PLAYER_DECISION',peekActor:null,peekedCard:null});expect(actors.heldRig.position.toArray()).toEqual([0,0,0]);
 });
 it('dims held cards only during the active blackout and resumes normal illumination after it ends',()=>{
  settle();const m=playerCards()[0].front.material as THREE.MeshStandardMaterial,level=m.emissiveIntensity;
  tick(.02,{event:{kind:'blackout',startedAt:Date.now(),duration:4000,seed:1}});expect(m.emissiveIntensity).toBeCloseTo(level*.055);
  tick(.02,{phase:'HITTING'});expect(m.emissiveIntensity).toBeCloseTo(level);
 });
 it('sweeps all cards and begins a new hand without stale held faces or hole information',()=>{
  settle();tick(.02,{phase:'SWEEPING'});advance(.7);expect(actors.cardSlots.filter(s=>s.group.visible)).toHaveLength(0);
  actors.setCards(empty(),false);tick(.02,{phase:'SHUFFLING',roundNumber:2,revealed:false});actors.setCards(opening(),false);advance(.9,{phase:'PLAYER_DECISION'});expect(playerCards()).toHaveLength(2);expect(actors.cardSlots.find(s=>s.owner==='ai'&&s.index===1)!.front.userData.identity).toBe('unrevealed');
 });
});

describe('one physical revolver and reachable pickup',()=>{
 it.each(['player','ai','host'] as const)('picks up from center through all six phases and stays attached from contact: %s',owner=>{
  settle();const started=Date.now(),phases=new Set<string>(),rig=actors.skeletons[owner==='ai'?'captive':owner];
  for(let i=0;i<=40;i++){
   tick(i===0?0:PICKUP_MS/40000,{phase:owner==='ai'?'AI_SHOOTING':'PLAYER_SHOOTING',gunTransfer:{stage:'to-shooter',side:owner==='ai'?'ai':'player',owner,startedAt:started,duration:PICKUP_MS}});
   const p=i/40;phases.add(actors.gun.userData.pickupPhase);expect(actors.gun.scale.toArray()).toEqual([1,1,1]);
   if(p<.5)expect(world(actors.gun).distanceTo(new THREE.Vector3(...GUN_REST))).toBeLessThan(.001);
   else {expect(actors.gun.parent).toBe(rig.arms.right.hand);if(p===.5)expect(world(actors.gun).distanceTo(new THREE.Vector3(...GUN_REST))).toBeLessThan(.01);}
   expect(rig.arms.right.diagnostics.relocateRequired).toBe(false);
  }
  expect([...phases]).toEqual([...PICKUP_PHASES]);
 });
 it('keeps the wrapped grip bound to the wrist, with the same socket and three curling knuckles',()=>{
  settle();prepareShot('player');advance(1,{phase:'PLAYER_SHOOTING',triggerHeld:true,triggerProgress:1});expect(actors.gun.parent).toBe(actors.skeletons.player.arms.right.hand);
  expect(actors.gun.position.toArray()).toEqual([...GRIP_SOCKET.position]);expect(actors.gun.quaternion.angleTo(new THREE.Quaternion(...GRIP_SOCKET.quaternion))).toBeLessThan(1e-7);
  for(const chain of actors.skeletons.player.arms.right.fingers.slice(1))expect(chain.every(joint=>joint.rotation.x<-.1)).toBe(true);
 });
 it.each([[1280,720],[1440,900],[1920,1080]])('holds the same gun at the right temple edge in %s×%s',(width,height)=>{
  settle();prepareShot('player');camera.aspect=width/height;camera.updateProjectionMatrix();advance(1,{phase:'PLAYER_SHOOTING',triggerHeld:true,triggerProgress:1});
  const bounds=new THREE.Box3().setFromObject(actors.gun),right=bounds.max.project(camera);expect(right.x).toBeGreaterThan(.35);expect(actors.gun.parent).toBe(actors.skeletons.player.arms.right.hand);
  const direction=new THREE.Vector3(1,0,0).transformDirection(actors.gun.matrixWorld).transformDirection(camera.matrixWorldInverse);expect(direction.x).toBeLessThan(-.9);
  expect(actors.gun.userData.muzzleError).toBeLessThan(.015);expect(actors.gun.scale.toArray()).toEqual([1,1,1]);
 });
 it('keeps the temple grip reachable through sparse frames and camera changes',()=>{
  settle();prepareShot('player');camera.position.set(.04,1.24,1.08);camera.rotation.set(-.12,.08,.01);
  for(const dt of [.4,.4,.4,.4,.4,.4,.3])tick(dt,{phase:'PLAYER_SHOOTING',triggerHeld:true,triggerProgress:.8});
  expect(actors.gun.userData.muzzleError).toBeLessThan(.015);expect(actors.skeletons.player.arms.right.diagnostics.relocateRequired).toBe(false);
 });
 it('cocks and squeezes progressively while spinning the same cylinder without rescaling the gun',()=>{
  settle();prepareShot('player');tick(.02,{phase:'PLAYER_SHOOTING',triggerHeld:true,triggerProgress:.2});const first=actors.hammer.rotation.z;tick(.02,{triggerProgress:.9});expect(Math.abs(actors.hammer.rotation.z-first)).toBeGreaterThan(.1);
  tick(.02,{spinning:'player',spinSerial:1,triggerProgress:0});advance(.5);expect(Math.abs(actors.cylinder.rotation.x)).toBeGreaterThan(Math.PI);tick(.02,{spinning:null});advance(.3);expect(actors.cylinder.rotation.x).toBeCloseTo(0);expect(actors.gun.scale.toArray()).toEqual([1,1,1]);
 });
 it('keeps the captive muzzle touching the temple with fixed bones and returns after an empty click',()=>{
  settle();beginAiWindup();expect(actors.gun.parent).toBe(actors.rightHand);expect(muzzle().distanceTo(new THREE.Vector3(...actors.gun.userData.temple))).toBeLessThan(.015);
  tick(0,{phase:'ROUND_RESULT',shotEffect:'click',aiShotStartedAt:null});advance(.7);const started=Date.now();tick(0,{gunTransfer:{stage:'return',side:'ai',startedAt:started,duration:PICKUP_MS}});advance(.9);expect(actors.gun.parent).toBe(scene);expect(world(actors.gun).distanceTo(new THREE.Vector3(...GUN_REST))).toBeLessThan(.01);
 });
 it('sets down even a fatal shot before the captive slumps while the Host stays seated',()=>{
  settle();beginAiWindup();tick(.02,{phase:'ROUND_RESULT',dead:'ai',shotEffect:'shot',aiShotStartedAt:null});const started=Date.now();tick(0,{gunTransfer:{stage:'return',side:'ai',startedAt:started,duration:PICKUP_MS}});advance(PICKUP_MS/1000);tick(0,{gunTransfer:null});advance(1);
  expect(world(actors.gun).distanceTo(new THREE.Vector3(...GUN_REST))).toBeLessThan(.001);
  expect(actors.skeletons.captive.spine.rotation.x).toBeGreaterThan(.5);expect(actors.host.rotation.x).toBe(0);expect(actors.host.rotation.z).toBe(0);expect(actors.gun.parent).toBe(scene);expect(actors.host.userData.canDie).toBe(false);
 });
 it('resets a fatal replay to its real-size rest pose, empty cards and central revolver',()=>{
  settle();beginAiWindup();tick(.1,{phase:'ROUND_RESULT',dead:'ai',shotEffect:'shot'});actors.setCards(empty(),false);tick(.02,{phase:'SHUFFLING',roundNumber:1,dead:null,shotEffect:null,triggerProgress:0,aiShotStartedAt:null,gunTransfer:null});
  expect(actors.captive.rotation.x).toBe(0);expect(world(actors.gun).distanceTo(new THREE.Vector3(...GUN_REST))).toBeLessThan(.01);expect(actors.cardSlots.filter(s=>s.group.visible)).toHaveLength(0);
 });
});

describe('ordered guard and restraint choreography',()=>{
 it('keeps the hood-removal grip reachable while the sack deforms upward',()=>{
  for(const progress of [.67,.75,.85,.93]){openingStage('opponent-unhood',progress);const arm=actors.guards[0].rig.arms.right;expect(arm.diagnostics.requestedDistance).toBeLessThanOrEqual(.5131);expect(arm.diagnostics.relocateRequired).toBe(false);}
 });

 it('covers the real head before removal and keeps hands bound until each cut state',()=>{
  actors.setCards(null,false);openingStage('hooded');expect(world(actors.playerTie).distanceTo(world(actors.skeletons.player.arms.left.hand).lerp(world(actors.skeletons.player.arms.right.hand),.5))).toBeLessThan(.002);expect(actors.captiveHood.visible).toBe(true);expect(actors.captiveTie.visible).toBe(true);expect(actors.playerTie.visible).toBe(true);
  const b=new THREE.Box3().setFromObject(actors.captiveHood),head=world(actors.head);expect(b.min.y).toBeLessThan(head.y-.10);expect(b.max.y).toBeGreaterThan(head.y+.10);
  openingStage('player-unhood');expect(actors.captiveHood.visible).toBe(true);expect(actors.guards[0].group.visible).toBe(true);
  openingStage('opponent-unhood',.99);expect(actors.captiveHood.visible).toBe(false);openingStage('guard-exit');expect(actors.guards[0].foldedHoods.visible).toBe(true);expect(actors.guards[0].group.userData.hoodsCarried).toBe(2);
  openingStage('rules');expect(actors.guards.every(g=>!g.group.visible)).toBe(true);expect(actors.cardSlots.filter(s=>s.group.visible)).toHaveLength(0);
 });
 it('keeps every visible guard body mesh at least 0.7m from the camera throughout the opening',()=>{
  for(const stage of ['door-open','guard-approach','player-unhood','player-focus','opponent-unhood','guard-exit'] as const)for(let i=0;i<=10;i++){
   openingStage(stage,i/10);const eye=world(camera);
   for(const guard of actors.guards){const arms=new Set<THREE.Object3D>();for(const arm of Object.values(guard.rig.arms))arm.shoulder.traverse(o=>arms.add(o));guard.group.traverse(o=>{if(!(o instanceof THREE.Mesh)||!visible(o)||arms.has(o))return;expect(new THREE.Box3().setFromObject(o).distanceToPoint(eye),`${stage} ${o.name}`).toBeGreaterThanOrEqual(.7-1e-4);});}
  }
 });
});

describe('forced shot camera safety',()=>{
 it.each([[1280,720],[1440,900],[1920,1080]])('keeps enforcement seated, reachable and aimed at the player in %s×%s',(width,height)=>{
  camera.aspect=width/height;camera.updateProjectionMatrix();camera.lookAt(-.72,1.22,.12);
  settle();tick(.02,{phase:'HOST_FORCE_SHOT',forceShotAt:Date.now()-2800});
  expect(actors.host.position.toArray()).toEqual([-.72,.45,.12]);
  const arm=actors.skeletons.host.arms.right;expect(actors.gun.parent).toBe(arm.hand);expect(actors.gun.userData.muzzleError).toBeLessThan(.015);
  expect(arm.diagnostics.relocateRequired).toBe(false);expect(arm.diagnostics.wristLimited).toBe(false);
  expect(world(arm.forearm).distanceTo(world(arm.hand))).toBeCloseTo(HUMAN.forearm,7);
  const axis=new THREE.Vector3(1,0,0).transformDirection(actors.gun.matrixWorld);expect(axis.dot(world(camera).sub(muzzle()).normalize())).toBeGreaterThan(.995);
  expect(Math.abs(world(actors.hostHead).project(camera).x)).toBeLessThan(.5);expect(actors.gun.scale.toArray()).toEqual([1,1,1]);
 });
 it('hides other meshes within 35cm only from the seated camera and restores their original layers afterward',()=>{
  const surface=new THREE.MeshStandardMaterial(),geometry=new THREE.BoxGeometry(.03,.03,.03);
  const near=new THREE.Mesh(geometry,surface),far=new THREE.Mesh(geometry,surface),forearm=new THREE.Group(),permitted=new THREE.Mesh(geometry,surface);
  near.position.copy(camera.localToWorld(new THREE.Vector3(0,-.1,-.20)));far.position.copy(camera.localToWorld(new THREE.Vector3(0,0,-.60)));
  permitted.position.copy(camera.localToWorld(new THREE.Vector3(.05,0,-.20)));forearm.add(permitted);scene.add(near,far,forearm);
  applyNearCameraHiding(scene,camera,true,[forearm]);
  expect(near.layers.test(camera.layers)).toBe(false);expect(near.userData.nearHidden).toBe(true);
  const ceiling=new THREE.Camera();ceiling.layers.set(1);expect(near.layers.test(ceiling.layers)).toBe(true);
  expect(far.layers.test(camera.layers)).toBe(true);expect(permitted.layers.test(camera.layers)).toBe(true);
  restoreNearCameraHiding(scene);expect(near.layers.mask).toBe(1);expect(near.userData.nearHidden).toBeUndefined();
  geometry.dispose();surface.dispose();
 });
});

it('keeps production hand contact targets inside the 90% reach rule after torso lean',()=>{
 settle();
 const inspect=(rig:Cast['skeletons']['captive'],side:'left'|'right',label:string)=>{
  const d=rig.arms[side].diagnostics;
  expect(d.requestedDistance,`${label} requested hand target`).toBeLessThanOrEqual(d.reachLimit+.0001);
  expect(d.targetDistance,`${label} actual wrist`).toBeLessThanOrEqual(d.reachLimit+.0001);
  expect(d.relocateRequired,`${label}: request=${d.requestedDistance}, wrist=${d.targetDistance}, elbow=${d.elbowAngle}`).toBe(false);
 };
 inspect(actors.skeletons.captive,'left','captive rest left');inspect(actors.skeletons.captive,'right','captive rest right');
 tick(.02,{phase:'DEALING'});inspect(actors.skeletons.host,'right','Host dealing');
 for(const progress of [.05,.20,.40,.60,.80,.95]){
  camera.position.set(-Math.sin(progress*Math.PI)*.16,1.20,1.05-Math.sin(progress*Math.PI)*.14);camera.lookAt(new THREE.Vector3(...playerPeekDeck(progress).position));
  tick(0,{phase:'PLAYER_PEEKING',peekActor:'player',peekStartedAt:Date.now()-progress*CONFIG.PEEK_DURATION_MS,peekedCard:card('Q','hearts')});
  inspect(actors.skeletons.player,'right',`player PEEK ${progress}`);
 }
 camera.position.set(0,1.20,1.05);camera.rotation.set(-.12,0,0);tick(0,{phase:'PLAYER_DECISION',peekActor:null,peekedCard:null});
 prepareShot('player');advance(.5,{triggerHeld:true,triggerProgress:1});inspect(actors.skeletons.player,'right','player grip');
 tick(0,{phase:'PLAYER_DECISION',triggerHeld:false,triggerProgress:0});beginAiWindup();inspect(actors.skeletons.captive,'right','captive temple');
 tick(.02,{phase:'HOST_FORCE_SHOT',forceShotAt:Date.now()-2800});inspect(actors.skeletons.host,'right','Host enforcement');
});

it('keeps the Host seated in every state with one smooth continuous coat and a recessed flat mask',()=>{
 for(const phase of ['OPENING','DEALING','PLAYER_DECISION','PLAYER_PEEKING','AI_SHOOTING','PLAYER_SHOOTING','HOST_FORCE_SHOT','ROUND_RESULT','TRANSITION','ENDING_DEATH'] as const){tick(.1,{phase,forceShotAt:phase==='HOST_FORCE_SHOT'?Date.now()-2800:null});expect(actors.host.position.toArray()).toEqual([-.72,.45,.12]);expect(actors.skeletons.host.legs.left.thigh.rotation.x).toBeCloseTo(-Math.PI/2);}
 const coat=actors.host.getObjectByName('Continuous seated Host coat') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;expect(coat.material.flatShading).toBe(false);expect(coat.geometry.attributes.normal.count).toBeGreaterThan(600);
 const mask=actors.hostHead.getObjectByName('Featureless Host mask') as THREE.Mesh;mask.geometry.computeBoundingBox();const size=mask.geometry.boundingBox!.getSize(new THREE.Vector3());expect(size.z).toBeLessThan(.01);expect(size.x).toBeGreaterThan(.1);
});
it('holds the player palm toward the camera, captive backs toward the player, and lays penalty cards face down',()=>{
 settle();const palm=actors.skeletons.player.arms.left.palm;const n=new THREE.Vector3(0,1,0).transformDirection(palm.matrixWorld),toward=world(camera).sub(world(palm)).normalize();expect(n.dot(toward)).toBeGreaterThan(.7);
 for(const s of actors.cardSlots.filter(s=>s.active&&s.owner==='ai')){expect(s.group.parent).toBe(actors.aiHeldRig);expect(normal(s).dot(world(camera).sub(position(s)).normalize())).toBeLessThan(0);}
 advance(.5,{phase:'PLAYER_SHOOTING'});for(const s of playerCards()){expect(s.group.parent).toBe(scene);expect(normal(s).y).toBeLessThan(-.98);expect(s.group.userData.tableFaceUp).toBe(false);}
});
it('assigns walking and restraint cutting to reachable guards while the Host remains seated',()=>{
 for(const stage of ['guard-approach','opponent-unhood','cut-opponent','cut-player','guard-exit'] as const){openingStage(stage,.8);expect(actors.host.position.toArray()).toEqual([-.72,.45,.12]);if(stage.startsWith('cut-')){expect(actors.cutter.parent).toBe(actors.guards[0].rig.arms.right.hand);expect(actors.guards[0].rig.arms.right.diagnostics.relocateRequired,stage+': '+JSON.stringify(actors.guards[0].rig.arms.right.diagnostics)).toBe(false);}}
});

it('makes PEEK windows readable through card/deck glances and visibly returns before they close',()=>{
 settle();const away={away:true,returning:false,amount:1,direction:1};advance(.6,{roomNumber:2,attention:{host:away,captive:away,window:true}});
 expect(new THREE.Vector3(...actors.host.userData.gazeTarget).distanceTo(world(actors.deck))).toBeLessThan(.002);expect(new THREE.Vector3(...actors.captive.userData.gazeTarget).distanceTo(world(actors.aiHeldRig))).toBeLessThan(.015);
 advance(.3,{attention:{host:{...away,returning:true},captive:{...away,returning:true},window:true}});expect(actors.host.userData.gazeTarget).toEqual(world(camera).toArray());expect(actors.captive.userData.gazeTarget).toEqual(world(camera).toArray());
});
