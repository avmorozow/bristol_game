import type {Player} from './engine';

type Snapshot=Pick<Player,'attempt'|'transactions'>&{referralCode:string};
export type ResultDismissal={profile:string;attemptId:string};
export type WalletCredit={id:string;amount:number};
const settled=(s:Snapshot)=>!!s.attempt&&['won','lost','abandoned'].includes(s.attempt.status);

/** Dismissing a settled result is a device preference, never a money operation. */
export function dismissSettledResult(s:Snapshot):ResultDismissal|null{
 return settled(s)?{profile:s.referralCode,attemptId:s.attempt!.id}:null;
}
export function resultIsDismissed(s:Snapshot,dismissed:ResultDismissal|null){
 return settled(s)&&dismissed?.profile===s.referralCode&&dismissed.attemptId===s.attempt!.id;
}
/** Only a newly observed, server-recorded reward can trigger the cosmetic flight. */
export function newWalletCredit(previous:Snapshot|null,next:Snapshot):WalletCredit|null{
 const a=next.attempt;
 if(!previous||previous.referralCode!==next.referralCode||a?.status!=='won'||previous.attempt?.id!==a.id)return null;
 const id=a.id+':reward',credit=next.transactions.find(t=>t.id===id&&t.reason==='game_session_reward'&&t.amount>0);
 return credit&&!previous.transactions.some(t=>t.id===id)?{id,amount:credit.amount}:null;
}
