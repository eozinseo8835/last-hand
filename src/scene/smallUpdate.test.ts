// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {createBurlapHood} from './hood';
import {createCharacter} from './skeleton';
import {POSE_NAMES} from './poses';
it('keeps every digit in the one-way 90 degree curl envelope',()=>{
 for(const role of ['host','captive','guard','player'] as const){const r=createCharacter(role);for(const pose of POSE_NAMES){r.pose(pose,1);r.constrainFingers();for(const a of Object.values(r.arms))for(const chain of [...a.fingers,a.thumb])for(const d of chain){expect(-d.rotation.x).toBeGreaterThanOrEqual(0);expect(-d.rotation.x).toBeLessThanOrEqual(Math.PI/2);}}}
});
it('uses a broad sagged crown and blends three fabric targets during removal',()=>{
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({fillRect(){}} as unknown as CanvasRenderingContext2D);
 const h=createBurlapHood(),v=new THREE.Vector3();
 expect(h.sack.geometry.type).toBe('LatheGeometry');expect(h.sack.geometry.morphAttributes.position).toHaveLength(3);
 let top=-Infinity,width=0;for(let i=0;i<h.sack.geometry.attributes.position.count;i++){h.sack.getVertexPosition(i,v);top=Math.max(top,v.y);width=Math.max(width,Math.abs(v.x));}
 expect(top).toBeLessThan(.115*1.15);expect(width).toBeGreaterThan(.115);
 h.update(.5);expect(h.group.visible).toBe(true);expect(h.sack.morphTargetInfluences!.filter(x=>x>0)).toHaveLength(2);
 h.update(1);expect(h.group.visible).toBe(false);vi.restoreAllMocks();
});
