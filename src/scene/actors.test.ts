// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {CONFIG,type Card,type Round} from '../game';
import {createActors,type ActorState} from './actors';
import {CARD_WIDTH,CARD_HEIGHT,DECK_POSITION,GUN_REST,GUN_PICKUP,TABLE_CARD_Y,tableCardPosition,playerPeekDeck} from '../tableLayout';
import {GRIP_SOCKET,MUZZLE_LOCAL} from './revolver';
import {stageDurationMs,type CinematicStage} from '../cinematics';
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
function prepareShot(side:'player'|'ai'){const started=Date.now();tick(0,{phase:side==='ai'?'AI_SHOOTING':'PLAYER_SHOOTING',aiShotStartedAt:null,gunTransfer:{stage:'to-shooter',side,startedAt:started,duration:900}});advance(.9);tick(0,{gunTransfer:null});}
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
  actors.update(time,0,{...state,speaker:'captive',captiveVoiceLevel:1,dead:'ai'});expect(actors.head.rotation.x).toBe(idle);
 });
 it('does not leak a hidden hand through public body stress, and restricts tells to decisions',()=>{
  const round=settle(),time=now;actors.update(time,0,{...state,stress:.8,tell:null});const head=actors.head.rotation.clone();
  actors.setCards({...round,ai:[card('2','clubs'),card('3','diamonds')]},false);actors.update(time,0,{...state,stress:.8,tell:null});expect(actors.head.rotation.equals(head)).toBe(true);
  actors.update(time,0,{...state,phase:'REVEAL',tell:{kind:'avert',disposition:'nervous'}});const reveal=actors.head.rotation.clone();actors.update(time,0,{...state,phase:'REVEAL',tell:null});expect(actors.head.rotation.equals(reveal)).toBe(true);
 });
 it('turns only the addressed heads and visibly returns before a distraction closes',()=>{
  settle();const gaze={away:true,returning:false,amount:1,direction:-1};tick(.02,{attention:{host:gaze,captive:{...gaze,direction:1},window:true}});
  const h=Math.abs(actors.hostHead.rotation.y),c=Math.abs(actors.head.rotation.y);expect(h).toBeGreaterThan(.4);expect(c).toBeGreaterThan(.4);
  tick(.02,{attention:{host:{...gaze,returning:true,amount:.25},captive:{...gaze,direction:1,returning:true,amount:.25},window:true}});expect(Math.abs(actors.hostHead.rotation.y)).toBeLessThan(h);expect(Math.abs(actors.head.rotation.y)).toBeLessThan(c);
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
 it('moves the held fan aside so it cannot hide the PEEK corner, then restores it',()=>{
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
 it('starts at the center, uses one scale, and slides through the clear lane to each shooter',()=>{
  settle();expect(actors.gun.position.toArray()).toEqual([...GUN_REST]);
  for(const side of ['ai','player'] as const){const started=Date.now();tick(0,{phase:side==='ai'?'AI_SHOOTING':'PLAYER_SHOOTING',gunTransfer:{stage:'to-shooter',side,startedAt:started,duration:900}});
   advance(.9);expect(world(actors.gun).distanceTo(new THREE.Vector3(...GUN_PICKUP[side]))).toBeLessThan(.01);expect(actors.gun.scale.toArray()).toEqual([1,1,1]);expect(actors.gun.parent).toBe(scene);}
 });
 it('keeps the wrapped grip bound to the wrist, with the same socket and three curling knuckles',()=>{
  settle();prepareShot('player');advance(1,{phase:'PLAYER_SHOOTING',triggerHeld:true,triggerProgress:1});expect(actors.gun.parent).toBe(actors.skeletons.player.arms.right.hand);
  expect(actors.gun.position.toArray()).toEqual([...GRIP_SOCKET.position]);expect(actors.gun.quaternion.angleTo(new THREE.Quaternion(...GRIP_SOCKET.quaternion))).toBeLessThan(1e-7);
  for(const chain of actors.skeletons.player.arms.right.fingers.slice(1))expect(chain.every(joint=>joint.rotation.x<-.1)).toBe(true);
 });
 it.each([[1280,720],[1440,900],[1920,1080]])('points the held barrel at the eye in the center of %s×%s', (width,height)=>{
  settle();prepareShot('player');camera.aspect=width/height;camera.updateProjectionMatrix();advance(1,{phase:'PLAYER_SHOOTING',triggerHeld:true,triggerProgress:1});const p=muzzle().project(camera),direction=new THREE.Vector3(1,0,0).transformDirection(actors.gun.matrixWorld),eyeDirection=world(camera).sub(muzzle()).normalize();
  expect(Math.abs(p.x)).toBeLessThan(.03);expect(Math.abs(p.y)).toBeLessThan(.03);expect(direction.dot(eyeDirection)).toBeGreaterThan(.999);expect(p.z).toBeGreaterThan(-1);expect(p.z).toBeLessThan(1);
 });
 it('preserves centered hold geometry through sparse frames and camera changes',()=>{
  settle();prepareShot('player');camera.position.set(.04,1.24,1.08);camera.rotation.set(-.12,.08,.01);let elapsed=0;for(const dt of [.4,.4,.4,.4,.4,.4,.3]){elapsed+=dt;tick(dt,{phase:'PLAYER_SHOOTING',triggerHeld:true,triggerProgress:elapsed/3});}
  const p=muzzle().project(camera);expect(Math.abs(p.x)).toBeLessThan(.03);expect(Math.abs(p.y)).toBeLessThan(.03);
 });
 it('cocks and squeezes progressively while spinning the same cylinder without rescaling the gun',()=>{
  settle();prepareShot('player');tick(.02,{phase:'PLAYER_SHOOTING',triggerHeld:true,triggerProgress:.2});const first=actors.hammer.rotation.z;tick(.02,{triggerProgress:.9});expect(Math.abs(actors.hammer.rotation.z-first)).toBeGreaterThan(.1);
  tick(.02,{spinning:'player',spinSerial:1,triggerProgress:0});advance(.5);expect(Math.abs(actors.cylinder.rotation.x)).toBeGreaterThan(Math.PI);tick(.02,{spinning:null});advance(.3);expect(actors.cylinder.rotation.x).toBeCloseTo(0);expect(actors.gun.scale.toArray()).toEqual([1,1,1]);
 });
 it('keeps the captive muzzle touching the temple with fixed bones and returns after an empty click',()=>{
  settle();beginAiWindup();expect(actors.gun.parent).toBe(actors.rightHand);expect(muzzle().distanceTo(new THREE.Vector3(...actors.gun.userData.temple))).toBeLessThan(.015);
  tick(0,{phase:'ROUND_RESULT',shotEffect:'click',aiShotStartedAt:null});advance(.7);const started=Date.now();tick(0,{gunTransfer:{stage:'return',side:'ai',startedAt:started,duration:900}});advance(.9);expect(actors.gun.parent).toBe(scene);expect(world(actors.gun).distanceTo(new THREE.Vector3(...GUN_REST))).toBeLessThan(.01);
 });
 it('slumps only the defeated captive and drops its gun while the Host remains composed',()=>{
  settle();beginAiWindup();tick(.02,{phase:'ROUND_RESULT',dead:'ai',shotEffect:'shot',aiShotStartedAt:null});advance(1.5);
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
 it.each([[1280,720],[1440,900],[1920,1080]])('keeps the forced Host outside the %s×%s view with a reachable visible forearm, hand and gun',(width,height)=>{
  camera.aspect=width/height;camera.updateProjectionMatrix();
  settle();tick(.02,{phase:'HOST_FORCE_SHOT',forceShotAt:Date.now()-2800});
  const relative=camera.worldToLocal(world(actors.host));
  expect(relative.x).toBeCloseTo(-.90,6);expect(relative.z).toBeCloseTo(.20,6);
  const arm=actors.skeletons.host.arms.right,allowed=new Set<THREE.Object3D>();arm.forearm.traverse(o=>allowed.add(o));
  const excluded:THREE.Mesh[]=[],included:THREE.Mesh[]=[];
  actors.host.traverse(o=>{if(!(o instanceof THREE.Mesh))return;(allowed.has(o)?included:excluded).push(o);});
  expect(excluded.length).toBeGreaterThan(10);expect(excluded.every(mesh=>!mesh.layers.test(camera.layers))).toBe(true);
  expect(included.some(mesh=>mesh.layers.test(camera.layers))).toBe(true);expect(actors.gun.parent).toBe(arm.hand);
  expect(actors.gun.userData.muzzleError).toBeLessThan(.015);
  expect(arm.diagnostics.requestedDistance).toBeLessThanOrEqual(.513);
  expect(arm.diagnostics.relocateRequired).toBe(false);expect(arm.diagnostics.wristLimited).toBe(false);
  expect(world(arm.forearm).distanceTo(world(arm.hand))).toBeCloseTo(HUMAN.forearm,7);
  const wrist=world(arm.hand).project(camera),barrel=muzzle().project(camera);
  expect(wrist.x).toBeLessThan(-1);expect(barrel.x).toBeLessThan(-.9);expect(actors.gun.scale.toArray()).toEqual([1,1,1]);
  actors.gun.traverse(o=>{if(o instanceof THREE.Mesh&&o.layers.test(camera.layers))expect(/Hollow .38 barrel|muzzle|Muzzle|Barrel front sight|Sight highlight/.test(o.name),o.name).toBe(true);});
  expect(arm.lowerMesh.layers.test(camera.layers)).toBe(false);
  expect(Math.abs(barrel.x)).toBeLessThan(1);expect(Math.abs(barrel.y)).toBeLessThan(1);
  expect(Math.abs(arm.forearm.rotation.x)).toBeGreaterThan(.05);expect(Math.abs(arm.forearm.rotation.x)).toBeLessThanOrEqual(HUMAN.elbowFlexLimit);expect(world(arm.shoulder).distanceTo(world(arm.forearm))).toBeCloseTo(HUMAN.upperArm,7);
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
