import table from './economy.json';
import type {Attempt} from './engine';

/** A visual estimate only. Wallet mutations and every random outcome stay on the server. */
export function tapPreview(a:Attempt|null|undefined,projectedTap:number){
 const tap=a?.status==='active'?Math.min(120,Math.max(a.tap,projectedTap)):a?.tap??0;
 const pending=!!a&&a.status==='active'&&tap>a.tap;
 const reward=pending?(table[tap-1]?.[a.kind==='free'?'freeReward':'paidReward']??a.reward):a?.reward??0;
 return {tap,reward,pending};
}
export function encouragement(a:Attempt|null|undefined){
 if(!a)return 'Твой пакет ждёт. Выбери попытку и начинай!';
 if(a.status==='won')return 'Монеты на балансе. Этот выигрыш уже твой!';
 if(a.status==='abandoned')return 'Выбирай новую попытку, когда будешь готов.';
 if(a.status==='loss_pending')return 'Белка поймала пакет. Спасти его или остановиться?';
 if(a.status==='lost')return 'Этот пакет у белки. Прошлые выигрыши остались твоими.';
 if(a.status==='final_ready'||a.tap===120)return '120 из 120! Пора открыть свой подарок.';
 if(a.boosterUsed)return 'Одну белку отогнали! Вторая всё ещё может появиться — спасение уже использовано.';
 if(a.tap>=100){const n=120-a.tap,word=n%100>=11&&n%100<=14?'тапов':n%10===1?'тап':n%10>=2&&n%10<=4?'тапа':'тапов';return `До подарка ${n} ${word}. Продолжить или забрать своё?`;}
 if(a.tap>=60)return 'Больше половины пути позади. Решающий выбор — за тобой.';
 if(a.tap>=20)return 'Пакет становится тяжелее. Сколько монет заберёшь ты?';
 if(a.tap>0)return 'Монет всё больше. Следующий тап — новый шанс и новый риск.';
 return 'Первый тап — начало истории. Соберёшь все 120?';
}
export function vibrateTap(enabled:boolean,device:Pick<Navigator,'vibrate'>|undefined=typeof navigator==='undefined'?undefined:navigator){
 if(!enabled||typeof device?.vibrate!=='function')return false;
 try{return device.vibrate(10);}catch{return false;}
}
