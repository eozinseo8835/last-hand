import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { mergeStaticMeshes } from './merge';

describe('static scene batching', () => {
  it('preserves nested geometry placement relative to an animated parent', () => {
    const world = new THREE.Scene(), root = new THREE.Group(), limb = new THREE.Group();
    world.add(root); root.position.set(2, 3, 4); root.rotation.y = .4;
    root.add(limb); limb.position.set(.5, .3, .2); limb.rotation.z = .25;
    const material = new THREE.MeshStandardMaterial();
    for (const x of [-.4, .4]) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(.2, .3, .1), material); mesh.position.x = x; limb.add(mesh); }
    root.updateWorldMatrix(true, true);
    const before = new THREE.Box3().setFromObject(root);
    mergeStaticMeshes(root);
    root.updateWorldMatrix(true, true);
    const after = new THREE.Box3().setFromObject(root);
    expect(after.min.distanceTo(before.min)).toBeLessThan(.02);
    expect(after.max.distanceTo(before.max)).toBeLessThan(.02);
    let count = 0; root.traverse(node => { if (node instanceof THREE.Mesh) count++; });
    expect(count).toBe(1);
  });
  it('keeps excluded animated meshes and different shadow/material flags separate', () => {
    const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
    const animated = new THREE.Mesh(new THREE.BoxGeometry(), material); root.add(animated);
    const normal = new THREE.Mesh(new THREE.BoxGeometry(), material); root.add(normal);
    const shadow = new THREE.Mesh(new THREE.BoxGeometry(), material); shadow.castShadow = true; root.add(shadow);
    mergeStaticMeshes(root, mesh => mesh !== animated);
    expect(animated.parent).toBe(root);
    expect(normal.parent).toBe(root);
    expect(shadow.parent).toBe(root);
  });
  it('keeps different materials separate even with a deterministic random source', () => {
    const root = new THREE.Group();
    const random = vi.spyOn(Math, 'random').mockReturnValue(.5);
    const felt = new THREE.MeshStandardMaterial({ color: 'green' });
    const wood = new THREE.MeshStandardMaterial({ color: 'brown' });
    random.mockRestore();
    // Procedural render tests can intentionally replace Math.random.
    expect(wood.uuid).toBe(felt.uuid);
    for (const material of [felt, felt, wood]) root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    mergeStaticMeshes(root);
    const meshes = root.children.filter((node): node is THREE.Mesh => node instanceof THREE.Mesh);
    expect(meshes).toHaveLength(2);
    expect(meshes.map(mesh => mesh.material)).toContain(felt);
    expect(meshes.map(mesh => mesh.material)).toContain(wood);
  });

});
