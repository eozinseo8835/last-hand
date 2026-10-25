import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCharacter, type CharacterRole } from './skeleton';
import { HUMAN, POSE_NAMES, type PoseName } from './poses';
import { createRevolverModel, GRIP_SOCKET } from './revolver';
const pos=(o:THREE.Object3D)=>o.getWorldPosition(new THREE.Vector3());
const roles:CharacterRole[]=['captive','host','guard','player'];
function jointBinds(root:THREE.Object3D) { const binds=new Map<THREE.Object3D,THREE.Vector3>();root.traverse(o=>{if(o.userData.bindPosition)binds.set(o,o.position.clone());});return binds; }
function verifyGeometry(rig:ReturnType<typeof createCharacter>) {
 rig.group.updateMatrixWorld(true);
 for(const arm of Object.values(rig.arms)) {
  expect(pos(arm.shoulder).distanceTo(pos(arm.forearm))).toBeCloseTo(HUMAN.upperArm,9);
  expect(pos(arm.forearm).distanceTo(pos(arm.hand))).toBeCloseTo(HUMAN.forearm,9);
  expect(Math.abs(arm.forearm.rotation.x)).toBeLessThanOrEqual(HUMAN.elbowFlexLimit+1e-8);
  expect(Math.abs(arm.forearm.userData.pronation??0)).toBeLessThanOrEqual(Math.PI/2);
  for(const angle of arm.hand.userData.wristAngles as number[])expect(Math.abs(angle)).toBeLessThanOrEqual(HUMAN.wristLimit+1e-8);
 }
 for(const leg of Object.values(rig.legs)) {
  expect(pos(leg.thigh).distanceTo(pos(leg.shin))).toBeCloseTo(HUMAN.thigh,9);
  expect(pos(leg.shin).distanceTo(pos(leg.foot))).toBeCloseTo(HUMAN.shin,9);
 }
 rig.group.traverse(o=>expect(o.scale.toArray(),o.name).toEqual([1,1,1]));
}

describe('authored human skeleton hierarchy',()=>{
 it.each(roles)('uses an actual nested joint hierarchy and fixed authored offsets for %s',role=>{
  const rig=createCharacter(role),binds=jointBinds(rig.group);
  expect(rig.spine.parent).toBe(rig.pelvis);expect(rig.chest.parent).toBe(rig.spine);expect(rig.neck.parent).toBe(rig.chest);expect(rig.head.parent).toBe(rig.neck);
  for(const arm of Object.values(rig.arms)) {
   expect(arm.upper.parent).toBe(arm.shoulder);expect(arm.forearm.parent).toBe(arm.upper);expect(arm.hand.parent).toBe(arm.forearm);
   expect(arm.fingers).toHaveLength(4);expect(arm.thumb).toHaveLength(2);
   for(const chain of arm.fingers){expect(chain).toHaveLength(3);expect(chain[1].parent).toBe(chain[0]);expect(chain[2].parent).toBe(chain[1]);}
  }
  for(const name of POSE_NAMES)for(const t of [0,.35,1.35,6.9]){
   rig.pose(name,t);verifyGeometry(rig);
   for(const [bone,offset] of binds)expect(bone.position.toArray(),`${name}: ${bone.name}`).toEqual(offset.toArray());
  }
 });
 it('rests with relaxed elbows below the shoulders, near the torso, and palms flat on the felt',()=>{
  const rig=createCharacter('captive');rig.group.position.y=HUMAN.seatHeight;rig.pose('seated-resting');
  const wrists=[];
  for(const arm of Object.values(rig.arms)){
   const d=arm.diagnostics;
   expect(d.elbow.y).toBeLessThan(d.shoulder.y-.20);expect(d.elbowAngle).toBeGreaterThanOrEqual(80);expect(d.elbowAngle).toBeLessThanOrEqual(110);
   expect(Math.abs(d.elbow.x)-.17).toBeGreaterThanOrEqual(.05);expect(Math.abs(d.elbow.x)-.17).toBeLessThanOrEqual(.12);
   const normal=new THREE.Vector3(0,1,0).transformDirection(arm.hand.matrixWorld);expect(normal.y).toBeCloseTo(1,7);
   expect(pos(arm.hand).y-.014).toBeCloseTo(HUMAN.tableHeight,2);expect(d.wristLimited).toBe(false);wrists.push(pos(arm.hand));
  }
  expect(wrists[0].distanceTo(wrists[1])).toBeGreaterThanOrEqual(.15);expect(wrists[0].distanceTo(wrists[1])).toBeLessThanOrEqual(.25);
  for(const leg of Object.values(rig.legs)){expect(pos(leg.thigh).y).toBeCloseTo(pos(leg.shin).y);expect(pos(leg.foot).y).toBeCloseTo(0,8);}
 });
 it('keeps every authored hand target inside 90 percent reach without silently capping it',()=>{
  for(const role of roles){const rig=createCharacter(role);for(const name of POSE_NAMES){rig.pose(name,1.35);for(const arm of Object.values(rig.arms)){
   expect(arm.diagnostics.relocateRequired,`${role}/${name}`).toBe(false);expect(arm.diagnostics.targetDistance).toBeLessThanOrEqual(HUMAN.reachRatio*(HUMAN.upperArm+HUMAN.forearm)+1e-8);
   expect(arm.diagnostics.requestedDistance).toBeCloseTo(arm.diagnostics.targetDistance,8);
  }}}
 });
 it('leans within 25 degrees and requests object relocation when the target remains too far',()=>{
  const rig=createCharacter('captive');rig.pose('seated-resting');
  const d=rig.solveHand('right',new THREE.Vector3(2,.3,3));
  expect(d.relocateRequired).toBe(true);expect(d.requestedDistance).toBeGreaterThan(d.reachLimit);expect(d.targetDistance).toBeLessThanOrEqual(d.reachLimit+1e-8);
  expect(Math.abs(rig.spine.rotation.x)).toBeLessThanOrEqual(HUMAN.leanLimit);expect(Math.abs(rig.spine.rotation.z)).toBeLessThanOrEqual(HUMAN.leanLimit);verifyGeometry(rig);
 });
 it('keeps the shared gun palm-mounted with its muzzle touching the temple in the numeric self-shot pose',()=>{
  const rig=createCharacter('captive'),model=createRevolverModel();rig.group.position.y=.45;rig.pose('self-shot');
  rig.arms.right.hand.add(model.gun);model.gun.position.set(...GRIP_SOCKET.position);model.gun.quaternion.set(...GRIP_SOCKET.quaternion);rig.group.updateMatrixWorld(true);
  const temple=rig.head.localToWorld(new THREE.Vector3(.09,0,0));
  expect(model.muzzlePoint.getWorldPosition(new THREE.Vector3()).distanceTo(temple)).toBeLessThan(1e-7);
  expect(rig.arms.right.diagnostics.wristLimited).toBe(false);expect(rig.arms.right.diagnostics.relocateRequired).toBe(false);verifyGeometry(rig);
 });
 it('keeps walking arms opposite the same-side thighs and keeps planted standing feet flat after a crouch',()=>{
  const rig=createCharacter('guard');rig.pose('guard-walking',.21);
  expect(Math.sign(rig.arms.left.upper.rotation.x-rig.arms.right.upper.rotation.x)).not.toBe(Math.sign(rig.legs.left.thigh.rotation.x-rig.legs.right.thigh.rotation.x));
  rig.pose('host-idle');rig.crouch(.15);verifyGeometry(rig);
  for(const leg of Object.values(rig.legs))expect(pos(leg.foot).y).toBeCloseTo(0,7);
 });
});

it('overlaps the neck skin with the chest and skull instead of leaving a floating head',()=>{
 for(const role of ['host','captive','guard'] as const){
  const rig=createCharacter(role);rig.pose(role==='host'?'host-idle':'seated-resting');rig.group.updateWorldMatrix(true);
  const neck=new THREE.Box3().setFromObject(rig.group.getObjectByName('Neck skin')!);
  const torso=new THREE.Box3().setFromObject(rig.group.getObjectByName('Chest clothing')!);
  const skull=new THREE.Box3().setFromObject(rig.group.getObjectByName('Cranium')!);
  expect(neck.min.y).toBeLessThan(torso.max.y);expect(neck.max.y).toBeGreaterThan(skull.min.y);
 }
});
