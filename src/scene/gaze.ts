import * as THREE from 'three';
import type {HumanRig} from './skeleton';
/** Targets are world positions; authored body/limb poses remain untouched. */
export function lookAtTarget(rig:HumanRig,target:THREE.Vector3,dt:number,bob=0){
 rig.group.updateWorldMatrix(true,true);const origin=rig.head.getWorldPosition(new THREE.Vector3()),q=rig.chest.getWorldQuaternion(new THREE.Quaternion()).invert();const v=target.clone().sub(origin).applyQuaternion(q);
 const yaw=THREE.MathUtils.clamp(Math.atan2(v.x,v.z),-70*Math.PI/180,70*Math.PI/180),pitch=THREE.MathUtils.clamp(-Math.atan2(v.y,Math.hypot(v.x,v.z)),-Math.PI/6,Math.PI/6);
 const data=rig.group.userData,a=1-Math.exp(-Math.max(0,dt)*8);data.gazeYaw=THREE.MathUtils.lerp(data.gazeYaw??0,yaw,a);data.gazePitch=THREE.MathUtils.lerp(data.gazePitch??0,pitch,a);
 rig.chest.rotation.y+=data.gazeYaw*.025;
 rig.neck.rotation.set(data.gazePitch*.2,data.gazeYaw*.2,0);rig.head.rotation.set(data.gazePitch*.8+bob,data.gazeYaw*.8,0);data.gazeTarget=target.toArray();
}
