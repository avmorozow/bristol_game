'use client';
import {forwardRef,useEffect,useImperativeHandle,useRef} from 'react';
export type TapLootHandle={burst:()=>void};
const COUNT=48;
const products=['🍎','🥛','🥖','🧀','🥫','🥕'];
export const TapLoot=forwardRef<TapLootHandle,{active:boolean}>(function TapLoot({active},ref){
 const host=useRef<HTMLDivElement>(null),cursor=useRef(0),serial=useRef(0),enabled=useRef(active);enabled.current=active;
 const stop=()=>host.current?.querySelectorAll('.loot-item').forEach(e=>e.getAnimations().forEach(a=>a.cancel()));
 useEffect(()=>{if(!active)stop();},[active]);
 useEffect(()=>()=>stop(),[]);
 useImperativeHandle(ref,()=>({burst(){
  if(!enabled.current||!host.current||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const round=serial.current++;
  // Fixed pool: each physical tap replaces ten slots, never queues an animation.
  for(let j=0;j<10;j++){
   const node=host.current.children[cursor.current++%COUNT] as HTMLElement;
   node.getAnimations().forEach(a=>a.cancel());
   const spread=Math.min(1,host.current.clientWidth/390),side=j%2?-1:1;
   const x=side*(40+((j*31+round*17)%100))*spread,up=48+((j*19+round*13)%85),spin=side*(100+j*27);
   node.animate([
    {opacity:0,transform:'translate(-50%,-50%) scale(.35) rotate(0deg)',offset:0},
    {opacity:1,transform:`translate(calc(-50% + ${x*.45}px),calc(-50% - ${up}px)) scale(1) rotate(${spin*.35}deg)`,offset:.3},
    {opacity:1,transform:`translate(calc(-50% + ${x*.8}px),calc(-50% - ${up*.3}px)) scale(.9) rotate(${spin*.7}deg)`,offset:.65},
    {opacity:0,transform:`translate(calc(-50% + ${x}px),calc(-50% + ${70+j*8}px)) scale(.55) rotate(${spin}deg)`,offset:1}
   ],{duration:660+(j%4)*65,easing:'linear'});
  }
 }}),[]);
 return <div ref={host} className="tap-loot" aria-hidden="true" data-testid="tap-loot">{Array.from({length:COUNT},(_,i)=><span key={i} className={`loot-item ${i%3===0?'loot-coin':'loot-product'}`}>{i%3===0?<img src="/assets/coin.png" alt=""/>:products[Math.floor(i*2/3)%products.length]}</span>)}</div>;
});
