'use client';
import {useEffect,useRef,useState} from 'react';
import {nextTaunt,type TauntMemory} from '@/lib/game/squirrel-taunts';
export function SquirrelTaunt({attemptId,tap,active,avatar}:{attemptId?:string;tap:number;active:boolean;avatar:string}){
 const [text,setText]=useState('');const memory=useRef<TauntMemory>({attemptId:'',count:0,lastAt:0}),lastTap=useRef(tap),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{
  if(memory.current.attemptId!==attemptId){
   if(timer.current)clearTimeout(timer.current);timer.current=null;
   memory.current={attemptId:attemptId??'',count:0,lastAt:0};lastTap.current=tap;setText('');
   try{const saved=JSON.parse(sessionStorage.getItem('bristol-taunts')??'null');if(saved?.attemptId===attemptId&&Number.isInteger(saved.count)&&saved.count>=0&&saved.count<=4&&Number.isFinite(saved.lastAt))memory.current=saved;}catch{}
   return;
  }
  const advanced=tap>lastTap.current;lastTap.current=tap;
  if(!active){setText('');if(timer.current)clearTimeout(timer.current);return;}
  if(!advanced||text)return;
  const next=nextTaunt(memory.current,tap,Date.now());if(!next)return;
  memory.current=next.memory;try{sessionStorage.setItem('bristol-taunts',JSON.stringify(next.memory));}catch{}
  setText(next.text);timer.current=setTimeout(()=>{setText('');timer.current=null;},2600);
 },[attemptId,tap,active,text]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 if(!active||!text)return null;
 return <aside className="squirrel-taunt" aria-label="Выкрик белки" data-testid="squirrel-taunt"><span className="taunt-avatar">{avatar?<img src={avatar} alt=""/>:'🐿'}</span><div><span className="taunt-speaker">Белка</span><p>{text}</p></div></aside>;
}
