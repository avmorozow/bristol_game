import {gameDb} from '@/lib/game/store';
import {initialPlayer,publicState,transition,expire,referral,GameError,CONFIG,type Player} from '@/lib/game/engine';
import {guest} from '@/lib/game/guest';
export const dynamic='force-dynamic';
type Row={id:string;code:string;state:string;revision:number;last_command:string;command_response?:string;command_fingerprint?:string};
const json=(data:unknown,status=200,cookie?:string)=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
function error(e:unknown){if(e instanceof GameError)return json({error:e.message,code:e.code},400);console.error('game_error',e);return json({error:'Не удалось связаться с игрой. Попробуйте ещё раз.',code:'unavailable'},503);}
async function load(id:string):Promise<Row>{
 const db=gameDb();let row=await db.prepare('SELECT * FROM players WHERE id=?').bind(id).first<Row>();
 if(!row){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));const code='BR'+Array.from(new Uint8Array(bytes)).slice(0,5).map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
 await db.prepare('INSERT OR IGNORE INTO players(id,code,state,revision,last_command) VALUES(?,?,?,0,?)').bind(id,code,JSON.stringify(initialPlayer()),'').run();row=await db.prepare('SELECT * FROM players WHERE id=?').bind(id).first<Row>();}
 if(!row)throw new Error('Missing player');return row;
}
function snapshot(row:Row,now:number){return publicState(JSON.parse(row.state),row.revision,row.code,now);}
async function lazyExpire(row:Row,now:number){const s=expire(JSON.parse(row.state),now);const state=JSON.stringify(s);if(state!==row.state){await gameDb().prepare('UPDATE players SET state=?,revision=revision+1 WHERE id=? AND revision=?').bind(state,row.id,row.revision).run();return load(row.id);}return row;}
export async function GET(request:Request){try{const session=(await guest(request,true))!,now=Date.now();const row=await lazyExpire(await load(session.id),now);return json(snapshot(row,now),200,session.cookie);}catch(e){return error(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Недопустимый источник запроса.'},403);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Недопустимый источник запроса.'},403);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'Некорректный формат запроса.'},415);
 const session=await guest(request);if(!session)return json({error:'Не удалось сохранить гостевой профиль. Разрешите cookie для этого сайта и обновите игру.',code:'session_missing'},401);
 const id=session.id;
 const body=await request.json() as {id?:string;action?:string;value?:unknown;revision?:number};
 if(typeof body.id!=='string'||!/^[-\w]{8,100}$/.test(body.id)||typeof body.action!=='string')throw new GameError('invalid','Некорректная команда.');
 const db=gameDb(),now=Date.now(),fingerprint=JSON.stringify([body.action,body.value??null]);
 // A heartbeat only extends the lease; it must not invalidate gameplay commands.
 if(body.action==='heartbeat'){
   const alive=await db.prepare(`UPDATE players SET state=json_set(state,'$.attempt.lastSeen',?) WHERE id=? AND json_extract(state,'$.attempt.status') IN ('active','loss_pending','final_ready') AND json_extract(state,'$.attempt.lastSeen')>=? RETURNING *`).bind(now,id,now-CONFIG.leaseMs).first<Row>();
   return json(snapshot(alive??await lazyExpire(await load(id),now),now));
 }
 // Fetch the player and any replay together: one DB round trip before the write.
 let row=await db.prepare('SELECT p.*,c.response AS command_response,c.fingerprint AS command_fingerprint FROM players p LEFT JOIN commands c ON c.user_id=p.id AND c.id=? WHERE p.id=?').bind(body.id,id).first<Row>()??await load(id);
 if(row.command_response){if(row.command_fingerprint!==fingerprint)throw new GameError('key_reused','Эта команда уже была использована.');return json(JSON.parse(row.command_response));}
 if(body.action!=='close'&&body.revision!==row.revision)return json({error:'Состояние обновилось. Продолжите игру.',code:'conflict',state:snapshot(row,now)},409);
 let next:Player,other:Row|undefined,otherNext:Player|undefined;
 if(body.action==='referral'){
   const code=String(body.value??'').trim().toUpperCase();if(!/^[A-Z0-9]{4,20}$/.test(code))throw new GameError('code_invalid','Проверьте код друга.');
   if(code===row.code)throw new GameError('own_code','Нельзя активировать собственный код.');
   if(code==='BRISTOL'){
     [next]=referral(JSON.parse(row.state),initialPlayer(),code,now,id+':'+body.id);
   }else{
     other=await db.prepare('SELECT * FROM players WHERE code=?').bind(code).first<Row>()??undefined;
     if(!other)throw new GameError('code_not_found','Код не найден. Проверьте написание.');
     [next,otherNext]=referral(JSON.parse(row.state),JSON.parse(other.state),code,now,id+':'+body.id);
   }
 }else{
   const rnd=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
   next=transition(JSON.parse(row.state),body.action,body.value,now,body.id,rnd);
 }
 const response=publicState(next,row.revision+1,row.code,now),token=crypto.randomUUID();
 const update=other?db.prepare('UPDATE players SET state=?,revision=revision+1,last_command=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM players p WHERE p.id=? AND p.revision=?)').bind(JSON.stringify(next),token,id,row.revision,other.id,other.revision):db.prepare('UPDATE players SET state=?,revision=revision+1,last_command=? WHERE id=? AND revision=?').bind(JSON.stringify(next),token,id,row.revision);
 const batch=[update];
 if(other&&otherNext)batch.push(db.prepare('UPDATE players SET state=?,revision=revision+1,last_command=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM players p WHERE p.id=? AND p.last_command=?)').bind(JSON.stringify(otherNext),token,other.id,other.revision,id,token));
 batch.push(db.prepare('INSERT INTO commands(user_id,id,fingerprint,response,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM players WHERE id=? AND last_command=?)').bind(id,body.id,fingerprint,JSON.stringify(response),now,id,token));
 if(body.action!=='heartbeat')batch.push(db.prepare('INSERT INTO events(id,user_id,name,payload,at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM players WHERE id=? AND last_command=?)').bind(id+':'+body.id,id,body.action,JSON.stringify({attempt:next.attempt?.id,tap:next.attempt?.tap,status:next.attempt?.status,reward:next.attempt?.reward,config:next.attempt?.version}),now,id,token));
 const result=await db.batch(batch);
 if(!result[0].meta.changes){const retry=await db.prepare('SELECT response FROM commands WHERE user_id=? AND id=?').bind(id,body.id).first<{response:string}>();if(retry)return json(JSON.parse(retry.response));row=await load(id);return json({error:'Состояние обновилось. Продолжите игру.',code:'conflict',state:snapshot(row,now)},409);}
 return json(response);
 }catch(e){return error(e);}}
