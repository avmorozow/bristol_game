export type TauntMemory={attemptId:string;count:number;lastAt:number;idleShown?:boolean};
export const SQUIRREL_TAUNTS=['Я уже рядом…','Береги свой пакет!','Ну-ка, что у тебя там?','Не успеешь оглянуться!'] as const;
const thresholds=[2,12,35,75];
/** Only a new physical tap can request a taunt. No timers queue future threats. */
export function nextTaunt(memory:TauntMemory,tap:number,now:number){
 if(memory.count>=4||tap<thresholds[memory.count]||(memory.count>0&&now-memory.lastAt<10000))return null;
 return {text:SQUIRREL_TAUNTS[memory.count],memory:{...memory,count:memory.count+1,lastAt:now}};
}

export const IDLE_HINT_DELAY=12000;
/** A friendly hint shares the four-message budget and is shown once per attempt. */
export function nextIdleTaunt(memory:TauntMemory,now:number,lastActivityAt:number){
 if(memory.idleShown||memory.count>=4||now-lastActivityAt<IDLE_HINT_DELAY||(memory.count>0&&now-memory.lastAt<10000))return null;
 return {text:'Не бойся! Тапай на пакет, копи монеты.',memory:{...memory,count:memory.count+1,lastAt:now,idleShown:true}};
}
