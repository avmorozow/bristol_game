'use client';
import {useEffect,useRef} from 'react';
import {THEFT,theftFrame} from '@/lib/game/theft-timeline';
export type TheftCue={attemptId:string;tap:number;startedAt:number};
export function SquirrelHeist({cue,variant,onDone}:{cue:TheftCue;variant:number;onDone:()=>void}){
 const host=useRef<HTMLDivElement>(null),done=useRef(onDone);done.current=onDone;
 useEffect(()=>{
  let frame=0,finished=false;
  const finish=()=>{if(finished)return;finished=true;done.current();};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
  const render=()=>{const elapsed=performance.now()-cue.startedAt;const el=host.current;if(!el)return;
   const pose=theftFrame(elapsed);el.dataset.phase=pose.phase;
   const u=Math.min(1,elapsed/THEFT.grab),ease=1-(1-u)**3,side=variant===1?-1:1;
   const run=side*(1-ease)*(window.innerWidth+220),bounce=Math.sin(u*Math.PI*6)*(1-u)*8;
   el.style.transform=`translateX(${run}px) translateY(${bounce}px)`;
   if(pose.phase==='done'){finish();return;}frame=requestAnimationFrame(render);
  };frame=requestAnimationFrame(render);
  const fallback=setTimeout(finish,Math.max(0,THEFT.finish-(performance.now()-cue.startedAt))+60);
  return()=>{cancelAnimationFrame(frame);clearTimeout(fallback);};
 },[cue,variant]);
 return <div ref={host} className="squirrel-heist" data-phase="approach" aria-hidden="true" style={{transform:`translateX(${variant===1?'-':''}150vw)`}}>
  <img className="heist-empty" src="/assets/squirrel-empty.webp" alt=""/>
  <img className="heist-carry" src="/assets/thief.png" alt=""/>
 </div>;
}
