'use client';

import {useEffect,useState} from 'react';
import type {CSSProperties,RefObject} from 'react';
import {createPortal} from 'react-dom';
import type {WalletCredit} from '@/lib/game/result-view';

type Props={credit:WalletCredit;balance:number;wallet:RefObject<HTMLButtonElement|null>;origin:RefObject<HTMLDivElement|null>;fallback:RefObject<HTMLDivElement|null>;onComplete:()=>void};
type Geometry={x:number;y:number;left:number;top:number;width:number;height:number;targetX:number;targetY:number;reduced:boolean};

export function WalletCelebration({credit,balance,wallet,origin,fallback,onComplete}:Props){
 const [geometry,setGeometry]=useState<Geometry|null>(null);
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>;
  const frame=requestAnimationFrame(()=>{
   const target=wallet.current?.getBoundingClientRect();
   if(!target){onComplete();return;}
   const from=(origin.current??fallback.current)?.getBoundingClientRect();
   const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   setGeometry({x:from?from.left+from.width/2:window.innerWidth/2,y:from?from.top+from.height/2:window.innerHeight/2,left:target.left,top:target.top,width:target.width,height:target.height,targetX:target.right-20,targetY:target.top+target.height/2,reduced});
   timer=setTimeout(onComplete,reduced?500:1150);
  });
  const stop=()=>onComplete();window.addEventListener('resize',stop);window.addEventListener('scroll',stop,{passive:true});
  return()=>{cancelAnimationFrame(frame);clearTimeout(timer);window.removeEventListener('resize',stop);window.removeEventListener('scroll',stop);};
 },[credit.id,wallet,origin,fallback,onComplete]);
 if(!geometry)return null;
 const g=geometry;
 return createPortal(<div className={`wallet-flight-layer ${g.reduced?'wallet-flight-reduced':''}`} aria-hidden="true" data-testid="wallet-celebration">
  <div className="wallet wallet-flight-target" style={{left:g.left,top:g.top,width:g.width,height:g.height}}><span>{new Intl.NumberFormat('ru-RU').format(balance)}</span><img src="/assets/coin.png" alt="" width={43} height={43} className="coin"/></div>
  {!g.reduced&&Array.from({length:10},(_,i)=>{
   const x=g.x-15+(i%5-2)*13,y=g.y-15+Math.floor(i/5)*14;
   const style={'--coin-x':`${x}px`,'--coin-y':`${y}px`,'--coin-mid-x':`${(x+g.targetX)/2+(i%2?35:-35)}px`,'--coin-mid-y':`${Math.max(16,(y+g.targetY)/2-65-i%3*9)}px`,'--coin-end-x':`${g.targetX-15}px`,'--coin-end-y':`${g.targetY-15}px`,animationDelay:`${i*24}ms`} as CSSProperties;
   return <img className="wallet-flying-coin" src="/assets/coin.png" alt="" width={30} height={30} style={style} key={i}/>;
  })}
  {!g.reduced&&Array.from({length:14},(_,i)=><i key={i} className="win-confetti" style={{'--confetti-x':`${(i%2?1:-1)*(45+i*9)}px`,'--confetti-y':`${-130+(i%5)*66}px`,'--confetti-rotation':`${i*73}deg`,'--confetti-color':['#ffd56a','#ef293d','#fff2c5'][i%3],'--delay':`${i%4*25}ms`} as CSSProperties}/>)}
  <span className="wallet-credit-label" style={{left:g.left+g.width/2,top:g.top+g.height+8}}>+{new Intl.NumberFormat('ru-RU').format(credit.amount)}</span>
 </div>,document.body);
}
