'use client';
import {useEffect,useRef,useState} from 'react';
export function OriginalSquirrel({home,attemptId,boosterUsed}:{home:boolean;attemptId?:string;boosterUsed?:boolean}){
 const [retreat,setRetreat]=useState(false),previous=useRef({attemptId,boosterUsed});
 useEffect(()=>{const before=previous.current;previous.current={attemptId,boosterUsed};if(before.attemptId===attemptId&&!before.boosterUsed&&boosterUsed){setRetreat(true);const timer=setTimeout(()=>setRetreat(false),700);return()=>clearTimeout(timer);}setRetreat(false);},[attemptId,boosterUsed]);
 if(home||!retreat)return null;
 return <div className={`original-squirrel-scene ${retreat?'original-squirrel-retreat':''}`} aria-hidden="true"><div className="original-squirrel-crop"><img src="/assets/thief.png" alt=""/></div></div>;
}
