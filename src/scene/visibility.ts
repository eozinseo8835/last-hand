import * as THREE from 'three';
const hidden=new WeakMap<THREE.Object3D,number>();
/** Only the seated camera loses these meshes; the real ceiling feed keeps them. */
export function restoreNearCameraHiding(root:THREE.Object3D) {
 root.traverse(object=>{const mask=hidden.get(object);if(mask!==undefined){object.layers.mask=mask;hidden.delete(object);delete object.userData.nearHidden;}});
}
export function applyNearCameraHiding(root:THREE.Object3D,camera:THREE.Camera,active:boolean,allowed:THREE.Object3D[]=[]){
 const eye=camera.getWorldPosition(new THREE.Vector3()),allowedMeshes=new Set<THREE.Object3D>();
 allowed.forEach(bone=>bone.traverse(object=>allowedMeshes.add(object)));
 root.updateWorldMatrix(true,true);
 root.traverse(object=>{
  if(!(object instanceof THREE.Mesh))return;
  const bounds=new THREE.Box3().setFromObject(object),distance=bounds.distanceToPoint(eye);
  const cutoff=active&&!allowedMeshes.has(object)?.35:('near' in camera?Number(camera.near):.055);
  if(distance>=cutoff)return;
  hidden.set(object,object.layers.mask); object.layers.disable(0);object.layers.enable(1);object.userData.nearHidden=true;
 });
}
