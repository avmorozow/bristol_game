import assert from 'node:assert/strict';
import {test,beforeEach,after} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';

const root=new URL('../',import.meta.url).pathname;
const temp=await mkdtemp(join(tmpdir(),'bristol-tests-'));
await build({entryPoints:[join(root,'lib/game/engine.ts'),join(root,'app/api/game/route.ts'),join(root,'lib/game/tap-queue.ts'),join(root,'lib/game/feedback.ts'),join(root,'lib/game/audio.ts'),join(root,'lib/game/result-view.ts'),join(root,'lib/game/tap-plan.ts'),join(root,'lib/game/squirrel-taunts.ts')],outdir:temp,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},plugins:[{name:'test-d1',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cloudflare:workers',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__TEST_ENV;',loader:'js'}));}}]});
const env={DB:null};globalThis.__TEST_ENV=env;
const engine=await import(pathToFileURL(join(temp,'lib/game/engine.mjs')));
const api=await import(pathToFileURL(join(temp,'app/api/game/route.mjs')));
let sql;
const cookies=new Map();
class Statement{
 constructor(query,values=[]){this.query=query;this.values=values;}
 bind(...values){return new Statement(this.query,values);}
 async first(){return sql.prepare(this.query).get(...this.values)??null;}
 execute(){const r=sql.prepare(this.query).run(...this.values);return {success:true,meta:{changes:Number(r.changes)}};}
 async run(){return this.execute();}
}
const migration=await readFile(join(root,'drizzle/0000_material_blue_blade.sql'),'utf8');
beforeEach(()=>{cookies.clear();sql?.close();sql=new DatabaseSync(':memory:');sql.exec(migration);env.DB={prepare:q=>new Statement(q),batch:async statements=>{sql.exec('BEGIN');try{const result=statements.map(s=>s.execute());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};});
after(async()=>{sql?.close();await rm(temp,{recursive:true,force:true});});
const headers=id=>({'Cookie':cookies.get(id)??'','Content-Type':'application/json','Origin':'https://bristol.test'});
async function get(id='player'){const r=await api.GET(new Request('https://bristol.test/api/game',{headers:headers(id)}));assert.equal(r.status,200);if(r.headers.get('set-cookie'))cookies.set(id,r.headers.get('set-cookie').split(';')[0]);return r.json();}
async function post(id,command){const r=await api.POST(new Request('https://bristol.test/api/game',{method:'POST',headers:headers(id),body:JSON.stringify(command)}));return {status:r.status,data:await r.json()};}
async function send(action,value,id='player'){const s=await get(id);const r=await post(id,{id:crypto.randomUUID(),action,value,revision:s.revision});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
const now=Date.UTC(2026,8,4,12);
const step=(s,action,value,random=()=>1,time=now)=>engine.transition(s,action,value,time,crypto.randomUUID(),random);

test('table covers exactly 120 taps and uses total rewards, not sums',async()=>{
 const table=JSON.parse(await readFile(join(root,'lib/game/economy.json'),'utf8'));assert.equal(table.length,120);
 assert.equal(engine.payout(1,'free'),2);assert.equal(engine.payout(2,'free'),3);assert.equal(engine.payout(1,'paid'),102);assert.equal(engine.payout(120,'free'),2350);assert.equal(engine.payout(120,'paid'),5000);
 for(const [i,r] of table.entries()){assert.equal(r.tap,i+1);assert.ok(r.lossProbability>=0&&r.lossProbability<=1);}
 let s=step(engine.initialPlayer(),'start');s=step(step(s,'tap'),'tap');s=step(s,'cashout');assert.equal(s.balance,1003);
});
test('daily free quota is consumed at start and resets at UTC midnight',()=>{
 let s=step(engine.initialPlayer(),'start');const id=s.attempt.id;s=step(s,'close',id);s=step(s,'start');assert.equal(s.attempt.kind,'paid');assert.equal(s.balance,900);s=step(s,'close',s.attempt.id);s=step(s,'start',undefined,()=>1,Date.UTC(2026,8,5));assert.equal(s.attempt.kind,'free');assert.equal(s.balance,900);
});
test('booster saves the same failed tap without reroll and second loss ends with zero',()=>{
 let s=step(engine.initialPlayer(),'start');s=step(s,'tap',undefined,()=>0);assert.equal(s.attempt.status,'loss_pending');const reward=s.attempt.reward;s=step(s,'booster');assert.equal(s.balance,950);assert.equal(s.attempt.tap,1);assert.equal(s.attempt.reward,reward);assert.equal(s.attempt.status,'active');s=step(s,'tap',undefined,()=>0);assert.equal(s.attempt.status,'lost');assert.equal(s.attempt.reward,0);assert.throws(()=>step(s,'booster'),e=>e.code==='booster_unavailable');
});
test('cashout credits once; close cannot credit again',()=>{
 let s=step(engine.initialPlayer(),'start');s=step(s,'tap');s=step(s,'cashout');assert.equal(s.balance,1002);s=step(s,'close',s.attempt.id);assert.equal(s.balance,1002);assert.equal(s.transactions.length,1);assert.throws(()=>step(s,'cashout'));
});
test('final tap produces one gift only when settled, including rescue on tap120',()=>{
 let s=step(engine.initialPlayer(),'start');for(let n=1;n<120;n++)s=step(s,'tap');s=step(s,'tap',undefined,()=>0);assert.equal(s.attempt.status,'loss_pending');assert.equal(s.gifts.length,0);s=step(s,'booster');assert.equal(s.attempt.status,'final_ready');s=step(s,'cashout');assert.equal(s.balance,3300);assert.equal(s.gifts.length,1);assert.equal(step(s,'close',s.attempt.id).gifts.length,1);
});
test('expired active attempt pays last confirmed total; expired squirrel pays nothing',()=>{
 let s=step(engine.initialPlayer(),'start');s=step(s,'tap');let expired=engine.expire(s,now+engine.CONFIG.leaseMs+1);assert.equal(expired.balance,1002);assert.equal(expired.attempt.reason,'connection');assert.equal(engine.expire(expired,now+engine.CONFIG.leaseMs*2).balance,1002);
 s=step(s,'tap',undefined,()=>0);expired=engine.expire(s,now+engine.CONFIG.leaseMs+1);assert.equal(expired.balance,1000);assert.equal(expired.attempt.status,'lost');
});
test('API opens a guest profile and rejects cross-site requests',async()=>{
 const r=await api.GET(new Request('https://bristol.test/api/game'));assert.equal(r.status,200);
 const cookie=r.headers.get('set-cookie');assert.match(cookie,/bristol_guest=[a-f0-9]{64};/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);
 assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).balance,1000);
 const h={...headers('player'),Origin:'https://untrusted.test'};assert.equal((await api.POST(new Request('https://bristol.test/api/game',{method:'POST',headers:h,body:'{}'}))).status,403);
});
test('concurrent start requests cannot spend two attempts',async()=>{
 const s=await get();const r=await Promise.all([1,2].map(()=>post('player',{id:crypto.randomUUID(),action:'start',revision:s.revision})));assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);const fresh=await get();assert.equal(fresh.started,1);assert.equal(fresh.balance,1000);
});
test('same command replay returns original outcome and cannot increment tap or reroll',async()=>{
 let s=await send('demo','squirrel');const c={id:crypto.randomUUID(),action:'tap',revision:s.revision};const first=await post('player',c),second=await post('player',c);assert.equal(first.status,200);assert.deepEqual(first,second);assert.equal((await get()).attempt.tap,1);
 const changed=await post('player',{...c,action:'booster'});assert.equal(changed.data.code,'key_reused');
});
test('cashout retries and reloading preserve a single credit in SQLite',async()=>{
 await send('demo','squirrel');const s=await send('tap');const c={id:crypto.randomUUID(),action:'cashout',revision:s.revision};const r=await Promise.all([post('player',c),post('player',c)]);assert.ok(r.every(x=>x.status===200));let fresh=await get();assert.equal(fresh.balance,1002);assert.equal(fresh.transactions.length,1);fresh=await get();assert.equal(fresh.balance,1002);
});
test('late exit beacon for an older attempt cannot close a new attempt',async()=>{
 const old=await send('demo','squirrel');await send('close',old.attempt.id);const fresh=await send('start');const r=await post('player',{id:crypto.randomUUID(),action:'close',value:old.attempt.id});assert.equal(r.status,200);assert.equal(r.data.attempt.id,fresh.attempt.id);assert.equal(r.data.attempt.status,'active');
});
test('referral atomically credits both players and cannot be reused',async()=>{
 const inviter=await get('friend');await send('referral',inviter.referralCode);assert.equal((await get()).balance,1100);assert.equal((await get('friend')).balance,1100);const s=await get();const r=await post('player',{id:crypto.randomUUID(),action:'referral',value:inviter.referralCode,revision:s.revision});assert.equal(r.data.code,'already_invited');assert.equal((await get('friend')).balance,1100);
});
test('referral rejects own code and codes entered after first game',async()=>{
 let s=await get();let r=await post('player',{id:crypto.randomUUID(),action:'referral',value:s.referralCode,revision:s.revision});assert.equal(r.data.code,'own_code');await send('start');s=await get();r=await post('player',{id:crypto.randomUUID(),action:'referral',value:'BRISTOL',revision:s.revision});assert.equal(r.data.code,'referral_closed');
});
test('referral quota limits rewards without charging the unsuccessful invitee',async()=>{
 const inviter=await get('friend');for(let i=0;i<5;i++)await send('referral',inviter.referralCode,'invitee'+i);const newcomer=await get('newcomer');const r=await post('newcomer',{id:crypto.randomUUID(),action:'referral',value:inviter.referralCode,revision:newcomer.revision});assert.equal(r.data.code,'referral_limit');assert.equal((await get('newcomer')).balance,1000);assert.equal((await get('friend')).balance,1500);
});
test('insufficient funds cannot buy a paid attempt or a booster',()=>{
 let s=engine.initialPlayer();s.balance=99;s.freeDate=engine.utcDate(now);assert.throws(()=>step(s,'start'),e=>e.code==='insufficient_funds');assert.equal(s.balance,99);s.freeDate=null;s=step(s,'start');s.balance=49;s=step(s,'tap',undefined,()=>0);assert.throws(()=>step(s,'booster'),e=>e.code==='insufficient_funds');assert.equal(s.balance,49);assert.equal(s.attempt.status,'loss_pending');
});

test('guest profile plays without ChatGPT headers and restores the same wallet',async()=>{
 const initial=await get();await send('tutorial','complete');const started=await send('start');assert.equal(started.attempt.kind,'free');
 let tapped=await send('tap');if(tapped.attempt.status==='loss_pending')tapped=await send('booster');
 const result=await send('cashout');assert.equal(result.balance,tapped.balance+2);
 const restored=await get();assert.equal(restored.referralCode,initial.referralCode);assert.deepEqual(restored.transactions,result.transactions);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM players').get().n,1);
 assert.ok(!JSON.stringify(sql.prepare('SELECT * FROM players').all()).includes(cookies.get('player').split('=')[1]));
});
test('guest profiles are isolated; forged ChatGPT headers do not select a profile',async()=>{
 const first=await get('one'),second=await get('two');assert.notEqual(first.referralCode,second.referralCode);
 await send('demo','balance','one');assert.equal((await get('two')).balance,1000);
 const read=await api.GET(new Request('https://bristol.test/api/game',{headers:{...headers('two'),'oai-authenticated-user-id':'one','oai-authenticated-user-email':'player@example.test'}}));assert.equal((await read.json()).referralCode,second.referralCode);
 const anonymous=await api.POST(new Request('https://bristol.test/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),action:'start',revision:0,user:'one'})}));assert.equal(anonymous.status,401);
 const invalid=await api.GET(new Request('https://bristol.test/api/game',{headers:{Cookie:'bristol_guest=one'}}));assert.equal(invalid.status,200);assert.match(invalid.headers.get('set-cookie'),/bristol_guest=[a-f0-9]{64}/);
});
test('session cannot be changed by a cross-site form submission',async()=>{
 await get();const r=await api.POST(new Request('https://bristol.test/api/game',{method:'POST',headers:{...headers('player'),'Content-Type':'text/plain'},body:'{}'}));assert.equal(r.status,415);
 const cross=await api.POST(new Request('https://bristol.test/api/game',{method:'POST',headers:{...headers('player'),'sec-fetch-site':'cross-site'},body:'{}'}));assert.equal(cross.status,403);assert.equal((await get()).started,0);
});
test('a dismissed result stays dismissed after reload and an active game cannot be dismissed',async()=>{
 let s=await send('demo','squirrel');const active=await post('player',{id:crypto.randomUUID(),action:'dismiss',value:s.attempt.id,revision:s.revision});assert.equal(active.data.code,'active_attempt');
 await send('tap');s=await send('cashout');const balance=s.balance;await send('dismiss',s.attempt.id);s=await get();assert.equal(s.attempt,null);assert.equal(s.balance,balance);assert.equal(s.transactions.length,1);
});
test('five-minute grace period preserves a short pause and settles a long absence once',()=>{
 let s=step(engine.initialPlayer(),'start');s=step(s,'tap');assert.equal(engine.expire(s,now+60000).attempt.status,'active');
 s=step(s,'heartbeat',undefined,()=>1,now+60000);assert.equal(engine.expire(s,now+engine.CONFIG.leaseMs).attempt.status,'active');
 const settled=engine.expire(s,now+60000+engine.CONFIG.leaseMs+1);assert.equal(settled.balance,1002);assert.equal(engine.expire(settled,now+engine.CONFIG.leaseMs*3).balance,1002);
});
test('the demonstration referral works for every guest but only once per profile',async()=>{
 for(let i=0;i<7;i++){const s=await send('referral','BRISTOL','demo'+i);assert.equal(s.balance,1100);assert.equal(s.invitedBy,'BRISTOL');}
 const s=await get('demo6');const r=await post('demo6',{id:crypto.randomUUID(),action:'referral',value:'BRISTOL',revision:s.revision});assert.equal(r.data.code,'already_invited');
});
test('next-tap information reflects the exact economy and explicit demonstration rules',()=>{
 let s=step(engine.initialPlayer(),'start');let view=engine.publicState(s,1,'CODE',now);assert.equal(view.nextTap.reward,2);assert.equal(view.nextTap.lossPercent,engine.probability(1)*100);
 s=step(s,'taps',{count:3,attemptId:s.attempt.id});view=engine.publicState(s,2,'CODE',now);assert.equal(view.nextTap.reward,engine.payout(4,'free'));
 s=step(engine.initialPlayer(),'demo','squirrel');s=step(s,'taps',{count:3,attemptId:s.attempt.id});assert.equal(engine.publicState(s,3,'CODE',now).nextTap.lossPercent,100);
 s=step(engine.initialPlayer(),'demo','final');assert.equal(engine.publicState(s,3,'CODE',now).nextTap.lossPercent,0);
});

test('rapid tap batch stops at first squirrel and does not replay on retry',async()=>{
 let s=await send('demo','squirrel');const command={id:crypto.randomUUID(),action:'taps',value:{count:12,attemptId:s.attempt.id},revision:s.revision};
 const response=await post('player',command);assert.equal(response.status,200);assert.equal(response.data.attempt.tap,4);assert.equal(response.data.attempt.status,'loss_pending');
 assert.deepEqual(await post('player',command),response);
 s=await send('booster');s=await send('taps',{count:12,attemptId:s.attempt.id});assert.equal(s.attempt.tap,8);assert.equal(s.attempt.status,'lost');assert.equal(s.attempt.reward,0);
});

test('batch preserves per-tap RNG, limits and the final reward',()=>{
 let a=step(engine.initialPlayer(),'start');const values=[.5,.9,.7,.6,.8,.9];let i=0;
 const b=step(a,'taps',{count:6,attemptId:a.attempt.id},()=>values[i++]);assert.equal(i,6);
 i=0;for(let n=0;n<6;n++)a=step(a,'tap',undefined,()=>values[i++]);assert.deepEqual(a,b);
 assert.throws(()=>step(a,'taps',{count:0,attemptId:a.attempt.id}),e=>e.code==='invalid_taps');
 assert.throws(()=>step(a,'taps',{count:21,attemptId:a.attempt.id}),e=>e.code==='invalid_taps');
 assert.throws(()=>step(a,'taps',{count:1,attemptId:'another-attempt'}),e=>e.code==='wrong_attempt');
 a=step(engine.initialPlayer(),'demo','final');a=step(a,'taps',{count:20,attemptId:a.attempt.id});assert.equal(a.attempt.tap,120);assert.equal(a.attempt.status,'final_ready');assert.equal(a.attempt.reward,2350);
});

test('heartbeat keeps the game revision valid for queued taps',async()=>{
 const s=await send('demo','squirrel');const alive=await post('player',{id:crypto.randomUUID(),action:'heartbeat',revision:s.revision});assert.equal(alive.status,200);assert.equal(alive.data.revision,s.revision);
 const tapped=await post('player',{id:crypto.randomUUID(),action:'taps',value:{count:2,attemptId:s.attempt.id},revision:s.revision});assert.equal(tapped.status,200);assert.equal(tapped.data.attempt.tap,2);
});

const {TapQueue}=await import(pathToFileURL(join(temp,'lib/game/tap-queue.mjs')));
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
function queueHarness(){
 let position={id:'attempt',status:'active',tap:0};const requests=[],counts=[];
 const queue=new TapQueue({position:()=>position,readiness:()=> 'ready',onChange:n=>counts.push(n),send:(count,attemptId)=>new Promise(resolve=>requests.push({count,attemptId,finish:(status='active')=>{position={...position,tap:position.tap+count,status};resolve(position);}}))});
 return {queue,requests,counts,position:()=>position};
}
test('taps are accepted immediately while the first network response is delayed',async()=>{
 const {queue,requests,position}=queueHarness();for(let i=0;i<8;i++)assert.equal(queue.add(),true);
 assert.equal(requests.length,1);assert.equal(requests[0].count,1);assert.equal(position().tap,0);
 let flushed=false;const done=queue.flush().then(()=>{flushed=true;});assert.equal(flushed,false);
 requests[0].finish();await nextTurn();assert.equal(requests.length,2);assert.equal(requests[1].count,7);assert.equal(flushed,false);
 requests[1].finish();await done;assert.equal(position().tap,8);assert.equal(flushed,true);queue.dispose();
});
test('queued taps are discarded on a squirrel or cancelled exit',async()=>{
 const h=queueHarness();h.queue.add();h.queue.add();h.queue.add();const done=h.queue.flush();h.requests[0].finish('loss_pending');await done;assert.equal(h.requests.length,1);assert.equal(h.queue.add(),false);h.queue.dispose();
 const exit=queueHarness();exit.queue.add();exit.queue.add();exit.queue.cancel();const closed=exit.queue.flush();exit.requests[0].finish();await closed;assert.equal(exit.requests.length,1);exit.queue.dispose();
});

test('explicit paid mode preserves the free daily attempt and explicit free cannot charge money',()=>{
 let s=step(engine.initialPlayer(),'start','paid');assert.equal(s.attempt.kind,'paid');assert.equal(s.balance,900);assert.equal(s.freeDate,null);
 s=step(s,'close',s.attempt.id);s=step(s,'start','free');assert.equal(s.attempt.kind,'free');assert.equal(s.balance,900);
 s=step(s,'close',s.attempt.id);assert.throws(()=>step(s,'start','free'),e=>e.code==='free_used');assert.equal(s.balance,900);
 assert.throws(()=>step(s,'start','surprise'),e=>e.code==='invalid_mode');
 s=step(s,'start','free',()=>1,Date.UTC(2026,8,5));assert.equal(s.attempt.kind,'free');assert.equal(s.balance,900);
});
test('paid mode replay charges exactly once and concurrent explicit free starts consume only one quota',async()=>{
 let s=await get();const c={id:crypto.randomUUID(),action:'start',value:'paid',revision:s.revision};const first=await post('player',c);assert.equal(first.data.balance,900);assert.equal(first.data.freeAvailable,true);assert.deepEqual(await post('player',c),first);
 await send('close',first.data.attempt.id);s=await get();const r=await Promise.all([1,2].map(()=>post('player',{id:crypto.randomUUID(),action:'start',value:'free',revision:s.revision})));assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);assert.equal((await get()).balance,900);
});
test('120 immediate taps are accepted before a delayed response, without silent loss or oversized batches',async()=>{
 const h=queueHarness();const start=performance.now();for(let i=0;i<120;i++){assert.equal(h.queue.add(),true);assert.equal(h.queue.preview().tap,i+1);}
 assert.ok(performance.now()-start<100,'synchronous feedback must not await transport');assert.equal(h.queue.add(),false);assert.equal(h.position().tap,0);assert.equal(h.requests.length,1);
 const done=h.queue.flush();for(let i=0;i<h.requests.length;i++){assert.ok(h.requests[i].count<=20);h.requests[i].finish(i===6?'final_ready':'active');await nextTurn();}
 await done;assert.equal(h.position().tap,120);assert.equal(h.requests.length,7);assert.equal(h.queue.preview().pending,0);h.queue.dispose();
});
test('projection never double-counts acknowledged taps and never carries into another attempt',async()=>{
 let p={id:'first',tap:60,status:'active'},finish;const changes=[];
 const q=new TapQueue({position:()=>p,readiness:()=> 'ready',onChange:(pending,tap)=>changes.push({pending,tap}),send:count=>new Promise(resolve=>{finish=()=>{p={...p,tap:p.tap+count};assert.equal(q.preview().tap,62);resolve(p);};})});
 q.add();q.add();assert.deepEqual(q.preview(),{tap:62,pending:2});finish();await nextTurn();assert.deepEqual(q.preview(),{tap:62,pending:1});finish();await q.flush();
 p={id:'second',tap:0,status:'active'};q.add();assert.deepEqual(q.preview(),{tap:1,pending:1});q.dispose();
});
test('a failed connection rolls the provisional projection back to the confirmed tap',async()=>{
 let p={id:'a',tap:5,status:'active'},fail;const q=new TapQueue({position:()=>p,readiness:()=> 'ready',send:()=>new Promise(resolve=>{fail=()=>resolve(null);})});
 for(let i=0;i<30;i++)q.add();assert.equal(q.preview().tap,35);const done=q.flush();fail();await done;assert.deepEqual(q.preview(),{tap:5,pending:0});q.dispose();
});

const feedback=await import(pathToFileURL(join(temp,'lib/game/feedback.mjs')));
const {GameAudio}=await import(pathToFileURL(join(temp,'lib/game/audio.mjs')));
test('every queued tap previews the exact cumulative table and a squirrel restores authoritative points',()=>{
 let s=step(engine.initialPlayer(),'start','paid');
 for(let n=1;n<=120;n++){const p=feedback.tapPreview(s.attempt,n);assert.equal(p.tap,n);assert.equal(p.reward,engine.payout(n,'paid'));assert.equal(p.pending,true);}
 assert.equal(s.balance,900);assert.equal(s.attempt.reward,0);
 s=step(s,'tap',undefined,()=>0);assert.deepEqual(feedback.tapPreview(s.attempt,45),{tap:1,reward:102,pending:false});
 s=step(s,'booster');assert.match(feedback.encouragement(s.attempt),/Вторая.*спасени/);
 s=step(s,'tap',undefined,()=>0);assert.deepEqual(feedback.tapPreview(s.attempt,45),{tap:2,reward:0,pending:false});
});
test('haptics uses one short pulse and tolerates disabled, unsupported or rejected vibration',()=>{
 const pulses=[];assert.equal(feedback.vibrateTap(true,{vibrate:n=>(pulses.push(n),true)}),true);assert.deepEqual(pulses,[10]);
 assert.equal(feedback.vibrateTap(false,{vibrate:()=>assert.fail('disabled')}),false);assert.equal(feedback.vibrateTap(true,{}),false);assert.equal(feedback.vibrateTap(true,{vibrate:()=>{throw new Error('unavailable');}}),false);
});
function audioHarness(){
 const oscillators=[],gains=[];const param=()=>({value:0,changes:[],setValueAtTime(v){this.changes.push(v);},setTargetAtTime(v){this.changes.push(v);},exponentialRampToValueAtTime(v){this.changes.push(v);}});
 const ctx={state:'suspended',currentTime:0,destination:{},createGain(){const n={gain:param(),connect(){},disconnect(){}};gains.push(n);return n;},createOscillator(){const o={frequency:param(),connect(){},disconnect(){},start(time){this.startedAt=time;},stop(){this.onended?.();}};oscillators.push(o);return o;},async resume(){this.state='running';},async close(){this.state='closed';}};
 const audio=new GameAudio(()=>ctx);return {audio,ctx,oscillators,gains};
}
test('music starts after interaction, pauses when hidden or muted, and effects obey preferences',async()=>{
 const h=audioHarness();try{
 h.audio.setActive(true);assert.equal(h.oscillators.length,0);h.audio.unlock();await nextTurn();assert.ok(h.oscillators.length>=3,'melody, bass and beat scheduled');
 let n=h.oscillators.length;h.audio.play('tap');assert.equal(h.oscillators.length,n+2);
 h.audio.configure({muted:false,music:true,effects:false});n=h.oscillators.length;h.audio.play('tap');assert.equal(h.oscillators.length,n);
 h.audio.configure({muted:true,music:true,effects:true});h.audio.play('win');assert.equal(h.oscillators.length,n);assert.equal(h.gains[0].gain.changes.at(-1),0);
 h.audio.configure({muted:false,music:true,effects:true});h.audio.setHidden(true);assert.equal(h.gains[0].gain.changes.at(-1),0);n=h.oscillators.length;h.audio.play('loss');assert.equal(h.oscillators.length,n);
 h.audio.setHidden(false);assert.equal(h.gains[0].gain.changes.at(-1),.38);h.audio.setActive(false);assert.equal(h.gains[1].gain.changes.at(-1),0);
 }finally{h.audio.dispose();}assert.equal(h.ctx.state,'closed');
});

const resultView=await import(pathToFileURL(join(temp,'lib/game/result-view.mjs')));
test('rapid successful taps sound immediately, rise with progress and reset for a new attempt',async()=>{
 const h=audioHarness();try{
  h.audio.configure({muted:false,music:false,effects:true});h.audio.unlock();await nextTurn();h.ctx.currentTime=4;
  let previous=0,first=0;
  for(let tap=1;tap<=119;tap++){
   const n=h.oscillators.length;h.audio.play('tap',tap);const voices=h.oscillators.slice(n);
   assert.equal(voices.length,tap%20===0?5:2);assert.equal(voices[0].startedAt,4,'main tap is never queued behind music');
   const frequency=voices[0].frequency.changes[0];assert.ok(frequency>previous);previous=frequency;if(tap===1)first=frequency;
  }
  const n=h.oscillators.length;h.audio.play('tap',1);assert.equal(h.oscillators[n].frequency.changes[0],first);
  h.audio.configure({muted:false,music:true,effects:false});const mutedCount=h.oscillators.length;h.audio.play('tap',20);assert.equal(h.oscillators.length,mutedCount,'milestones obey the effects preference');
 }finally{h.audio.dispose();}
});
test('continue is a local view change, scoped to a settled attempt and guest profile',()=>{
 let s={...step(engine.initialPlayer(),'start'),referralCode:'guest-a'};assert.equal(resultView.dismissSettledResult(s),null);
 s={...step(step(s,'tap'),'cashout'),referralCode:'guest-a'};const original=structuredClone(s),dismissed=resultView.dismissSettledResult(s);
 assert.deepEqual(s,original);assert.deepEqual(dismissed,{profile:'guest-a',attemptId:s.attempt.id});assert.equal(resultView.resultIsDismissed(s,dismissed),true);
 assert.equal(resultView.resultIsDismissed({...s,referralCode:'guest-b'},dismissed),false);
 const active={...step(s,'start','paid'),referralCode:'guest-a'};assert.equal(resultView.resultIsDismissed(active,dismissed),false);assert.equal(resultView.dismissSettledResult(active),null);
});
test('a new paid attempt starts directly after local continue and charges once without a dismiss API call',async()=>{
 await send('demo','squirrel');await send('tap');const won=await send('cashout');const dismissal=resultView.dismissSettledResult(won);assert.equal(resultView.resultIsDismissed(won,dismissal),true);
 const c={id:crypto.randomUUID(),action:'start',value:'paid',revision:won.revision};const first=await post('player',c);assert.equal(first.status,200);assert.equal(first.data.attempt.status,'active');assert.equal(first.data.balance,won.balance-100);
 assert.deepEqual(await post('player',c),first);const fresh=await get();assert.equal(fresh.balance,won.balance-100);assert.equal(fresh.transactions.filter(t=>t.reason==='paid_game_attempt').length,1);
 assert.equal(resultView.resultIsDismissed(fresh,dismissal),false);
});
test('coin flight requires a newly confirmed server reward and does not replay on retry or reload',()=>{
 const withCode=s=>({...s,referralCode:'guest-a'});let before=withCode(step(engine.initialPlayer(),'demo','final'));
 const ready=withCode(step(before,'tap'));assert.equal(resultView.newWalletCredit(before,ready),null);
 const won=withCode(step(ready,'cashout'));const event=resultView.newWalletCredit(ready,won);assert.deepEqual(event,{id:won.attempt.id+':reward',amount:2350});
 assert.equal(resultView.newWalletCredit(won,won),null);assert.equal(resultView.newWalletCredit(null,won),null);assert.equal(resultView.newWalletCredit({...ready,referralCode:'another'},won),null);
 assert.equal(resultView.newWalletCredit(ready,{...won,transactions:[]}),null);
 const next=withCode(step(won,'start','paid'));assert.equal(resultView.newWalletCredit(next,won),null);
});
test('loss and demo top-up never masquerade as session winnings',()=>{
 let a={...step(engine.initialPlayer(),'demo','squirrel'),referralCode:'guest-a'};const b={...step(a,'tap',undefined,()=>0),referralCode:'guest-a'};
 assert.equal(resultView.newWalletCredit(a,b),null);const initial={...engine.initialPlayer(),referralCode:'guest-a'},topup={...step(initial,'demo','balance'),referralCode:'guest-a'};
 assert.equal(resultView.newWalletCredit(initial,topup),null);
 a={...step(step(engine.initialPlayer(),'start'),'tap',undefined,()=>0),referralCode:'guest-a'};const lost={...step(a,'lose'),referralCode:'guest-a'};
 assert.equal(resultView.newWalletCredit(a,lost),null);assert.equal(resultView.resultIsDismissed(lost,resultView.dismissSettledResult(lost)),true);
});

const plan=await import(pathToFileURL(join(temp,'lib/game/tap-plan.mjs')));
test('server reserves immutable outcomes and replay or heartbeat never rerolls them',async()=>{
 const first=await send('start','paid');assert.equal(first.attempt.outcomes.length,120);assert.ok(first.attempt.outcomes.every(x=>typeof x==='boolean'));
 const second=await get();assert.deepEqual(second.attempt.outcomes,first.attempt.outcomes);
 const beat=await send('heartbeat');assert.deepEqual(beat.attempt.outcomes,first.attempt.outcomes);
 const c={id:crypto.randomUUID(),action:'taps',value:{count:20,attemptId:first.attempt.id},revision:beat.revision};
 const result=await post('player',c);assert.equal(result.status,200);const predicted=plan.projectAttempt(first.attempt,20);
 assert.equal(result.data.attempt.tap,predicted.tap);assert.equal(result.data.attempt.status,predicted.status);assert.equal(result.data.attempt.reward,predicted.reward);assert.deepEqual(await post('player',c),result);
});
test('planned squirrel is visible on its physical tap before either delayed response and never arrives again after stopping',async()=>{
 let player=plan.reserveTapPlan(step(engine.initialPlayer(),'demo','squirrel'),()=>1),responses=[],views=[];
 const q=new TapQueue({position:()=>player.attempt,readiness:()=> 'ready',onChange:(_,tap)=>views.push(plan.projectAttempt(player.attempt,tap)),send:count=>new Promise(resolve=>responses.push(()=>{player=step(player,'taps',{count,attemptId:player.attempt.id},()=>{throw Error('must not reroll')});resolve(player.attempt)}))});
 for(let i=1;i<=4;i++){assert.equal(q.add(),true);assert.equal(views.at(-1).tap,i);assert.equal(views.at(-1).status,i===4?'loss_pending':'active');}
 assert.equal(q.add(),false);assert.equal(player.attempt.tap,0);const stopped=views.length;responses[0]();await nextTurn();assert.equal(views.at(-1).status,'loss_pending');responses[1]();await q.flush();assert.equal(player.attempt.tap,4);assert.ok(views.slice(stopped).every(v=>v.status==='loss_pending'));q.dispose();
});
test('safe taps stay safe after stopping even when later reserved taps contain squirrels',async()=>{
 let player=plan.reserveTapPlan(step(engine.initialPlayer(),'demo','squirrel'),()=>1),responses=[];
 const q=new TapQueue({position:()=>player.attempt,readiness:()=> 'ready',send:count=>new Promise(resolve=>responses.push(()=>{player=step(player,'taps',{count,attemptId:player.attempt.id});resolve(player.attempt)}))});
 q.add();q.add();q.add();assert.equal(plan.projectAttempt(player.attempt,q.preview().tap).status,'active');responses[0]();await nextTurn();responses[1]();await q.flush();assert.equal(player.attempt.tap,3);assert.equal(player.attempt.status,'active');assert.equal(player.balance,1000);q.dispose();
});
test('rescue resumes after the same reserved loss and the second squirrel ends the attempt',()=>{
 let player=plan.reserveTapPlan(step(engine.initialPlayer(),'demo','squirrel'),()=>1);const outcomes=player.attempt.outcomes;
 player=step(player,'taps',{count:4,attemptId:player.attempt.id});player=step(player,'booster');assert.deepEqual(player.attempt.outcomes,outcomes);assert.equal(plan.tapBoundary(player.attempt),8);
 const preview=plan.projectAttempt(player.attempt,120);assert.equal(preview.tap,8);assert.equal(preview.status,'lost');assert.equal(preview.reward,0);assert.equal(player.balance,950);
 player=step(player,'taps',{count:4,attemptId:player.attempt.id});assert.equal(player.attempt.status,'lost');assert.equal(player.balance,950);
});
test('legacy active attempts receive and retain a plan without changing payouts or charging again',async()=>{
 const first=await send('demo','squirrel');sql.prepare("UPDATE players SET state=json_remove(state,'$.attempt.outcomes')").run();
 const upgraded=await get();assert.equal(upgraded.attempt.outcomes.length,120);assert.equal(upgraded.attempt.id,first.attempt.id);assert.equal(upgraded.balance,first.balance);assert.deepEqual((await get()).attempt.outcomes,upgraded.attempt.outcomes);
});

const taunts=await import(pathToFileURL(join(temp,'lib/game/squirrel-taunts.mjs')));
test('squirrel speech has a ten-second cooldown and cannot stack during rapid taps',()=>{
 let memory={attemptId:'a',count:0,lastAt:0};
 assert.equal(taunts.nextTaunt(memory,1,1000),null);
 const first=taunts.nextTaunt(memory,2,1000);assert.ok(first);memory=first.memory;
 for(let tap=3;tap<=120;tap++)assert.equal(taunts.nextTaunt(memory,tap,1000+tap*10),null);
 assert.equal(taunts.nextTaunt(memory,12,10999),null);
 assert.ok(taunts.nextTaunt(memory,12,11000));
});
test('one attempt never gets more than four taunts, including a restored checkpoint',()=>{
 let memory={attemptId:'a',count:0,lastAt:0};const texts=[];
 for(const [i,tap] of [2,12,35,75].entries()){const next=taunts.nextTaunt(memory,tap,1000+i*10000);assert.ok(next);texts.push(next.text);memory=JSON.parse(JSON.stringify(next.memory));}
 assert.equal(new Set(texts).size,4);assert.equal(memory.count,4);
 assert.equal(taunts.nextTaunt(memory,120,999999),null);
});
