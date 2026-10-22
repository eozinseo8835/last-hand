import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Batch immutable geometry without changing its material, shading, or local placement.
 * Animated groups can use this within a limb, while their parent keeps its animation.
 */
export function mergeStaticMeshes(root: THREE.Object3D, include: (mesh: THREE.Mesh) => boolean = () => true): void {
  root.updateWorldMatrix(true, true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const batches = new Map<string, THREE.Mesh[]>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || !include(object)) return;
    const attributes = Object.keys(object.geometry.attributes).sort().join(',');
    const key = `${object.material.id}:${object.castShadow}:${object.receiveShadow}:${!!object.geometry.index}:${attributes}:${object.renderOrder}`;
    const batch = batches.get(key) ?? [];
    batch.push(object); batches.set(key, batch);
  });
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(mesh => {
      const transform = new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld);
      const geometry = mesh.geometry.clone().applyMatrix4(transform);
      // Reflection changes winding. Retain outward faces when a mirrored prop is batched.
      if (transform.determinant() < 0) {
        const index = geometry.index;
        if (index) {
          for (let i = 0; i < index.count; i += 3) {
            const value = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, value);
          }
        } else {
          for (const attribute of Object.values(geometry.attributes)) {
            if (!(attribute instanceof THREE.BufferAttribute)) continue;
            for (let i = 0; i < attribute.count; i += 3) for (let c = 0; c < attribute.itemSize; c++) {
              const a = (i + 1) * attribute.itemSize + c, b = (i + 2) * attribute.itemSize + c;
              const value = attribute.array[a]; attribute.array[a] = attribute.array[b]; attribute.array[b] = value;
            }
          }
        }
      }
      return geometry;
    });
    const geometry = mergeGeometries(parts, false);
    parts.forEach(part => part.dispose());
    if (!geometry) continue;
    const first = meshes[0], merged = new THREE.Mesh(geometry, first.material);
    merged.castShadow = first.castShadow;
    merged.receiveShadow = first.receiveShadow;
    merged.renderOrder = first.renderOrder;
    merged.name = `Batched ${meshes.length} static surfaces`;
    root.add(merged);
    const oldGeometries = new Set<THREE.BufferGeometry>();
    for (const mesh of meshes) { mesh.removeFromParent(); oldGeometries.add(mesh.geometry); }
    oldGeometries.forEach(old => old.dispose());
  }
}
