import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRevolverModel, GRIP_LOCAL, GRIP_SOCKET, MUZZLE_LOCAL, REVOLVER_DIMENSIONS } from './revolver';
import { boundsOverlap, cardBounds, GUN_BOUNDS, GUN_PICKUP, GUN_REST, TABLE_HALF_DEPTH, TABLE_HALF_WIDTH } from '../tableLayout';

describe('one real-scale procedural .38 revolver', () => {
  it('has a readable complete silhouette in one hand-sized model', () => {
    const {gun,hammer,cylinder,trigger,muzzlePoint,gripPoint}=createRevolverModel();
    const bounds=new THREE.Box3().setFromObject(gun),size=bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(.26); expect(size.x).toBeLessThan(.29);
    expect(REVOLVER_DIMENSIONS.barrelLength/REVOLVER_DIMENSIONS.cylinderLength).toBeCloseTo(1.3);
    for(const name of ['Hollow .38 barrel','Barrel front sight','Six chamber cylinder body','Curved wooden grip','Ring trigger guard','Curved trigger','Hammer spur']) expect(gun.getObjectByName(name)).toBeDefined();
    expect(hammer.parent).toBe(gun); expect(cylinder.parent).toBe(gun); expect(trigger.parent).toBe(gun);
    expect(muzzlePoint.position.toArray()).toEqual([...MUZZLE_LOCAL]); expect(gripPoint.position.toArray()).toEqual([...GRIP_LOCAL]);
    expect(gun.userData.modelId).toBe('procedural-38');
  });
  it('shows six individual chamber holes on both ends and uses visible gunmetal and walnut',()=>{
    const {gun,cylinder}=createRevolverModel(); const holes: THREE.Object3D[]=[];
    cylinder.traverse(object=>{if(object.userData.chamberHole)holes.push(object);});
    expect(holes).toHaveLength(12);
    expect(new Set(holes.map(hole=>hole.userData.chamberHole)).size).toBe(6);
    const wood=gun.getObjectByName('Curved wooden grip') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
    expect(wood.material.color.r).toBeGreaterThan(wood.material.color.g);
    expect(wood.material.emissiveIntensity).toBeGreaterThan(0);
    const barrel=gun.getObjectByName('Hollow .38 barrel') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
    expect(barrel.material.metalness).toBeGreaterThan(.4); expect(barrel.material.roughness).toBeLessThan(.4);
  });
  it('binds the actual wood grip into the palm and never rescales during mechanical motion',()=>{
    const {gun,cylinder,hammer}=createRevolverModel(),hand=new THREE.Group(); hand.add(gun);
    gun.position.set(...GRIP_SOCKET.position);gun.quaternion.set(...GRIP_SOCKET.quaternion);
    const grip=gun.localToWorld(new THREE.Vector3(...GRIP_LOCAL));
    expect(grip.distanceTo(new THREE.Vector3(0,.010,.053))).toBeLessThan(1e-9);
    for(let frame=0;frame<=100;frame++){
      cylinder.rotation.x=frame*Math.PI/30;hammer.rotation.z=-frame/200;
      gun.traverse(object=>expect(object.scale.toArray()).toEqual([1,1,1]));
    }
  });
});
describe('central revolver and clear table layout',()=>{
  it('never overlaps either complete showdown card grid at rest',()=>{
    for(let playerCount=1;playerCount<=11;playerCount++)for(let aiCount=1;aiCount<=11;aiCount++){
      const cards=[...Array.from({length:playerCount},(_,i)=>cardBounds('player',i,playerCount)),...Array.from({length:aiCount},(_,i)=>cardBounds('ai',i,aiCount))];
      for(const card of cards)expect(boundsOverlap(card,GUN_BOUNDS)).toBe(false);

    }
  });
  it('fits all card corners on the table and shares one center contact for all shooters',()=>{
    for(const owner of ['player','ai'] as const)for(let count=1;count<=11;count++)for(let i=0;i<count;i++){
      const b=cardBounds(owner,i,count);expect(Math.abs(b.minX)).toBeLessThan(TABLE_HALF_WIDTH);expect(Math.abs(b.maxX)).toBeLessThan(TABLE_HALF_WIDTH);
      expect(Math.abs(b.minZ)).toBeLessThan(TABLE_HALF_DEPTH);expect(Math.abs(b.maxZ)).toBeLessThan(TABLE_HALF_DEPTH);
    }
    expect(GUN_PICKUP.ai).toEqual(GUN_REST);expect(GUN_PICKUP.player).toEqual(GUN_REST);
  });
});
