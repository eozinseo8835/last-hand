import * as THREE from 'three';
/** Rounded sack with four baked fabric shapes; no rigid cone or mesh scaling. */
export function createBurlapHood(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const c=canvas.getContext('2d')!;
 c.fillStyle='#776447';c.fillRect(0,0,64,64);
 for(let i=0;i<64;i+=2){c.fillStyle=i%4?'#655539':'#927b55';c.fillRect(i,0,1,64);c.fillRect(0,i,64,1);}
 const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4,3);
 const material=new THREE.MeshStandardMaterial({map:texture,color:0xb5a17d,roughness:1,side:THREE.DoubleSide});
 const points=[new THREE.Vector2(.062,-.165),new THREE.Vector2(.10,-.13),new THREE.Vector2(.119,-.065),new THREE.Vector2(.120,.025),new THREE.Vector2(.109,.095),new THREE.Vector2(.075,.122),new THREE.Vector2(.032,.120),new THREE.Vector2(.001,.111)];
 const geometry=new THREE.LatheGeometry(points,20);const original=geometry.attributes.position.clone();
 for(let i=0;i<original.count;i++){const x=original.getX(i),y=original.getY(i),z=original.getZ(i),a=Math.atan2(z,x);const wrinkle=1+.045*Math.sin(a*9+y*35)+.025*Math.cos(a*13-y*40);original.setXYZ(i,x*wrinkle,y,z*wrinkle);}
 geometry.setAttribute('position',original.clone());geometry.morphAttributes.position=[0,.33,.67,1].slice(1).map(p=>{const a=original.clone();for(let i=0;i<a.count;i++){const y=original.getY(i),t=(y+.165)/.29; a.setXYZ(i,original.getX(i)*(1-.27*p),y+p*(.22+.15*t),original.getZ(i)*(1-.27*p));}return a;});
 const sack=new THREE.Mesh(geometry,material);sack.name='Soft burlap sack';sack.castShadow=true;
 const group=new THREE.Group();group.name='Captive kidnapping hood';group.add(sack);
 const cord=new THREE.Mesh(new THREE.TorusGeometry(.064,.003,5,24),new THREE.MeshStandardMaterial({color:0xa18c62,roughness:1}));cord.rotation.x=Math.PI/2;cord.position.y=-.16;group.add(cord);
 const update=(progress:number)=>{const p=THREE.MathUtils.clamp(progress,0,1),v=p*3;sack.morphTargetInfluences!.fill(0);if(v<=1)sack.morphTargetInfluences![0]=v;else if(v<=2){sack.morphTargetInfluences![0]=2-v;sack.morphTargetInfluences![1]=v-1;}else{sack.morphTargetInfluences![1]=3-v;sack.morphTargetInfluences![2]=v-2;}cord.position.y=-.16+p*.22;group.visible=p<.995;group.userData.removal=p;};
 update(0);return {group,sack,update};
}
