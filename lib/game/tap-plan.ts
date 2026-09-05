import {probability,payout,type Player,type Attempt} from './engine';
/** Demo-only latency contract. Server reserves immutable outcomes before taps.
 * Clients can inspect this plan: never use this protocol for real-money prizes. */
export function reserveTapPlan(input:Player,random:()=>number):Player{
 const a=input.attempt;if(!a||!['active','loss_pending','final_ready'].includes(a.status)||a.outcomes?.length===120)return input;
 const s=structuredClone(input);s.attempt!.outcomes=Array.from({length:120},(_,i)=>a.scenario==='final'?false:a.scenario==='squirrel'?[4,8].includes(i+1):i<a.tap?false:random()<probability(i+1));return s;
}
export function tapBoundary(a:Pick<Attempt,'tap'|'outcomes'>){const i=a.outcomes?.findIndex((loss,index)=>index>=a.tap&&loss);return i!==undefined&&i>=0?i+1:120;}
export function projectAttempt(a:Attempt|null|undefined,target:number):Attempt|null{
 if(!a)return null;if(a.status!=='active'||!a.outcomes)return a;
 const tap=Math.min(tapBoundary(a),Math.max(a.tap,target));
 const loss=tap>a.tap&&a.outcomes[tap-1];
 return {...a,tap,reward:loss&&a.boosterUsed?0:payout(tap,a.kind),status:loss?(a.boosterUsed?'lost':'loss_pending'):tap===120?'final_ready':'active'};
}
