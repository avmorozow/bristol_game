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
await build({entryPoints:[join(root,'lib/game/engine.ts'),join(root,'app/api/game/route.ts'),join(root,'lib/game/tap-queue.ts')],outdir:temp,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},plugins:[{name:'test-d1',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cloudflare:workers',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__TEST_ENV;',loader:'js'}));}}]});
const env={DB:null};globalThis.__TEST_ENV=env;
const engine=await import(pathToFileURL(join(temp,'lib/game/engine.mjs')));
const api=await import(pathToFileURL(join(temp,'app/api/game/route.mjs')));
let sql;
class Statement{
 constructor(query,values=[]){this.query=query;this.values=values;}
 bind(...values){return new Statement(this.query,values);}
 async first(){return sql.prepare(this.query).get(...this.values)??null;}
 execute(){const r=sql.prepare(this.query).run(...this.values);return {success:true,meta:{changes:Number(r.changes)}};}
 async run(){return this.execute();}
}
const migration=await readFile(join(root,'drizzle/0000_material_blue_blade.sql'),'utf8');
beforeEach(()=>{sql?.close();sql=new DatabaseSync(':memory:');sql.exec(migration);env.DB={prepare:q=>new Statement(q),batch:async statements=>{sql.exec('BEGIN');try{const result=statements.map(s=>s.execute());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};});
after(async()=>{sql?.close();await rm(temp,{recursive:true,force:true});});
const headers=id=>({'oai-authenticated-user-id':id,'Content-Type':'application/json','Origin':'https://bristol.test'});
async function get(id='player'){const r=await api.GET(new Request('https://bristol.test/api/game',{headers:headers(id)}));assert.equal(r.status,200);return r.json();}
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
 let s=step(engine.initialPlayer(),'start');s=step(s,'tap');let expired=engine.expire(s,now+30001);assert.equal(expired.balance,1002);assert.equal(expired.attempt.reason,'connection');assert.equal(engine.expire(expired,now+60000).balance,1002);
 s=step(s,'tap',undefined,()=>0);expired=engine.expire(s,now+30001);assert.equal(expired.balance,1000);assert.equal(expired.attempt.status,'lost');
});
test('API requires authenticated identity and rejects cross-site requests',async()=>{
 assert.equal((await api.GET(new Request('https://bristol.test/api/game'))).status,401);
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

test('email-only SIWC can load a profile, finish tutorial, play and restore a result',async()=>{
 const identity={'oai-authenticated-user-email':'player@example.test','Content-Type':'application/json',Origin:'https://bristol.test'};
 async function read(){const r=await api.GET(new Request('https://bristol.test/api/game',{headers:identity}));assert.equal(r.status,200);return r.json();}
 async function command(action,value){const before=await read();const r=await api.POST(new Request('https://bristol.test/api/game',{method:'POST',headers:identity,body:JSON.stringify({id:crypto.randomUUID(),action,value,revision:before.revision})}));assert.equal(r.status,200,await r.clone().text());return r.json();}
 assert.equal((await read()).balance,1000);assert.equal((await command('tutorial','complete')).tutorial,true);
 const started=await command('start');assert.equal(started.attempt.status,'active');assert.equal(started.attempt.kind,'free');
 const tapped=await command('tap');assert.equal(tapped.attempt.tap,1);
 // Rescue the first tap if its real random outcome was a squirrel.
 if(tapped.attempt.status==='loss_pending')await command('booster');
 const reward=await command('cashout');assert.equal(reward.attempt.status,'won');assert.equal(reward.attempt.reward,2);
 assert.deepEqual((await read()).transactions,reward.transactions);assert.equal((await read()).balance,reward.balance);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM players').get().n,1);
 assert.ok(!JSON.stringify(sql.prepare('SELECT * FROM players').all()).includes('player@example.test'));
});

test('email identities are isolated and no identity cannot read or change a game',async()=>{
 const read=email=>api.GET(new Request('https://bristol.test/api/game',{headers:{'oai-authenticated-user-email':email}}));
 const first=await (await read('one@example.test')).json(),second=await (await read('two@example.test')).json();
 assert.notEqual(first.referralCode,second.referralCode);
 assert.equal((await read(' ')).status,401);
 const anonymous=await api.POST(new Request('https://bristol.test/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),action:'start',revision:0,email:'one@example.test'})}));assert.equal(anonymous.status,401);
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
