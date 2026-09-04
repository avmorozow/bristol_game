'use client';

import {useState,useRef,useEffect,useCallback} from 'react';
import {X,Volume2,VolumeX,Copy,History,ChevronRight,Loader2,Check,Gift} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Progress} from '@/components/ui/progress';
import {Toaster,toast} from 'sonner';
import {TapQueue} from '@/lib/game/tap-queue';
import type {Player,CONFIG} from '@/lib/game/engine';

type State=Player&{revision:number;referralCode:string;freeAvailable:boolean;serverTime:number;config:typeof CONFIG};
type ApiPayload=State&{error?:string;code?:string;state:State};
type Command={id:string;action:string;value?:unknown;revision?:number};
type Modal='rules'|'history'|'referral'|'paid'|'tutorial'|'exit'|'demo'|'gifts'|null;
const A='/assets/';
const fmt=(n:number)=>new Intl.NumberFormat('ru-RU').format(n);
const live=(s:State|null)=>!!s?.attempt&&['active','loss_pending','final_ready'].includes(s.attempt.status);
function Coin({size=28}:{size?:number}){return <img src={A+'coin.png'} alt="монет" width={size} height={size} className="coin" draggable={false}/>;}
function Action({children,onClick,disabled,secondary=false,className=''}:{children:React.ReactNode;onClick?:()=>void;disabled?:boolean;secondary?:boolean;className?:string}){return <Button onClick={onClick} disabled={disabled} className={`game-button ${secondary?'secondary':'primary'} ${className}`}>{children}</Button>;}
const tutorial=[
 {title:'Собери пакет',text:'Нажимай на пакет — каждый удачный тап увеличивает выигрыш.',image:'bag.png'},
 {title:'Забирай вовремя',text:'Монеты твои, когда нажмёшь «Забрать». Можно остановиться после любого удачного тапа.',image:'coin.png'},
 {title:'Остерегайся белки',text:'Белка может забрать весь выигрыш. Один раз за игру её можно отогнать за 50 монет.',image:'thief.png'},
 {title:'Дойди до подарка',text:'Пройди 120 тапов, забери монеты и получи подарок. Здесь монеты и подарки тестовые.',image:'stars.png'},
];

export default function Game(){
 const [cashoutWaiting,setCashoutWaiting]=useState(false);
 const [tapBacklog,setTapBacklog]=useState(0);
 const tapQueue=useRef<TapQueue|null>(null),activeAction=useRef(''),cashoutLock=useRef(false),bagElement=useRef<HTMLButtonElement|null>(null);
 const [signInRequired,setSignInRequired]=useState(false);
 const [state,setState]=useState<State|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [modal,setModal]=useState<Modal>(null),[step,setStep]=useState(0),[muted,setMuted]=useState(true),[refCode,setRefCode]=useState(''),[refMessage,setRefMessage]=useState('');
 const [particles,setParticles]=useState<{id:number;amount:number;left:number}[]>([]),[historyCount,setHistoryCount]=useState(20),[pending,setPending]=useState(false);
 const commandDone=useRef<Promise<void>>(Promise.resolve());
 const current=useRef<State|null>(null),lock=useRef(false),pendingCommand=useRef<Command|null>(null),audioRef=useRef<AudioContext|null>(null),particleId=useRef(0);
 const apply=useCallback((s:State)=>{if(!current.current||s.revision>=current.current.revision){current.current=s;setState(s);}},[]);
 const sound=useCallback((kind:'tap'|'win'|'loss')=>{if(muted)return;try{const ctx=audioRef.current??new AudioContext();audioRef.current=ctx;void ctx.resume();const notes=kind==='win'?[523,659,784]:kind==='loss'?[240,180]:[660];notes.forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0.06,ctx.currentTime+i*.09);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+i*.09+.13);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+i*.09);o.stop(ctx.currentTime+i*.09+.14);});}catch{}},[muted]);
 const refresh=useCallback(async()=>{try{const res=await fetch('/api/game',{cache:'no-store'});const data=await res.json() as ApiPayload;setSignInRequired(res.status===401);if(!res.ok)throw new Error(data.error);apply(data);setError('');return data as State;}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить игру.');return null;}finally{setLoading(false);}},[apply]);
 const send=useCallback(async(action:string,value?:unknown):Promise<State|null>=>{
  if(lock.current)return null;
  if(pendingCommand.current&&action!=='retry'){setError('Проверяем предыдущее действие. Нажмите «Повторить».');return null;}
  const cmd=action==='retry'?pendingCommand.current:{id:crypto.randomUUID(),action,value,revision:current.current?.revision};if(!cmd)return null;
  let release!:()=>void;commandDone.current=new Promise<void>(resolve=>{release=resolve;});
  lock.current=true;activeAction.current=cmd.action;setBusy(true);setError('');
  if(cmd.action!=='heartbeat'){pendingCommand.current=cmd;setPending(true);try{sessionStorage.setItem('bristol-pending',JSON.stringify(cmd));}catch{}}
  try{
   let res=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cmd)});let data=await res.json() as ApiPayload;
   // A harmless concurrent update can invalidate the revision. Retry this same
   // batch once against the returned state; its idempotency key stays unchanged.
   if(res.status===409&&cmd.action==='taps'&&data.state?.attempt?.status==='active'&&data.state.attempt.id===(cmd.value as {attemptId:string}).attemptId){
    apply(data.state);cmd.revision=data.state.revision;
    try{sessionStorage.setItem('bristol-pending',JSON.stringify(cmd));}catch{}
    res=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cmd)});data=await res.json() as ApiPayload;
   }
   setSignInRequired(res.status===401);
   if(res.status>=500)throw new Error(data.error??'Проверяем результат операции.');
   pendingCommand.current=null;setPending(false);try{sessionStorage.removeItem('bristol-pending');}catch{}
   if(res.status===409){apply(data.state);return null;}
   if(!res.ok){setError(data.error??'Не удалось выполнить действие.');return null;}
   const before=current.current;apply(data);
   if((cmd.action==='tap'||cmd.action==='taps')&&data.attempt){
    if(data.attempt.status==='loss_pending'||data.attempt.status==='lost')sound('loss');
    else {const delta=data.attempt.reward-(before?.attempt?.reward??0),id=++particleId.current;setParticles(p=>[...p.slice(-5),{id,amount:delta,left:28+(id*19)%48}]);setTimeout(()=>setParticles(p=>p.filter(x=>x.id!==id)),850);}
   }
   if(cmd.action==='cashout')sound('win');
   return data;
  }catch(e){if(cmd.action==='heartbeat'){pendingCommand.current=null;setPending(false);}setError(e instanceof Error?e.message:'Связь прервалась. Результат сохраняется.');return null;}
  finally{lock.current=false;activeAction.current='';setBusy(false);release();}
 },[apply,sound]);
 const transport=useRef(send);transport.current=send;
 useEffect(()=>{
  const queue=new TapQueue({
   position:()=>current.current?.attempt??null,
   readiness:()=>document.visibilityState==='hidden'||(pendingCommand.current&&!lock.current)?'stop':lock.current?'wait':'ready',
   send:async(count,attemptId)=>(await transport.current('taps',{count,attemptId}))?.attempt??null,
   onChange:setTapBacklog,
  });
  tapQueue.current=queue;
  return()=>{queue.dispose();tapQueue.current=null;};
 },[]);
 useEffect(()=>{void refresh().then(s=>{if(s&&!s.tutorial)setModal('tutorial');});try{setMuted(localStorage.getItem('bristol-sound')!=='on');const p=sessionStorage.getItem('bristol-pending');if(p){pendingCommand.current=JSON.parse(p);setPending(true);}}catch{}},[refresh]);
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible'&&live(current.current)&&!lock.current&&!pendingCommand.current&&!tapBacklog&&!cashoutLock.current)void send('heartbeat');},5000);return()=>clearInterval(timer);},[send,tapBacklog]);
 useEffect(()=>{const close=()=>{tapQueue.current?.cancel();if(live(current.current)){const body=JSON.stringify({id:crypto.randomUUID(),action:'close',value:current.current?.attempt?.id});navigator.sendBeacon('/api/game',new Blob([body],{type:'application/json'}));}};const visible=()=>{if(document.visibilityState==='hidden')close();else void refresh();};window.addEventListener('pagehide',close);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('pagehide',close);document.removeEventListener('visibilitychange',visible);};},[refresh]);
 const a=state?.attempt,playing=!!a&&['active','loss_pending','final_ready'].includes(a.status),result=!!a&&['won','lost','abandoned'].includes(a.status),onHome=!playing&&!result;
 const blocked=busy||pending||loading;
 async function start(){const ready=state??await refresh();if(!ready)return;if(!ready.tutorial){setStep(0);setModal('tutorial');return;}if(!ready.freeAvailable){setModal('paid');return;}await send('start');}
 async function nextTutorial(skip=false){if(!skip&&step<3){setStep(step+1);return;}const s=await send('tutorial',skip?'skip':'complete');if(s)setModal(null);}
 const tapBlocked=loading||cashoutWaiting||(pending&&!busy)||(busy&&!['taps','heartbeat'].includes(activeAction.current));
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
  if(tapBlocked||cashoutLock.current||!tapQueue.current?.add())return;
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
   bagElement.current?.getAnimations().forEach(animation=>animation.cancel());
   bagElement.current?.animate([{transform:'scale(.94) rotate(-2deg)'},{transform:'scale(1.025) rotate(1deg)'},{transform:'scale(1)'}],{duration:140,easing:'ease-out'});
  }
  sound('tap');
 }
 function toggleSound(){const next=!muted;setMuted(next);try{localStorage.setItem('bristol-sound',next?'off':'on');}catch{}}
 async function copy(){try{await navigator.clipboard.writeText(state!.referralCode);toast.success('Код скопирован');}catch{toast('Выделите код и скопируйте его');}}
 async function activate(){setRefMessage('');const s=await send('referral',refCode);if(s){setRefMessage('Готово! Вам и другу начислено по 100 тестовых монет.');toast.success('Бонус за друга получен');}}
 async function demo(value:string){const s=await send('demo',value);if(s){setModal(null);if(value==='balance')toast.success('Добавлено 1 000 тестовых монет');}}
 const dismissResult=()=>{if(current.current){const s={...current.current,attempt:null};current.current=s;setState(s);}};
 const showForced=!!a?.scenario&&playing;

 return <main className="game-shell">
  <Toaster position="top-center" richColors/>
  <section className={`game-stage ${onHome?'home-scene':'play-scene'}`} aria-label="Игра Собери пакет">
   <img className="scene-bg" src={A+(onHome?'home.png':'background.png')} alt="" fetchPriority="high"/>
   <div className="scene-shade"/>
   <header className="topbar">
    <div className="top-actions">
     <Button variant="ghost" className="icon-button" aria-label={playing?'Выйти из игры':'На главную'} onClick={()=>playing?setModal('exit'):dismissResult()} disabled={blocked}><X size={25}/></Button>
     <Button variant="ghost" className="icon-button" aria-label={muted?'Включить звук':'Выключить звук'} onClick={toggleSound}>{muted?<VolumeX size={23}/>:<Volume2 size={23}/>}</Button>
    </div>
    <div className="top-actions">
     <button className="wallet" onClick={()=>{setHistoryCount(20);setModal('history');}} aria-label={`Баланс ${state?fmt(state.balance):'загружается'} монет. История операций`}><span>{state?fmt(state.balance):'—'}</span><Coin size={43}/></button>
     <Button variant="ghost" className="icon-button help" aria-label="Правила игры" onClick={()=>setModal('rules')}>?</Button>
    </div>
   </header>

   {onHome&&<div className="home-content">
    <div className="home-banner"><img src={A+'bag.png'} alt=""/><div><h1>Зарабатывай<br/>монеты</h1><p>Тапай по пакету и забирай<br/>выигрыш вовремя</p></div></div>
    <button className="friend-widget" onClick={()=>{setRefMessage('');setModal('referral');}}><img src={A+'referral-widget.png'} alt=""/><span>Бонус<br/>за друга</span></button>
    <div className="home-bottom"><Action onClick={start} disabled={blocked} className="play-button">{loading?<Loader2 className="spin"/>:'ИГРАТЬ'}</Action><span className="price-badge">{state?.freeAvailable?'БЕСПЛАТНО':state?<>{state.config.paidPrice} <Coin size={20}/></>:'Загрузка…'}</span></div>
   </div>}

   {(playing||result)&&<>
    <div className="score-zone">
     <p className="score-caption">{a?.status==='final_ready'?'Все 120 тапов пройдены!':'Накликай максимум монет!'}</p>
     <div className={`score ${a?.reward&&a.reward>=1000?'score-small':''}`}><span aria-live="polite">{fmt(a?.reward??0)}</span><Coin size={64}/></div>
     <div className="progress-info"><span>{a?.tap??0} / 120 тапов</span><span>Подарок в финале <img src={A+'gift.png'} alt=""/></span></div>
     <Progress value={(a?.tap??0)/120*100} className="game-progress" aria-label="Прогресс к подарку"/>
     {showForced&&<p className="scenario-badge">Показательный сценарий</p>}
    </div>
    <div className="tap-area">
     <button ref={bagElement} className="bag-button" onClick={tap} disabled={tapBlocked||a?.status!=='active'} aria-label="Нажать на пакет"><img src={A+'bag.png'} alt="Красный пакет Бристоль" draggable={false}/></button>
     {particles.map(p=><span key={p.id} className="tap-particle" style={{left:p.left+'%'}}>+{p.amount}<Coin size={25}/></span>)}
     {a?.status==='active'&&<p className="tap-hint">{a.tap===0?'Нажимай на пакет':a.boosterUsed?'Спасение использовано':'Продолжай или забери монеты'}</p>}
    </div>
    <div className="game-bottom"><Action onClick={cashout} disabled={loading||cashoutWaiting||(pending&&!busy)||(busy&&!['taps','heartbeat'].includes(activeAction.current))||(!a?.tap&&!tapBacklog)||a?.status!=='active'} secondary className="cashout-button">{cashoutWaiting?<Loader2 size={21} className="spin"/>:null}{cashoutWaiting?'ЗАБИРАЕМ…':'ЗАБРАТЬ МОНЕТЫ'}</Action><span className="unclaimed-note">До зачисления выигрыш можно потерять</span></div>
   </>}

   {error&&<div className="connection-notice" role="alert"><span>{error}</span>{signInRequired?<a className="sign-in-link" href="/signin-with-chatgpt?return_to=%2F" target="_top">Войти</a>:<button onClick={()=>pending?void send('retry'):void refresh()} disabled={busy}>Повторить</button>}</div>}
   {!error&&pending&&!busy&&<div className="connection-notice" role="status"><span>Осталось проверить последнее действие</span><button onClick={()=>void send('retry')} disabled={busy}>Проверить</button></div>}
   <button className="demo-label" onClick={()=>setModal('demo')}>Демо · тестовые монеты</button>
  </section>

  <Dialog open={a?.status==='loss_pending'&&!modal} onOpenChange={()=>{}}>
   <DialogContent className="game-modal illustration-modal" showCloseButton={false} onEscapeKeyDown={e=>e.preventDefault()} onPointerDownOutside={e=>e.preventDefault()}>
    <img className="modal-art thief-art" src={A+'thief.png'} alt="Белка поймала пакет"/>
    <div className="modal-body"><DialogTitle>Отогнать белку?</DialogTitle><DialogDescription>Спаси выигрыш и продолжай с того же места. Один раз за игру.</DialogDescription><div className="at-risk"><span>На кону</span><strong>{fmt(a?.reward??0)} <Coin/></strong></div>
    <Action onClick={()=>void send('booster')} disabled={blocked||(state?.balance??0)<50}>ОТОГНАТЬ ЗА 50 <Coin/></Action>
    {(state?.balance??0)<50&&<p className="field-error">Не хватает монет для спасения</p>}
    <Action secondary onClick={()=>void send('lose')} disabled={blocked}>ЗАКОНЧИТЬ ИГРУ</Action>{error&&<p className="field-error">{error}</p>}{pending&&<Action secondary onClick={()=>void send('retry')} disabled={busy}>Проверить операцию</Action>}</div>
   </DialogContent>
  </Dialog>

  <Dialog open={!!a&&['final_ready','won','lost','abandoned'].includes(a.status)&&!modal} onOpenChange={open=>{if(!open&&a?.status!=='final_ready')dismissResult();}}>
   <DialogContent className="game-modal illustration-modal" showCloseButton={false} onEscapeKeyDown={e=>{if(a?.status==='final_ready')e.preventDefault();}} onPointerDownOutside={e=>{if(a?.status==='final_ready')e.preventDefault();}}>
    <img className={`modal-art ${a?.status==='lost'?'thief-art':'stars-art'}`} src={A+(a?.status==='lost'?'thief.png':a?.status==='abandoned'?'bag.png':'stars.png')} alt=""/>
    <div className="modal-body"><DialogTitle>{a?.status==='final_ready'?'Пакет собран!':a?.status==='won'?'Победа!':a?.status==='lost'?'Вот это белка…':'До новой игры!'}</DialogTitle>
    <DialogDescription>{a?.status==='final_ready'?'Осталось забрать заслуженную награду':a?.status==='won'?'Тестовые монеты уже на балансе':a?.status==='lost'?'Белка забрала незабранные монеты. В следующей игре удача может быть на твоей стороне.':'В этой попытке ещё не было удачных тапов.'}</DialogDescription>
    {['won','final_ready'].includes(a?.status??'')&&<div className="reward-card"><div><span>Монеты</span><strong>+ {fmt(a?.reward??0)} <Coin/></strong></div>{a?.tap===120&&<div><span>Подарок</span><strong>+ 1 <img className="gift-icon" src={A+'gift.png'} alt="подарок"/></strong></div>}</div>}
    {a?.status==='final_ready'?<Action onClick={cashout} disabled={blocked}>ЗАБРАТЬ НАГРАДУ</Action>:<><Action onClick={()=>{dismissResult();void start();}} disabled={blocked}>{state?.freeAvailable?'ИГРАТЬ БЕСПЛАТНО':<>ЗАНОВО ЗА 100 <Coin/></>}</Action>{a?.coupon&&<Action secondary onClick={()=>setModal('gifts')}>МОЙ ПОДАРОК</Action>}<button className="text-button" onClick={dismissResult}>На главную</button></>}
    {error&&<p className="field-error">{error}</p>}{pending&&<Action secondary onClick={()=>void send('retry')} disabled={busy}>Проверить операцию</Action>}</div>
   </DialogContent>
  </Dialog>

  <Dialog open={!!modal} onOpenChange={open=>{if(!open&&modal==='tutorial')void nextTutorial(true);else if(!open)setModal(null);}}>
   <DialogContent className={`game-modal ${modal==='referral'?'illustration-modal':modal==='rules'||modal==='history'?'reading-modal':''} ${modal==='tutorial'?'tutorial-modal':''}`} showCloseButton={false}>
    {modal!=='tutorial'&&<Button variant="ghost" className="modal-close" onClick={()=>setModal(null)} aria-label="Закрыть"><X size={22}/></Button>}
    {modal==='paid'&&<><img className="small-art" src={A+'coin.png'} alt=""/><DialogTitle>Ещё одна игра?</DialogTitle><DialogDescription>Бесплатная попытка на сегодня использована. Новая игра стоит 100 тестовых монет.</DialogDescription><div className="at-risk"><span>Твой баланс</span><strong>{fmt(state?.balance??0)} <Coin/></strong></div><Action disabled={blocked||(state?.balance??0)<100} onClick={async()=>{const s=await send('start');if(s)setModal(null);}}>ИГРАТЬ ЗА 100 <Coin/></Action>{(state?.balance??0)<100&&<p className="field-error">Не хватает монет. Тестовый баланс можно пополнить в демо-режиме.</p>}<button className="text-button" onClick={()=>setModal(null)}>Вернуться</button></>}
    {modal==='exit'&&<><DialogTitle>Закончить игру?</DialogTitle><DialogDescription>{a?.status==='loss_pending'?'Если уйти сейчас, белка заберёт незабранный выигрыш.':'Сохраним результат последнего подтверждённого тапа.'}</DialogDescription><Action disabled={blocked} onClick={async()=>{const s=await send('close',a?.id);if(s)setModal(null);}}>{a?.status==='loss_pending'?'ЗАКОНЧИТЬ БЕЗ НАГРАДЫ':'ЗАБРАТЬ И ВЫЙТИ'}</Action><Action secondary onClick={()=>setModal(null)}>ПРОДОЛЖИТЬ</Action></>}
    {modal==='tutorial'&&<><div className="tutorial-top"><span>КАК ИГРАТЬ</span><button onClick={()=>void nextTutorial(true)} disabled={blocked}>Пропустить</button></div><div className="tutorial-art"><img src={A+tutorial[step].image} alt=""/></div><div className="step-dots">{tutorial.map((_,i)=><span key={i} className={i===step?'selected':''}/>)}</div><DialogTitle>{tutorial[step].title}</DialogTitle><DialogDescription>{tutorial[step].text}</DialogDescription><Action onClick={()=>void nextTutorial()} disabled={blocked}>{step===3?'ВСЁ ПОНЯТНО':'ДАЛЬШЕ'}<ChevronRight size={20}/></Action>{step>0&&<button className="text-button" onClick={()=>setStep(step-1)}>Назад</button>}</>}
    {modal==='referral'&&<><img className="modal-art" src={A+'friends.png'} alt="Два пакета Бристоль"/><div className="modal-body"><DialogTitle>Играй с друзьями</DialogTitle><DialogDescription><strong>+ 100 монет</strong> тебе и другу<br/>за код приглашения</DialogDescription>{!state?.invitedBy&&state?.started===0?<><label className="sr-only" htmlFor="friend-code">Код друга</label><input id="friend-code" className="code-input" placeholder="ВВЕДИ КОД ДРУГА" value={refCode} maxLength={20} onChange={e=>setRefCode(e.target.value.toUpperCase())}/><Action disabled={blocked||refCode.trim().length<4} onClick={activate}>ПРИМЕНИТЬ</Action><p className="demo-code">Для проверки используй код <button onClick={()=>setRefCode('BRISTOL')}>BRISTOL</button></p></>:<p className="ref-status">{state?.invitedBy?<><Check size={18}/> Код друга уже активирован</>:'Код друга можно ввести до первой игры'}</p>}{refMessage&&<p className="success-message">{refMessage}</p>}<div className="own-code"><span>Твой код</span><strong>{state?.referralCode??'…'}</strong></div><Action secondary onClick={copy}><Copy size={21}/>СКОПИРОВАТЬ СВОЙ</Action>{error&&<p className="field-error">{error}</p>}</div></>}
    {modal==='history'&&<><div className="modal-kicker"><History size={18}/> ТВОИ МОНЕТЫ</div><DialogTitle>История операций</DialogTitle><DialogDescription>Начисления и списания в этой игре</DialogDescription><div className="history-balance">{fmt(state?.balance??0)} <Coin size={40}/></div><div className="transaction-list">{state?.transactions.length?state.transactions.slice(0,historyCount).map(t=><div className="transaction" key={t.id}><div><strong>{t.label}</strong><time>{new Date(t.at).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</time></div><b className={t.amount>0?'positive':''}>{t.amount>0?'+':'−'}{fmt(Math.abs(t.amount))}</b></div>):<div className="empty-state"><Coin size={70}/><p>Здесь появятся твои<br/>первые выигрыши и списания</p></div>}{(state?.transactions.length??0)>historyCount&&<button className="text-button" onClick={()=>setHistoryCount(n=>n+20)}>Показать ещё</button>}</div><p className="small-note">В начале демо тебе доступны 1 000 тестовых монет.</p></>}
    {modal==='rules'&&<><div className="modal-kicker">ОБ ИГРЕ</div><DialogTitle>Собери пакет</DialogTitle><DialogDescription>Тапай, рискуй и забирай монеты вовремя</DialogDescription><div className="rules-content"><section><h3>Каждый тап — новый выбор</h3><p>Тапай по пакету. Выигрыш растёт, но на любом тапе может появиться белка. Нажми «Забрать монеты», чтобы зачислить текущую сумму. До этого весь выигрыш можно потерять.</p></section><section><h3>Бесплатно каждый день</h3><p>Одна бесплатная попытка в сутки. Она обновляется в 00:00 UTC — в 03:00 по Москве. Дополнительная игра стоит 100 монет.</p></section><section><h3>Белка и спасение</h3><p>Один раз за попытку белку можно отогнать за 50 монет и продолжить с того же места. Вторая встреча после спасения завершает игру без выигрыша.</p></section><section><h3>120 тапов до подарка</h3><p>В финале бесплатной игры можно забрать 2 350 монет, платной — 5 000. Полное прохождение также даёт тестовый подарок. Можно остановиться раньше и забрать текущую сумму.</p></section><section><h3>Пригласи друга</h3><p>Введи чужой код до первой игры. Оба получите по 100 монет. Свой код вводить нельзя. В демо действует лимит 5 бонусов в день и 20 всего для пригласившего.</p></section><section><h3>Если выйти из игры</h3><p>Зафиксируем последний подтверждённый выигрыш. При встрече с белкой выход завершает игру без награды. После потери связи состояние проверится при возвращении.</p></section><section><h3>Это демонстрация</h3><p>Монеты и подарки тестовые, с программой лояльности «Бристоль» не связаны. Используется рабочая экономика на 120 тапов.</p></section></div><Action secondary onClick={()=>{setStep(0);setModal('tutorial');}}>ПОСМОТРЕТЬ ОБУЧЕНИЕ</Action><button className="text-button" onClick={()=>setModal('demo')}>Настройки демонстрации</button></>}
    {modal==='demo'&&<><div className="modal-kicker">ДЕМОНСТРАЦИЯ</div><DialogTitle>Попробуй все исходы</DialogTitle><DialogDescription>В обычной игре исход каждого тапа случаен. Здесь можно отдельно посмотреть редкие сценарии.</DialogDescription><div className="demo-actions"><button disabled={blocked||playing} onClick={()=>void demo('final')}><img src={A+'stars.png'} alt=""/><span><strong>Один тап до победы</strong><small>Посмотреть финал и подарок</small></span><ChevronRight/></button><button disabled={blocked||playing} onClick={()=>void demo('squirrel')}><img src={A+'thief.png'} alt=""/><span><strong>Встреча с белкой</strong><small>Белка на 4-м и 8-м тапах</small></span><ChevronRight/></button><button disabled={blocked||playing} onClick={()=>void demo('balance')}><Coin size={50}/><span><strong>Добавить 1 000 монет</strong><small>Пополнить тестовый баланс</small></span><ChevronRight/></button><button onClick={()=>setModal('gifts')}><img src={A+'gift.png'} alt=""/><span><strong>Мои подарки</strong><small>{state?.gifts.length?`${state.gifts.length} в коллекции`:'Пока нет подарков'}</small></span><ChevronRight/></button></div>{playing&&<p className="small-note">Сначала закончи текущую попытку.</p>}<p className="small-note">Бустер: 50 монет · 1 раз за игру.<br/>Боевой баланс не подключён.</p></>}
    {modal==='gifts'&&<><img className="small-art" src={A+'gift.png'} alt=""/><DialogTitle>Мои подарки</DialogTitle><DialogDescription>Награды за полное прохождение</DialogDescription>{state?.gifts.length?<div className="gift-list">{state.gifts.map(g=><div key={g.id}><Gift size={25}/><span><strong>Демо-подарок</strong><code>{g.code}</code><small>{new Date(g.at).toLocaleDateString('ru-RU')}</small></span></div>)}</div>:<div className="empty-state"><p>Пройди все 120 тапов,<br/>чтобы получить первый подарок.</p></div>}<p className="small-note">Это пример награды. Демокод нельзя использовать для покупок.</p></>}
    {modal!=='referral'&&error&&<p className="field-error" role="alert">{error}</p>}
    {pending&&<Action secondary disabled={busy} onClick={()=>void send('retry')}>ПРОВЕРИТЬ ДЕЙСТВИЕ</Action>}
   </DialogContent>
  </Dialog>
 </main>;
}
