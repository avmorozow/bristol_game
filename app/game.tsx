'use client';

import {useState,useRef,useEffect,useCallback} from 'react';
import {X,Volume2,VolumeX,Copy,History,ChevronRight,Loader2,Check,Gift,Settings2,Music2,Smartphone} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Progress} from '@/components/ui/progress';
import {Toaster,toast} from 'sonner';
import {TapQueue} from '@/lib/game/tap-queue';
import {OriginalSquirrel} from '@/components/original-squirrel';
import {SquirrelTaunt} from '@/components/squirrel-taunt';
import {Scene3D} from '@/components/scene-3d';
import type {SceneHandle} from '@/components/scene-3d';
import {projectAttempt} from '@/lib/game/tap-plan';
import {WalletCelebration} from '@/components/wallet-celebration';
import {dismissSettledResult,resultIsDismissed,newWalletCredit} from '@/lib/game/result-view';
import type {ResultDismissal,WalletCredit} from '@/lib/game/result-view';
import {GameAudio} from '@/lib/game/audio';
import type {SoundKind} from '@/lib/game/audio';
import {tapPreview,encouragement,vibrateTap} from '@/lib/game/feedback';
import type {Player,CONFIG} from '@/lib/game/engine';

type State=Player&{revision:number;referralCode:string;freeAvailable:boolean;serverTime:number;nextTap:{reward:number;lossPercent:number}|null;config:typeof CONFIG};
type ApiPayload=State&{error?:string;code?:string;state:State};
type Command={id:string;action:string;value?:unknown;revision?:number;profile?:string};
type Modal='rules'|'history'|'referral'|'tutorial'|'exit'|'demo'|'gifts'|'settings'|null;
const A='/assets/';
const fmt=(n:number)=>new Intl.NumberFormat('ru-RU').format(n);
const coinCount=(n:number)=>`${fmt(n)} ${n%100>=11&&n%100<=14?'монет':n%10===1?'монета':n%10>=2&&n%10<=4?'монеты':'монет'}`;
const live=(s:State|null)=>!!s?.attempt&&['active','loss_pending','final_ready'].includes(s.attempt.status);
const commandId=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
async function requestGame(body?:Command){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const res=await fetch('/api/game',{cache:'no-store',credentials:'same-origin',signal:controller.signal,...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await res.json() as ApiPayload;return {res,data};}
 finally{clearTimeout(timer);}
}
const connectionError=(e:unknown)=>e instanceof Error&&e.name==='AbortError'?'Ответ задерживается. Нажми «Повторить» — монеты не спишутся дважды.':typeof navigator!=='undefined'&&!navigator.onLine?'Нет интернета. Вернись в течение 5 минут, чтобы продолжить.':e instanceof Error?e.message:'Связь прервалась. Результат сохраняется.';
function Coin({size=28}:{size?:number}){return <img src={A+'coin.png'} alt="монет" width={size} height={size} className="coin" draggable={false}/>;}
function Action({children,onClick,disabled,secondary=false,className=''}:{children:React.ReactNode;onClick?:()=>void;disabled?:boolean;secondary?:boolean;className?:string}){return <Button onClick={onClick} disabled={disabled} className={`game-button ${secondary?'secondary':'primary'} ${className}`}>{children}</Button>;}
const tutorial=[
 {title:'Собери пакет',text:'Нажимай на пакет — каждый удачный тап увеличивает выигрыш.',image:'bag-3d.webp'},
 {title:'Забирай вовремя',text:'Монеты твои, когда нажмёшь «Забрать». Можно остановиться после любого удачного тапа.',image:'coin.png'},
 {title:'Остерегайся белки',text:'Белка может забрать весь выигрыш. Один раз за игру её можно отогнать за 50 монет.',image:'thief.png'},
 {title:'Дойди до подарка',text:'Пройди 120 тапов, забери монеты и получи подарок. Здесь монеты и подарки тестовые.',image:'stars.png'},
];

export default function Game(){
 const [cashoutWaiting,setCashoutWaiting]=useState(false);
 const [tapBacklog,setTapBacklog]=useState(0),[projectedTap,setProjectedTap]=useState(0);
 const [selectedMode,setSelectedMode]=useState<'free'|'paid'>('free'),[clock,setClock]=useState(Date.now());
 const [music,setMusic]=useState(true),[effects,setEffects]=useState(true),[haptics,setHaptics]=useState(true),[hapticSupport,setHapticSupport]=useState(false);
 const audioEngine=useRef<GameAudio|null>(null),serverOffset=useRef(0);
 const tapQueue=useRef<TapQueue|null>(null),activeAction=useRef(''),cashoutLock=useRef(false),bagElement=useRef<HTMLButtonElement|null>(null);
 const [state,setState]=useState<State|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [modal,setModal]=useState<Modal>(null),[step,setStep]=useState(0),[muted,setMuted]=useState(false),[refCode,setRefCode]=useState(''),[refMessage,setRefMessage]=useState('');
 const [particles,setParticles]=useState<{id:number;amount:number;left:number}[]>([]),[historyCount,setHistoryCount]=useState(20),[pending,setPending]=useState(false);
 const [motionHidden,setMotionHidden]=useState(false),[sceneReady,setSceneReady]=useState(false),[decisionWaiting,setDecisionWaiting]=useState(false),[demoVariant,setDemoVariant]=useState<number|null>(null);
 const sceneControl=useRef<SceneHandle|null>(null);
 useEffect(()=>{const update=()=>setMotionHidden(document.hidden);update();document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
 const commandDone=useRef<Promise<void>>(Promise.resolve());
 const [dismissed,setDismissed]=useState<ResultDismissal|null>(null),[credit,setCredit]=useState<WalletCredit|null>(null);
 const walletElement=useRef<HTMLButtonElement|null>(null),rewardOrigin=useRef<HTMLDivElement|null>(null),scoreOrigin=useRef<HTMLDivElement|null>(null);
 const finishCredit=useCallback(()=>setCredit(null),[]);
 const lossFocus=useRef<HTMLDivElement|null>(null),resultFocus=useRef<HTMLDivElement|null>(null);
 const current=useRef<State|null>(null),lock=useRef(false),pendingCommand=useRef<Command|null>(null),particleId=useRef(0);
 const apply=useCallback((s:State)=>{if(!current.current||s.referralCode!==current.current.referralCode||s.revision>=current.current.revision){if(s.attempt?.id!==current.current?.attempt?.id){setProjectedTap(s.attempt?.tap??0);setTapBacklog(0);setParticles([]);}const received=newWalletCredit(current.current,s);if(received)setCredit(received);current.current=s;serverOffset.current=s.serverTime-Date.now();setState(s);}},[]);
 const sound=useCallback((kind:SoundKind)=>audioEngine.current?.play(kind),[]);
 const refresh=useCallback(async()=>{try{const {res,data}=await requestGame();if(!res.ok)throw new Error(data.error);apply(data);setError('');return data as State;}catch(e){setError(connectionError(e));return null;}finally{setLoading(false);}},[apply]);
 const send=useCallback(async(action:string,value?:unknown):Promise<State|null>=>{
  if(lock.current)return null;
  if(pendingCommand.current&&action!=='retry'){setError('Проверяем предыдущее действие. Нажмите «Повторить».');return null;}
  const cmd=action==='retry'?pendingCommand.current:{id:commandId(),action,value,revision:current.current?.revision,profile:current.current?.referralCode};if(!cmd)return null;
  if(cmd.profile!==current.current?.referralCode){pendingCommand.current=null;setPending(false);try{sessionStorage.removeItem('bristol-pending');}catch{}setError('Гостевой профиль изменился. Начни новую игру.');return null;}
  let release!:()=>void;commandDone.current=new Promise<void>(resolve=>{release=resolve;});
  lock.current=true;activeAction.current=cmd.action;setBusy(true);setError('');
  if(cmd.action!=='heartbeat'){pendingCommand.current=cmd;setPending(true);try{sessionStorage.setItem('bristol-pending',JSON.stringify(cmd));}catch{}}
  try{
   let {res,data}=await requestGame(cmd);
   // A harmless concurrent update can invalidate the revision. Retry this same
   // batch once against the returned state; its idempotency key stays unchanged.
   if(res.status===409&&cmd.action==='taps'&&data.state?.attempt?.status==='active'&&data.state.attempt.id===(cmd.value as {attemptId:string}).attemptId){
    apply(data.state);cmd.revision=data.state.revision;
    try{sessionStorage.setItem('bristol-pending',JSON.stringify(cmd));}catch{}
    ({res,data}=await requestGame(cmd));
   }
   if(res.status>=500)throw new Error(data.error??'Проверяем результат операции.');
   pendingCommand.current=null;setPending(false);try{sessionStorage.removeItem('bristol-pending');}catch{}
   if(res.status===409){apply(data.state);setError('Игра обновилась в другой вкладке. Проверь результат перед следующим действием.');return null;}
   if(!res.ok){setError(data.error??'Не удалось выполнить действие.');return null;}
   const before=current.current;apply(data);
   if((cmd.action==='tap'||cmd.action==='taps')&&!data.attempt?.outcomes&&data.attempt&&data.attempt.status!==before?.attempt?.status){
    if(data.attempt.status==='loss_pending'||data.attempt.status==='lost')sound('loss');
    else if(data.attempt.status==='final_ready')sound('win');
   }
   if(cmd.action==='cashout'||cmd.action==='close'&&data.attempt?.status==='won')sound('win');
   if(cmd.action==='booster')sound('rescue');
   if(cmd.action==='start')sound('start');
   return data;
  }catch(e){if(cmd.action==='heartbeat'){pendingCommand.current=null;setPending(false);}setError(connectionError(e));return null;}
  finally{lock.current=false;activeAction.current='';setBusy(false);release();}
 },[apply,sound]);
 const transport=useRef(send);transport.current=send;
 useEffect(()=>{
  const queue=new TapQueue({
   position:()=>current.current?.attempt??null,
   readiness:()=>document.visibilityState==='hidden'||(pendingCommand.current&&!lock.current)?'stop':lock.current?'wait':'ready',
   send:async(count,attemptId)=>(await transport.current('taps',{count,attemptId}))?.attempt??null,
   onChange:(pending,tap)=>{setTapBacklog(pending);setProjectedTap(tap);},
  });
  tapQueue.current=queue;
  return()=>{queue.dispose();tapQueue.current=null;};
 },[]);
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('bristol-result-view')??'null');if(saved&&typeof saved.profile==='string'&&typeof saved.attemptId==='string')setDismissed(saved);}catch{}void refresh().then(s=>{if(!s)return;try{const p=sessionStorage.getItem('bristol-pending');if(p){const cmd=JSON.parse(p) as Command;if(cmd.profile===s.referralCode){pendingCommand.current=cmd;setPending(true);}else sessionStorage.removeItem('bristol-pending');}}catch{}});try{setMuted(localStorage.getItem('bristol-sound')==='off');setMusic(localStorage.getItem('bristol-music')!=='off');setEffects(localStorage.getItem('bristol-effects')!=='off');setHaptics(localStorage.getItem('bristol-haptics')!=='off');}catch{}},[refresh]);
 useEffect(()=>{const engine=new GameAudio();audioEngine.current=engine;setHapticSupport(typeof navigator.vibrate==='function');return()=>{engine.dispose();audioEngine.current=null;};},[]);
 useEffect(()=>{audioEngine.current?.configure({muted,music,effects});},[muted,music,effects]);
 useEffect(()=>{if(state&&!state.freeAvailable)setSelectedMode('paid');},[state?.freeAvailable]);
 useEffect(()=>{const timer=setInterval(()=>{const now=Date.now()+serverOffset.current;setClock(now);const s=current.current;if(s&&!s.freeAvailable&&s.freeDate!==new Date(now).toISOString().slice(0,10)&&!lock.current&&!pendingCommand.current)void refresh();},1000);return()=>clearInterval(timer);},[refresh]);
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible'&&live(current.current)&&!lock.current&&!pendingCommand.current&&!tapBacklog&&!cashoutLock.current)void send('heartbeat');},5000);return()=>clearInterval(timer);},[send,tapBacklog]);
 useEffect(()=>{const visible=()=>{audioEngine.current?.setHidden(document.visibilityState==='hidden');if(document.visibilityState==='hidden')tapQueue.current?.cancel();else if(!lock.current)void refresh();};const online=()=>{if(!pendingCommand.current&&!lock.current)void refresh();};document.addEventListener('visibilitychange',visible);window.addEventListener('online',online);return()=>{document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',online);};},[refresh]);
 const a=projectAttempt(state?.attempt,projectedTap),playing=!!a&&['active','loss_pending','final_ready'].includes(a.status),result=!!state&&!!a&&['won','lost','abandoned'].includes(a.status)&&!resultIsDismissed({...state,attempt:a},dismissed),onHome=!playing&&!result;
 const blocked=busy||pending||loading||!sceneReady||decisionWaiting;
 async function start(kind=selectedMode){
  const ready=current.current??await refresh();if(!ready)return;
  if(kind==='free'&&!ready.freeAvailable){toast('Бесплатная попытка обновится в 03:00 по Москве');return;}
  if(kind==='paid'&&ready.balance<ready.config.paidPrice){toast('Не хватает монет для платной попытки');return;}
  const s=await send('start',kind);if(s)setModal(null);
 }
 async function nextTutorial(skip=false){if(!skip&&step<3){setStep(step+1);return;}const s=await send('tutorial',skip?'skip':'complete');if(s){setModal(null);if(!skip&&!live(s))await start();}}
 const tapBlocked=loading||!sceneReady||decisionWaiting||cashoutWaiting||(pending&&!busy)||(busy&&!['taps','heartbeat'].includes(activeAction.current));
 async function cashout(){
  if(cashoutLock.current)return;
  cashoutLock.current=true;setCashoutWaiting(true);
  try{
   await tapQueue.current?.flush();
   await commandDone.current;
   if(!pendingCommand.current&&current.current?.attempt&&['active','final_ready'].includes(current.current.attempt.status))await send('cashout');
  }finally{cashoutLock.current=false;setCashoutWaiting(false);}
 }
 function tap(){
  if(tapBlocked||cashoutLock.current||modal)return;
  const position=current.current?.attempt,queue=tapQueue.current;if(!position||!queue)return;
  const before=projectAttempt(position,queue.preview().tap)!;if(!queue.add())return;
  const after=projectAttempt(position,queue.preview().tap)!,id=++particleId.current;sceneControl.current?.tap();
  if(after.status==='active'||after.status==='final_ready')setParticles(p=>[...p.slice(-7),{id,amount:after.reward-before.reward,left:24+(id*19)%52}]);else setParticles([]);
  setTimeout(()=>setParticles(p=>p.filter(x=>x.id!==id)),750);
  vibrateTap(haptics);
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
   bagElement.current?.getAnimations?.().forEach(animation=>animation.cancel());
   bagElement.current?.animate?.([{transform:'scale(1.07,.9) rotate(-3deg)'},{transform:'scale(.97,1.05) rotate(2deg)'},{transform:'scale(1)'}],{duration:190,easing:'cubic-bezier(.2,.8,.3,1)'});
  }
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){const score=scoreOrigin.current?.querySelector('span');score?.getAnimations().forEach(animation=>animation.cancel());score?.animate([{transform:'scale(1.055)'},{transform:'scale(1)'}],{duration:170,easing:'ease-out'});}
  sound(['loss_pending','lost'].includes(after.status)?'loss':after.status==='final_ready'?'win':'tap');
 }
 function toggleSound(){const next=!muted;setMuted(next);audioEngine.current?.configure({muted:next,music,effects});if(!next)audioEngine.current?.unlock();try{localStorage.setItem('bristol-sound',next?'off':'on');}catch{}}
 function preference(kind:'music'|'effects'|'haptics',value:boolean){if(kind==='music')setMusic(value);if(kind==='effects')setEffects(value);if(kind==='haptics'){setHaptics(value);vibrateTap(value);}try{localStorage.setItem('bristol-'+kind,value?'on':'off');}catch{}}
 async function copy(){try{await navigator.clipboard.writeText(state!.referralCode);toast.success('Код скопирован');}catch{toast('Выделите код и скопируйте его');}}
 async function activate(){setRefMessage('');const s=await send('referral',refCode);if(s){setRefMessage(refCode==='BRISTOL'?'Готово! Начислено 100 тестовых монет за демонстрационный код.':'Готово! Вам и другу начислено по 100 тестовых монет.');toast.success('Бонус за друга получен');}}
 async function demo(value:string,variant?:number){setDemoVariant(variant??null);const s=await send('demo',value);if(s){setModal(null);if(value==='balance')toast.success('Добавлено 1 000 тестовых монет');}}
 const dismissResult=()=>{
  const s=current.current;if(!s)return;const next=dismissSettledResult({...s,attempt:projectAttempt(s.attempt,tapQueue.current?.preview().tap??s.attempt?.tap??0)});if(!next)return;
  setDismissed(next);setSelectedMode(s.freeAvailable?'free':'paid');setModal(null);
  try{localStorage.setItem('bristol-result-view',JSON.stringify(next));}catch{}
 };
 async function decide(action:'booster'|'lose'){if(decisionWaiting)return;setDecisionWaiting(true);try{await tapQueue.current?.flush();await commandDone.current;if(!pendingCommand.current)await send(action);}finally{setDecisionWaiting(false);}}
 const squirrelVariant=demoVariant??Array.from(a?.id??'').reduce((n,c)=>n+c.charCodeAt(0),0)%3;
 const preview={tap:a?.tap??0,reward:a?.reward??0,pending:false};
 useEffect(()=>{audioEngine.current?.setActive(playing);audioEngine.current?.setTension(a?.status==='loss_pending'?1:(a?.tap??0)/120);},[playing,a?.status,a?.tap]);
 const remaining=state?.freeDate?Math.max(0,new Date(state.freeDate+'T00:00:00Z').getTime()+86400000-clock):0;
 const resetTime=[Math.floor(remaining/3600000),Math.floor(remaining/60000)%60,Math.floor(remaining/1000)%60].map(n=>String(n).padStart(2,'0')).join(':');
 const showForced=!!a?.scenario&&playing;
 const spent=(a?.kind==='paid'?100:0)+(a?.boosterUsed?50:0),net=(a?.status==='lost'||a?.status==='abandoned'?0:a?.reward??0)-spent;

 return <main className="game-shell" onPointerDownCapture={()=>audioEngine.current?.unlock()} onKeyDownCapture={()=>audioEngine.current?.unlock()}>
  <Toaster position="top-center" richColors/>
  {credit&&state&&<WalletCelebration key={credit.id} credit={credit} balance={state.balance} wallet={walletElement} origin={rewardOrigin} fallback={scoreOrigin} onComplete={finishCredit}/>}
  <section className={`game-stage stage-3d ${onHome?'home-scene':'play-scene'} ${a?.status==='loss_pending'||result||a?.status==='final_ready'?'has-scene-decision':''}`} aria-label="Игра Собери пакет" data-motion-paused={motionHidden||!!modal}>
   <img className="scene-bg" src={A+'background.png'} alt="" fetchPriority="high"/>
   <div className="scene-shade"/>
   <header className="topbar">
    <div className="top-actions">
     <Button variant="ghost" className="icon-button" aria-label={playing?'Выйти из игры':'Мои подарки'} onClick={()=>playing?setModal('exit'):setModal('gifts')} disabled={blocked}>{playing?<X size={25}/>:<Gift size={23}/>}</Button>
     <Button variant="ghost" className="icon-button" aria-label={muted?'Включить звук':'Выключить звук'} aria-pressed={!muted} onClick={toggleSound}>{muted?<VolumeX size={23}/>:<Volume2 size={23}/>}</Button>
     <Button variant="ghost" className="icon-button settings-button" aria-label="Музыка, звуки и вибрация" onClick={()=>setModal('settings')}><Settings2 size={21}/></Button>
    </div>
    <div className="top-actions">
     <button ref={walletElement} className="wallet" disabled={!state} onClick={()=>{setHistoryCount(20);setModal('history');}} aria-label={`Баланс ${state?fmt(state.balance):'загружается'} монет. История операций`}><span>{state?fmt(state.balance):'—'}</span><Coin size={43}/></button>
     <Button variant="ghost" className="icon-button help" aria-label="Правила игры" onClick={()=>setModal('rules')}>?</Button>
    </div>
   </header>
   <Scene3D ref={sceneControl} status={onHome?'home':a?.status??'home'} attemptId={a?.id} boosterUsed={a?.boosterUsed} variant={squirrelVariant} paused={motionHidden||!!modal} onReady={setSceneReady}/>
   <OriginalSquirrel home={onHome} attemptId={a?.id} boosterUsed={a?.boosterUsed}/>
   <SquirrelTaunt attemptId={a?.id} tap={a?.tap??0} active={!onHome&&a?.status==='active'&&!modal&&!motionHidden}/>

   {onHome&&<div className="home-content">
    <div className="scene-title"><h1>Собери пакет</h1></div>
    <button className="friend-pill" onClick={()=>{setRefMessage('');setModal('referral');}}>Позвать друга</button>
    <div className="home-bottom mode-home">
     <fieldset className="mode-picker"><legend className="sr-only">Выбери свою попытку</legend>
      <label className={`mode-card ${selectedMode==='free'?'selected':''} ${!state?.freeAvailable?'unavailable':''}`}><input type="radio" name="attempt-mode" value="free" checked={selectedMode==='free'} disabled={!state?.freeAvailable||blocked} onChange={()=>setSelectedMode('free')}/><span>Бесплатно</span></label>
      <label className={`mode-card ${selectedMode==='paid'?'selected':''}`}><input type="radio" name="attempt-mode" value="paid" checked={selectedMode==='paid'} disabled={blocked} onChange={()=>setSelectedMode('paid')}/><span>За 100 монет</span></label>
     </fieldset>
     <p className="mode-availability">{state?.freeAvailable?'Одна бесплатная попытка в день':state?`Бесплатная через ${resetTime}`:'Загрузка…'}</p>
     <Action onClick={()=>void start()} disabled={blocked||(selectedMode==='free'?!state?.freeAvailable:(state?.balance??0)<100)} className="play-button">{loading?<Loader2 className="spin"/>:selectedMode==='free'?'ИГРАТЬ БЕСПЛАТНО':<>ИГРАТЬ ЗА 100 <Coin size={27}/></>}</Action>
     {selectedMode==='paid'&&state&&state.balance<100&&<div className="mode-funds"><span>Не хватает монет для попытки</span><button onClick={()=>void demo('balance')} disabled={blocked}>Добавить тестовые монеты</button></div>}

    </div>
   </div>}

   {(playing||result)&&<>
    <div className="score-zone">
     <p className="score-caption">{a?.status==='won'?'Забрано':a?.status==='lost'?'Упущено':'На кону'}</p>
     <div ref={scoreOrigin} className={`score ${preview.reward>=1000?'score-small':''} ${preview.pending?'score-pending':''}`}><span data-testid="tap-score" aria-label={preview.pending?'Предварительная сумма':'Подтверждённая сумма'}>{fmt(preview.reward)}</span><Coin size={64}/></div>
     <div className="progress-info"><span>{preview.tap} / 120 тапов</span><span><img src={A+'gift.png'} alt=""/></span></div>
     <Progress value={preview.tap/120*100} className="game-progress" aria-label="Прогресс к подарку"/>
    </div>
    <div className="tap-area" key={a?.id}>
     <button ref={bagElement} className="bag-button scene-tap-target" onPointerDown={e=>{if(e.button===0)tap();}} onClick={e=>{if(e.detail===0)tap();}} disabled={tapBlocked||a?.status!=='active'||preview.tap>=120} aria-label="Нажать на пакет"><span className="sr-only">Нажать на 3D-пакет</span></button>
     {particles.slice(-3).map(p=><span key={p.id} className="tap-ripple" aria-hidden="true"/>)}
     {particles.map(p=><span key={p.id} className="tap-particle" aria-hidden="true" style={{left:p.left+'%'}}>+{p.amount}<Coin size={25}/></span>)}

    </div>
    <div className="game-bottom"><Action onClick={cashout} disabled={loading||cashoutWaiting||(pending&&!busy)||(busy&&!['taps','heartbeat'].includes(activeAction.current))||(!a?.tap&&!tapBacklog)||a?.status!=='active'} secondary className="cashout-button">{cashoutWaiting?<Loader2 size={21} className="spin"/>:null}{cashoutWaiting?'ЗАБИРАЕМ…':'ЗАБРАТЬ МОНЕТЫ'}</Action></div>
   </>}

   {!result&&a?.status!=='loss_pending'&&a?.status!=='final_ready'&&<p className="game-whisper" key={`${a?.id}-${a?.boosterUsed}-${Math.floor((a?.tap??0)/20)}`}>{encouragement(onHome?null:a)}</p>}
   {error&&<div className="connection-notice" role="alert"><span>{error}</span><button onClick={()=>pending?void send('retry'):void refresh()} disabled={busy}>Повторить</button></div>}
   {!error&&pending&&!busy&&<div className="connection-notice" role="status"><span>Осталось проверить последнее действие</span><button onClick={()=>void send('retry')} disabled={busy}>Проверить</button></div>}
   <button className="demo-label" onClick={()=>setModal('demo')}>Демо · монеты</button>
  </section>

  <Dialog open={a?.status==='loss_pending'&&!modal} onOpenChange={()=>{}}>
   <DialogContent ref={lossFocus} tabIndex={-1} onOpenAutoFocus={e=>{e.preventDefault();lossFocus.current?.focus();}} className={`game-modal scene-decision squirrel-popup squirrel-path-${squirrelVariant}`} showCloseButton={false} onEscapeKeyDown={e=>e.preventDefault()} onPointerDownOutside={e=>e.preventDefault()}>
    <div className="squirrel-popup-art"><img src={A+'thief.png'} alt="Белка забрала пакет"/></div>
    <div className="modal-body"><DialogTitle>Вернуть пакет?</DialogTitle><DialogDescription className="sr-only">Одно спасение за попытку</DialogDescription>
    <Action onClick={()=>void decide('booster')} disabled={decisionWaiting||(pending&&!busy)||(state?.balance??0)<50}>ОТОГНАТЬ ЗА 50 <Coin/></Action>
    {(state?.balance??0)<50&&<p className="field-error">Не хватает монет для спасения</p>}
    <Action secondary onClick={()=>void decide('lose')} disabled={decisionWaiting||(pending&&!busy)}>ЗАКОНЧИТЬ ИГРУ</Action>{error&&<p className="field-error">{error}</p>}{pending&&!busy&&<Action secondary onClick={()=>void send('retry')} disabled={busy}>Проверить операцию</Action>}</div>
   </DialogContent>
  </Dialog>

  {a&&(result||a.status==='final_ready')&&<Dialog open={!modal} onOpenChange={open=>{if(!open&&a?.status!=='final_ready')dismissResult();}}>
   <DialogContent ref={resultFocus} tabIndex={-1} onOpenAutoFocus={e=>{e.preventDefault();resultFocus.current?.focus();}} className={`game-modal scene-decision ${a.status==='lost'?`squirrel-popup squirrel-path-${squirrelVariant}`:''}`} showCloseButton={false} onEscapeKeyDown={e=>{if(a?.status==='final_ready')e.preventDefault();}} onPointerDownOutside={e=>{if(a?.status==='final_ready')e.preventDefault();}}>
    {a.status==='lost'&&<div className={`squirrel-popup-art ${a.boosterUsed?'':'squirrel-already-here'}`}><img src={A+'thief.png'} alt="Белка унесла пакет"/></div>}
    <div className="modal-body"><DialogTitle>{a?.status==='final_ready'?'Пакет собран!':a?.status==='won'?(a.tap===120?'Пакет собран!':'Монеты забраны!'):a?.status==='lost'?'Вот это белка…':'До новой игры!'}</DialogTitle>
    <DialogDescription className="sr-only">{a.status==='lost'?'Незабранные монеты потеряны':'Результат попытки'}</DialogDescription>
    {['won','final_ready'].includes(a?.status??'')&&<div className="reward-card" ref={rewardOrigin}><div><span>Монеты</span><strong>+ {fmt(a?.reward??0)} <Coin/></strong></div>{a?.tap===120&&<div><span>Подарок</span><strong>+ 1 <img className="gift-icon" src={A+'gift.png'} alt="подарок"/></strong></div>}</div>}

    {a?.status==='final_ready'?<Action onClick={cashout} disabled={cashoutWaiting||(pending&&!busy)}>ЗАБРАТЬ НАГРАДУ</Action>:<><Action onClick={dismissResult}>ПРОДОЛЖИТЬ</Action>{a?.coupon&&<Action secondary onClick={()=>setModal('gifts')}>МОЙ ПОДАРОК</Action>}</>}
    {error&&<p className="field-error">{error}</p>}{pending&&!busy&&<Action secondary onClick={()=>void send('retry')} disabled={busy}>Проверить операцию</Action>}</div>
   </DialogContent>
  </Dialog>}

  {modal&&<Dialog open={true} onOpenChange={open=>{if(!open&&modal==='tutorial')void nextTutorial(true);else if(!open)setModal(null);}}>
   <DialogContent className={`game-modal ${modal==='referral'?'illustration-modal':modal==='rules'||modal==='history'?'reading-modal':''} ${modal==='tutorial'?'tutorial-modal':''}`} showCloseButton={false}>
    {modal!=='tutorial'&&<Button variant="ghost" className="modal-close" onClick={()=>setModal(null)} aria-label="Закрыть"><X size={22}/></Button>}
    {modal==='settings'&&<><div className="modal-kicker">АТМОСФЕРА ИГРЫ</div><DialogTitle>Звук и отклик</DialogTitle><DialogDescription>Настрой игру под себя. Музыка звучит во время активной попытки.</DialogDescription><div className="feedback-settings"><button aria-pressed={!muted} onClick={toggleSound}><Volume2/><span><strong>Общий звук</strong><small>{muted?'Выключен':'Включён'}</small></span><b>{muted?'Выкл':'Вкл'}</b></button><button aria-pressed={music} onClick={()=>preference('music',!music)}><Music2/><span><strong>Фоновая музыка</strong><small>Игривый свинг и лесная погоня</small></span><b>{music?'Вкл':'Выкл'}</b></button><button aria-pressed={effects} onClick={()=>preference('effects',!effects)}><Volume2/><span><strong>Звуковые эффекты</strong><small>Тап, спасение, белка и победа</small></span><b>{effects?'Вкл':'Выкл'}</b></button><button aria-pressed={haptics&&hapticSupport} disabled={!hapticSupport} onClick={()=>preference('haptics',!haptics)}><Smartphone/><span><strong>Вибрация при тапе</strong><small>{hapticSupport?'Короткий отклик телефона':'Этот браузер не поддерживает вибрацию'}</small></span><b>{hapticSupport?(haptics?'Вкл':'Выкл'):'—'}</b></button></div>{muted&&<p className="small-note">Включи общий звук, чтобы услышать музыку и эффекты.</p>}<Action onClick={()=>setModal(null)}>ГОТОВО</Action></>}
    {modal==='exit'&&<><DialogTitle>Закончить игру?</DialogTitle><DialogDescription>{a?.status==='loss_pending'?'Если уйти сейчас, белка заберёт незабранный выигрыш.':'Зачислим последний подтверждённый выигрыш. Чтобы сделать паузу до 5 минут, можно просто переключить вкладку.'}</DialogDescription><Action disabled={blocked} onClick={async()=>{const s=await send('close',a?.id);if(s)setModal(null);}}>{a?.status==='loss_pending'||!a?.tap?'ЗАКОНЧИТЬ БЕЗ НАГРАДЫ':'ЗАБРАТЬ И ВЫЙТИ'}</Action><Action secondary onClick={()=>setModal(null)}>ПРОДОЛЖИТЬ</Action></>}
    {modal==='tutorial'&&<><div className="tutorial-top"><span>КАК ИГРАТЬ</span><button onClick={()=>void nextTutorial(true)} disabled={blocked}>Пропустить</button></div><div className="tutorial-art" key={step}><img src={A+tutorial[step].image} alt=""/></div><div className="step-dots">{tutorial.map((_,i)=><span key={i} className={i===step?'selected':''}/>)}</div><DialogTitle>{tutorial[step].title}</DialogTitle><DialogDescription>{tutorial[step].text}</DialogDescription><Action onClick={()=>void nextTutorial()} disabled={blocked}>{step===3?(playing?'ПРОДОЛЖИТЬ ИГРУ':'НАЧАТЬ ИГРУ'):'ДАЛЬШЕ'}<ChevronRight size={20}/></Action>{step>0&&<button className="text-button" onClick={()=>setStep(step-1)}>Назад</button>}</>}
    {modal==='referral'&&<><img className="modal-art" src={A+'friends.png'} alt="Два пакета Бристоль"/><div className="modal-body"><DialogTitle>Играй с друзьями</DialogTitle><DialogDescription><strong>+ 100 монет</strong> тебе и другу<br/>за код приглашения</DialogDescription>{!state?.invitedBy&&state?.started===0?<><label className="sr-only" htmlFor="friend-code">Код друга</label><input id="friend-code" className="code-input" placeholder="ВВЕДИ КОД ДРУГА" value={refCode} maxLength={20} autoComplete="off" autoCapitalize="characters" onKeyDown={e=>{if(e.key==='Enter'&&!blocked&&refCode.trim().length>=4)void activate();}} onChange={e=>setRefCode(e.target.value.toUpperCase())}/><Action disabled={blocked||refCode.trim().length<4} onClick={activate}>ПРИМЕНИТЬ</Action><p className="demo-code">Для проверки используй код <button onClick={()=>setRefCode('BRISTOL')}>BRISTOL</button></p></>:<p className="ref-status">{state?.invitedBy?<><Check size={18}/> Код друга уже активирован</>:'Код друга можно ввести до первой игры'}</p>}{refMessage&&<p className="success-message">{refMessage}</p>}<div className="own-code"><span>Твой код</span><strong>{state?.referralCode??'…'}</strong></div><Action secondary onClick={copy} disabled={!state}><Copy size={21}/>СКОПИРОВАТЬ СВОЙ</Action>{error&&<p className="field-error">{error}</p>}</div></>}
    {modal==='history'&&<><div className="modal-kicker"><History size={18}/> ТВОИ МОНЕТЫ</div><DialogTitle>История операций</DialogTitle><DialogDescription>Начисления и списания в этой игре</DialogDescription><div className="history-balance">{fmt(state?.balance??0)} <Coin size={40}/></div><div className="transaction-list">{state?.transactions.length?state.transactions.slice(0,historyCount).map(t=><div className="transaction" key={t.id}><div><strong>{t.label}</strong><time>{new Date(t.at).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</time></div><b className={t.amount>0?'positive':''}>{t.amount>0?'+':'−'}{fmt(Math.abs(t.amount))}</b></div>):<div className="empty-state"><Coin size={70}/><p>Здесь появятся твои<br/>первые выигрыши и списания</p></div>}{(state?.transactions.length??0)>historyCount&&<button className="text-button" onClick={()=>setHistoryCount(n=>n+20)}>Показать ещё</button>}</div><p className="small-note">В начале демо тебе доступны 1 000 тестовых монет.</p></>}
    {modal==='rules'&&<><div className="modal-kicker">ОБ ИГРЕ</div><DialogTitle>Собери пакет</DialogTitle><DialogDescription>Тапай, рискуй и забирай монеты вовремя</DialogDescription><div className="rules-content"><section><h3>Каждый тап — новый выбор</h3><p>Тапай по пакету. Выигрыш растёт, но на любом тапе может появиться белка. Нажми «Забрать монеты», чтобы зачислить текущую сумму. До этого весь выигрыш можно потерять. Скорость нажатий не меняет этот шанс. Каждое нажатие сразу показывает закреплённый сервером исход. Белка останавливает серию на своём тапе. В кошелёк попадает только подтверждённый результат.</p></section><section><h3>Бесплатно каждый день</h3><p>Одна бесплатная попытка в сутки. Она обновляется в 00:00 UTC — в 03:00 по Москве. Платную попытку за 100 монет можно выбрать сразу, сохранив бесплатную на потом. Лимит действует для гостевого профиля в этом браузере.</p></section><section><h3>Белка и спасение</h3><p>Один раз за попытку белку можно отогнать за 50 монет и продолжить с того же места. Вторая встреча после спасения завершает игру без выигрыша.</p></section><section><h3>120 тапов до подарка</h3><p>В финале бесплатной игры можно забрать 2 350 монет, платной — 5 000. Полное прохождение также даёт тестовый подарок. Можно остановиться раньше и забрать текущую сумму.</p></section><section><h3>Пригласи друга</h3><p>Введи чужой код до первой игры. Оба получите по 100 монет. Свой код вводить нельзя. В демо действует лимит 5 бонусов в день и 20 всего для пригласившего.</p></section><section><h3>Если выйти из игры</h3><p>Кнопка выхода фиксирует последний подтверждённый выигрыш. При встрече с белкой выход завершает игру без награды. При переключении вкладки или потере связи есть 5 минут, чтобы вернуться и продолжить. Затем попытка завершается автоматически при следующем открытии: удачный результат зачисляется, выигрыш у белки теряется.</p></section><section><h3>Играй без регистрации</h3><p>Вход не нужен. Профиль сохраняется в этом браузере с помощью cookie. В другом браузере, в режиме инкогнито или после удаления cookie будет новый профиль.</p></section><section><h3>Это демонстрация</h3><p>Монеты и подарки тестовые, с программой лояльности «Бристоль» не связаны. Используется рабочая экономика на 120 тапов.</p></section></div><Action secondary onClick={()=>{setStep(0);setModal('tutorial');}}>ПОСМОТРЕТЬ ОБУЧЕНИЕ</Action><button className="text-button" onClick={()=>setModal('demo')}>Настройки демонстрации</button></>}
    {modal==='demo'&&<><div className="modal-kicker">ДЕМОНСТРАЦИЯ</div><DialogTitle>Попробуй все исходы</DialogTitle><DialogDescription>В обычной игре исход каждого тапа случаен. Здесь можно отдельно посмотреть редкие сценарии.</DialogDescription><div className="demo-actions"><button disabled={blocked||playing} onClick={()=>void demo('final')}><img src={A+'stars.png'} alt=""/><span><strong>Один тап до победы</strong><small>Посмотреть финал и подарок</small></span><ChevronRight/></button><button disabled={blocked||playing} onClick={()=>void demo('squirrel',0)}><img src={A+'squirrel-3d.webp'} alt=""/><span><strong>Белка справа</strong><small>Белка на 4-м и 8-м тапах</small></span><ChevronRight/></button><button disabled={blocked||playing} onClick={()=>void demo('squirrel',1)}><span><strong>Белка слева</strong><small>Подбегает и уносит пакет</small></span><ChevronRight/></button><button disabled={blocked||playing} onClick={()=>void demo('squirrel',2)}><span><strong>Белка прыгает</strong><small>Прыжок за пакетом</small></span><ChevronRight/></button><button disabled={blocked||playing} onClick={()=>void demo('balance')}><Coin size={50}/><span><strong>Добавить 1 000 монет</strong><small>Пополнить тестовый баланс</small></span><ChevronRight/></button><button onClick={()=>setModal('gifts')}><img src={A+'gift.png'} alt=""/><span><strong>Мои подарки</strong><small>{state?.gifts.length?`${state.gifts.length} в коллекции`:'Пока нет подарков'}</small></span><ChevronRight/></button></div>{playing&&<p className="small-note">Сначала закончи текущую попытку.</p>}<p className="small-note">Бустер: 50 монет · 1 раз за игру.<br/>Монеты и подарки только для игры.</p></>}
    {modal==='gifts'&&<><img className="small-art" src={A+'gift.png'} alt=""/><DialogTitle>Мои подарки</DialogTitle><DialogDescription>Награды за полное прохождение</DialogDescription>{state?.gifts.length?<div className="gift-list">{state.gifts.map(g=><div key={g.id}><Gift size={25}/><span><strong>Демо-подарок</strong><code>{g.code}</code><small>{new Date(g.at).toLocaleDateString('ru-RU')}</small></span></div>)}</div>:<div className="empty-state"><p>Пройди все 120 тапов,<br/>чтобы получить первый подарок.</p></div>}<p className="small-note">Это пример награды. Демокод нельзя использовать для покупок.</p></>}
    {modal!=='referral'&&error&&<p className="field-error" role="alert">{error}</p>}
    {pending&&!busy&&<Action secondary disabled={busy} onClick={()=>void send('retry')}>ПРОВЕРИТЬ ДЕЙСТВИЕ</Action>}
   </DialogContent>
  </Dialog>}
 </main>;
}
