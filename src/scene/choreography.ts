import { Vector3, MathUtils } from 'three';
/** Distance-weighted waypoints keep walking bodies outside the opaque table. */
export function routePoint(points: readonly Vector3[], progress: number): Vector3 {
  const lengths=points.slice(1).map((point,index)=>point.distanceTo(points[index]));
  let distance=MathUtils.clamp(progress,0,1)*lengths.reduce((sum,n)=>sum+n,0);
  for(let index=0;index<lengths.length;index++) {
    if(distance<=lengths[index]||index===lengths.length-1) return points[index].clone().lerp(points[index+1],lengths[index]?distance/lengths[index]:0);
    distance-=lengths[index];
  }
  return points[0].clone();
}
