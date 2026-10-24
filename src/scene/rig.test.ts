import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFixedLimb, solveTwoBone } from './rig';

describe('fixed-length human two-bone IK', () => {
  it('bends at the pole and reaches targets without changing either bone length', () => {
    const root = new THREE.Vector3(.2, 1.4, -.8), pole = new THREE.Vector3(.6, .8, -.4);
    for (let index = 0; index < 200; index++) {
      const target = new THREE.Vector3(Math.sin(index * .41) * .5, .9 + Math.cos(index * .17) * .25, -.5 + Math.sin(index * .37) * .25);
      const pose = solveTwoBone(root, target, pole, .42, .40);
      expect(pose.root.distanceTo(pose.joint)).toBeCloseTo(.42, 9);
      expect(pose.joint.distanceTo(pose.end)).toBeCloseTo(.40, 9);
      if (target.distanceTo(root) < .82 && target.distanceTo(root) > .02) expect(pose.end.distanceTo(target)).toBeLessThan(.0001);
    }
  });
  it('clamps unreachable and degenerate targets instead of stretching or producing NaNs', () => {
    for (const target of [new THREE.Vector3(), new THREE.Vector3(0, 20, 0), new THREE.Vector3(100, -10, -30)]) {
      const pose = solveTwoBone(new THREE.Vector3(), target, target, .41, .41);
      expect(pose.root.distanceTo(pose.joint)).toBeCloseTo(.41, 8);
      expect(pose.joint.distanceTo(pose.end)).toBeCloseTo(.41, 8);
      expect([...pose.joint.toArray(), ...pose.end.toArray()].every(Number.isFinite)).toBe(true);
    }
  });
  it('moves actual meshes only by translation and rotation through a full reach cycle', () => {
    const parent = new THREE.Group(), material = new THREE.MeshStandardMaterial();
    const limb = createFixedLimb(parent, .42, .40, .08, material, 'arm');
    for (let index = 0; index < 100; index++) {
      limb.update(new THREE.Vector3(.3, 1.5, 0), new THREE.Vector3(Math.sin(index) * 1.2, .4 + index / 100, .5), new THREE.Vector3(.8, .9, .5));
      parent.updateMatrixWorld(true);
      for (const [mesh, length] of [[limb.upper, .42], [limb.lower, .40]] as const) {
        expect(mesh.scale.toArray()).toEqual([1, 1, 1]);
        const a = mesh.localToWorld(new THREE.Vector3(0, -length / 2, 0));
        const b = mesh.localToWorld(new THREE.Vector3(0, length / 2, 0));
        expect(a.distanceTo(b)).toBeCloseTo(length, 7);
      }
    }
  });
});
