import table from './economy.json';

export const CONFIG = { mode:'demo', version:'new_balance_120_draft_v1', paidPrice:100, boosterPrice:50, boosterLimit:1, maxTaps:120, referralReward:100, referralDaily:5, referralTotal:20, initialBalance:1000, leaseMs:300000 } as const;
export type Status = 'active'|'loss_pending'|'final_ready'|'won'|'lost'|'abandoned';
export type Attempt = { id:string; kind:'free'|'paid'; status:Status; tap:number; reward:number; boosterUsed:boolean; version:string; lastSeen:number; createdAt:number; scenario?:'final'|'squirrel'; coupon?:string; reason?:string; outcomes?:boolean[] };
export type Transaction = {id:string; amount:number; label:string; at:number; reason:string};
export type Player = {balance:number; freeDate:string|null; tutorial:boolean; started:number; attempt:Attempt|null; transactions:Transaction[]; gifts:{id:string;at:number;code:string}[]; invitedBy:string|null; referralDay:string; referralDayCount:number; referralTotal:number};
export class GameError extends Error { constructor(public code:string,message:string){super(message);} }
export const utcDate=(now:number)=>new Date(now).toISOString().slice(0,10);
export const isLive=(a:Attempt|null)=>!!a&&['active','loss_pending','final_ready'].includes(a.status);
export const payout=(tap:number,kind:'free'|'paid')=>tap===0?0:table[tap-1]?.[kind==='free'?'freeReward':'paidReward']??0;
export const probability=(tap:number)=>table[tap-1]?.lossProbability??0;
export function initialPlayer():Player { return {balance:CONFIG.initialBalance,freeDate:null,tutorial:false,started:0,attempt:null,transactions:[],gifts:[],invitedBy:null,referralDay:'',referralDayCount:0,referralTotal:0}; }
export function transact(s:Player,amount:number,label:string,reason:string,id:string,now:number){
 if(s.transactions.some(t=>t.id===id))return;
 if(s.balance+amount<0)throw new GameError('insufficient_funds','Не хватает монет.');
 s.balance+=amount;s.transactions.unshift({id,amount,label,reason,at:now});
}
function finish(s:Player,now:number,reason:string){
 const a=s.attempt;if(!a||!isLive(a))return;
 a.reason=reason;
 if(a.status==='loss_pending'){a.status='lost';a.reward=0;return;}
 if(a.tap===0){a.status='abandoned';a.reward=0;return;}
 a.status='won';
 transact(s,a.reward,'Выигрыш','game_session_reward',a.id+':reward',now);
 if(a.tap===CONFIG.maxTaps){a.coupon='DEMO-'+a.id.slice(0,6).toUpperCase();s.gifts.unshift({id:a.id,at:now,code:a.coupon});}
}
export function expire(input:Player,now:number):Player {const s=structuredClone(input);if(isLive(s.attempt)&&now-s.attempt!.lastSeen>CONFIG.leaseMs)finish(s,now,'connection');return s;}
function advanceTap(a:Attempt|null,now:number,random:()=>number){
   if(!a||a.status!=='active')throw new GameError('not_active','Игра уже остановлена.');
   if(a.tap>=CONFIG.maxTaps)throw new GameError('finished','Вы уже дошли до финала.');
   a.tap++;a.reward=payout(a.tap,a.kind);a.lastSeen=now;
   const loss=a.outcomes?.[a.tap-1]??(a.scenario==='final'?false:a.scenario==='squirrel'?(a.tap===4||a.tap===8):random()<probability(a.tap));
   if(loss){a.status=a.boosterUsed?'lost':'loss_pending';if(a.boosterUsed)a.reward=0;}
   else if(a.tap===CONFIG.maxTaps)a.status='final_ready';
}
export function transition(input:Player,action:string,value:unknown,now:number,id:string,random:()=>number):Player {
 const s=expire(input,now);let a=s.attempt;
 switch(action){
 case 'tutorial':s.tutorial=true;break;
 case 'dismiss':
   if(isLive(a))throw new GameError('active_attempt','Сначала закончи текущую игру.');
   if(a?.id===value)s.attempt=null;
   break;
 case 'start':{
   if(isLive(a))throw new GameError('active_attempt','У вас уже есть активная игра.');
   if(value!==undefined&&value!=='free'&&value!=='paid')throw new GameError('invalid_mode','Выбери бесплатную или платную попытку.');
   const kind=value??(s.freeDate===utcDate(now)?'paid':'free');
   if(kind==='free'&&s.freeDate===utcDate(now))throw new GameError('free_used','Бесплатная попытка уже использована. Следующая — в 03:00 по Москве.');
   if(kind==='paid')transact(s,-CONFIG.paidPrice,'Платная игра','paid_game_attempt',id+':entry',now);else s.freeDate=utcDate(now);
   s.started++;s.attempt={id,kind,status:'active',tap:0,reward:0,boosterUsed:false,version:CONFIG.version,lastSeen:now,createdAt:now};break;
 }
 case 'taps':{
   const request=value as {count?:unknown;attemptId?:unknown}|null;
   if(!request||!Number.isInteger(request.count)||Number(request.count)<1||Number(request.count)>20)throw new GameError('invalid_taps','Некорректное число нажатий.');
   if(!a||a.id!==request.attemptId)throw new GameError('wrong_attempt','Эта попытка уже завершена.');
   for(let i=0;i<Number(request.count);i++){advanceTap(a,now,random);if(a.status!=='active')break;}
   break;
 }
 case 'tap':advanceTap(a,now,random);break;
 case 'booster':{
   if(!a||a.status!=='loss_pending'||a.boosterUsed)throw new GameError('booster_unavailable','Бустер сейчас недоступен.');
   transact(s,-CONFIG.boosterPrice,'Отогнать белку','booster_continue_after_squirrel',a.id+':booster',now);
   a.boosterUsed=true;a.status=a.tap===CONFIG.maxTaps?'final_ready':'active';a.lastSeen=now;break;
 }
 case 'cashout':
   if(!a||!['active','final_ready'].includes(a.status)||a.tap===0)throw new GameError('no_reward','Сейчас нельзя забрать монеты.');
   finish(s,now,'cashout');break;
 case 'close':if(a?.id===value)finish(s,now,'exit');break;
 case 'lose':
   if(!a||a.status!=='loss_pending')throw new GameError('not_lost','Этот экран уже неактуален.');
   finish(s,now,'declined');break;
 case 'heartbeat':if(isLive(a))a!.lastSeen=now;break;
 case 'demo':{
   if(isLive(a))throw new GameError('active_attempt','Сначала закончите текущую игру.');
   if(value==='balance'){transact(s,1000,'Тестовые монеты','demo_topup',id,now);break;}
   if(value!=='final'&&value!=='squirrel')throw new GameError('invalid','Неизвестный сценарий.');
   s.tutorial=true;s.attempt={id,kind:'free',status:'active',tap:value==='final'?119:0,reward:value==='final'?payout(119,'free'):0,boosterUsed:false,version:CONFIG.version,lastSeen:now,createdAt:now,scenario:value};break;
 }
 default:throw new GameError('invalid_action','Неизвестное действие.');
 }
 return s;
}
export function referral(invitee:Player,inviter:Player,code:string,now:number,id:string){
 const a=structuredClone(invitee),b=structuredClone(inviter);
 if(a.invitedBy)throw new GameError('already_invited','Вы уже активировали код друга.');
 if(a.started>0)throw new GameError('referral_closed','Код друга можно ввести до первой игры.');
 if(b.referralDay!==utcDate(now)){b.referralDay=utcDate(now);b.referralDayCount=0;}
 if(b.referralDayCount>=CONFIG.referralDaily||b.referralTotal>=CONFIG.referralTotal)throw new GameError('referral_limit','Друг уже получил максимум бонусов. Попробуйте другой код.');
 a.invitedBy=code;b.referralDayCount++;b.referralTotal++;
 transact(a,CONFIG.referralReward,'Бонус за код друга','referral_invitee_reward',id+':invitee',now);
 transact(b,CONFIG.referralReward,'Бонус за приглашение','referral_inviter_reward',id+':inviter',now);
 return [a,b];
}
export function publicState(s:Player,version:number,code:string,now:number){
 const a=s.attempt;
 const nextTap=a?.status==='active'?{reward:payout(a.tap+1,a.kind),lossPercent:a.scenario==='final'?0:a.scenario==='squirrel'?([4,8].includes(a.tap+1)?100:0):probability(a.tap+1)*100}:null;
 return {...s,transactions:s.transactions.slice(0,200),revision:version,referralCode:code,freeAvailable:s.freeDate!==utcDate(now),serverTime:now,nextTap,config:CONFIG};
}
