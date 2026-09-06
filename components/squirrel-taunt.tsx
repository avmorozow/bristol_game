'use client';
import {useEffect,useRef,useState} from 'react';
import {nextTaunt,nextIdleTaunt,IDLE_HINT_DELAY,type TauntMemory} from '@/lib/game/squirrel-taunts';
export function SquirrelTaunt({attemptId,tap,active}:{attemptId?:string;tap:number;active:boolean}){
 const [text,setText]=useState(''),[leaving,setLeaving]=useState(false);
 const idleMessage=useRef(false),visibleText=useRef(text);visibleText.current=text;
 const memory=useRef<TauntMemory>({attemptId:'',count:0,lastAt:0}),lastTap=useRef(tap);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),removeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clear=()=>{if(timer.current)clearTimeout(timer.current);if(removeTimer.current)clearTimeout(removeTimer.current);timer.current=null;removeTimer.current=null;};
 const leave=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;setLeaving(true);if(!removeTimer.current)removeTimer.current=setTimeout(()=>{setText('');setLeaving(false);removeTimer.current=null;},400);};
 useEffect(()=>{
  if(memory.current.attemptId!==attemptId){
   clear();idleMessage.current=false;memory.current={attemptId:attemptId??'',count:0,lastAt:0};lastTap.current=tap;setText('');setLeaving(false);
   try{const saved=JSON.parse(sessionStorage.getItem('bristol-taunts')??'null');if(saved?.attemptId===attemptId&&Number.isInteger(saved.count)&&saved.count>=0&&saved.count<=4&&Number.isFinite(saved.lastAt))memory.current=saved;}catch{}
   return;
  }
  const advanced=tap>lastTap.current;lastTap.current=tap;
  if(!active){if(text&&!leaving)leave();return;}
  if(advanced&&text&&idleMessage.current){leave();return;}
  if(!advanced||text)return;
  const next=nextTaunt(memory.current,tap,Date.now());if(!next)return;
  memory.current=next.memory;try{sessionStorage.setItem('bristol-taunts',JSON.stringify(next.memory));}catch{}
  idleMessage.current=false;setLeaving(false);setText(next.text);timer.current=setTimeout(leave,2400);
 },[attemptId,tap,active,text,leaving]);
 useEffect(()=>{
  if(!active||!attemptId)return;
  const lastActivityAt=Date.now();
  const idleTimer=setTimeout(()=>{
   if(document.hidden||visibleText.current||memory.current.attemptId!==attemptId)return;
   const next=nextIdleTaunt(memory.current,Date.now(),lastActivityAt);if(!next)return;
   memory.current=next.memory;try{sessionStorage.setItem('bristol-taunts',JSON.stringify(next.memory));}catch{}
   idleMessage.current=true;setLeaving(false);setText(next.text);timer.current=setTimeout(leave,4000);
  },IDLE_HINT_DELAY);
  return()=>clearTimeout(idleTimer);
 },[attemptId,tap,active]);
 useEffect(()=>clear,[]);
 if(!text)return null;
 return <aside className={`squirrel-taunt ${leaving?'taunt-leaving':''}`} onAnimationEnd={e=>{if(e.target!==e.currentTarget||!leaving)return;if(removeTimer.current)clearTimeout(removeTimer.current);removeTimer.current=null;setText('');setLeaving(false);}} aria-label="Выкрик белки" aria-live="polite" data-testid="squirrel-taunt" data-leaving={leaving}><span className="taunt-avatar original-avatar"><img src="/assets/thief.png" alt=""/></span><div><span className="taunt-speaker">Белка</span><p>{text}</p></div></aside>;
}
