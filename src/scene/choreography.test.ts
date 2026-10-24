import {describe,expect,it} from 'vitest';
import {Vector3} from 'three';
import {routePoint} from './choreography';
const point=(x:number,z:number)=>new Vector3(x,.86,z);
describe('walking around the table',()=>{
 it('keeps guard and Host walking bodies outside the tabletop on every segment',()=>{
  const routes=[
   [point(2.7,-3.7),point(2.15,-1.65),point(2.15,1.72),point(.55,1.72)],
   [point(.55,1.72),point(2.15,1.72),point(2.15,-1.65),point(.74,-1.6)],
   [point(-.7,-1.65),point(-2.1,-1.65),point(-2.1,1.55),point(-.6,1.55)],
  ];
  for(const route of routes) for(let frame=0;frame<=200;frame++) {
   const p=routePoint(route,frame/200);
   expect(Math.abs(p.x)>2||p.z>1.45||p.z< -1.45).toBe(true);
   expect(p.y).toBe(.86);
  }
 });
 it('clamps both endpoints and maintains continuous travel through each corner',()=>{
  const route=[point(2.7,-3.7),point(2.15,-1.65),point(2.15,1.72)];
  expect(routePoint(route,-1).equals(route[0])).toBe(true);
  expect(routePoint(route,2).distanceTo(route.at(-1)!)).toBeLessThan(1e-9);
  for(let i=0;i<1000;i++) expect(routePoint(route,i/1000).distanceTo(routePoint(route,(i+1)/1000))).toBeLessThan(.01);
 });
});
