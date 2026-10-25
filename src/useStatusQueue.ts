import {useEffect,useState} from 'react';
import {STATUS_HOLD_MS} from './readability';
/** A display queue; its clock never delays controls, cards or chamber logic. */
export function useStatusQueue(message:string,reset:boolean){
 const [state,setState]=useState({visible:'',queue:[] as string[],until:0});
 useEffect(()=>{setState(previous=>{
   if(reset)return previous.visible||previous.queue.length?{visible:'',queue:[],until:0}:previous;
   if(!message||message===previous.visible||message===previous.queue.at(-1))return previous;
   return previous.visible?{...previous,queue:[...previous.queue,message]}:{visible:message,queue:[],until:Date.now()+STATUS_HOLD_MS};
 });},[message,reset]);
 useEffect(()=>{if(!state.visible)return;const timer=setTimeout(()=>setState(previous=>({visible:previous.queue[0]??'',queue:previous.queue.slice(1),until:Date.now()+STATUS_HOLD_MS})),Math.max(0,state.until-Date.now()));return()=>clearTimeout(timer);},[state.visible,state.until]);
 return state.visible;
}
