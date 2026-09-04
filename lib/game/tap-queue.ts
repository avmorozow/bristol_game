/** Collect physical taps while a request is in flight, preserving their order.
 * Results and money always come from the server. Stop at the first squirrel.
 */
export type TapPosition = {id:string;status:string;tap:number};
type Options = {
 position:()=>TapPosition|null;
 readiness:()=> 'ready'|'wait'|'stop';
 send:(count:number,attemptId:string)=>Promise<TapPosition|null>;
 onChange?:(pending:number)=>void;
};
export class TapQueue {
 private queued=0;
 private inFlight=0;
 private target:string|null=null;
 private running=false;
 private disposed=false;
 private timer:ReturnType<typeof setTimeout>|null=null;
 private waiters=new Set<()=>void>();
 constructor(private options:Options){}
 add():boolean {
  const a=this.options.position();
  if(this.disposed||!a||a.status!=='active'||this.options.readiness()==='stop')return false;
  if(this.target&&this.target!==a.id){this.cancel();if(this.running)return false;}
  if(this.queued+this.inFlight>=Math.min(20,120-a.tap))return false;
  this.target=a.id;this.queued++;this.emit();void this.pump();return true;
 }
 flush():Promise<void>{
  if(!this.queued&&!this.running)return Promise.resolve();
  return new Promise(resolve=>{this.waiters.add(resolve);void this.pump();});
 }
 cancel(){this.queued=0;if(this.timer)clearTimeout(this.timer);this.timer=null;this.emit();if(!this.running)this.finish();}
 dispose(){this.disposed=true;this.cancel();}
 private emit(){this.options.onChange?.(this.queued+this.inFlight);}
 private finish(){for(const resolve of this.waiters)resolve();this.waiters.clear();}
 private async pump(){
  if(this.running||this.disposed)return;
  const a=this.options.position(),ready=this.options.readiness();
  if(!a||a.id!==this.target||a.status!=='active'||ready==='stop'){this.cancel();return;}
  if(!this.queued){this.finish();return;}
  if(ready==='wait'){
   if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;void this.pump();},20);
   return;
  }
  const count=Math.min(this.queued,20,120-a.tap);
  this.queued-=count;this.inFlight=count;this.running=true;this.emit();
  try{
   const result=await this.options.send(count,a.id);
   if(!result||result.id!==this.target||result.status!=='active')this.queued=0;
  }catch{this.queued=0;}
  finally{
   this.running=false;this.inFlight=0;this.emit();
   if(this.queued&&!this.disposed)void this.pump();else this.finish();
  }
 }
}
