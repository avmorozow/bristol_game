export type SoundKind='tap'|'win'|'loss'|'rescue'|'start';
export type AudioPreferences={muted:boolean;music:boolean;effects:boolean};
// Original 8-bar arcade loop, synthesised locally: no downloads or external requests.
const melody=[76,79,83,79,74,78,81,78,72,76,79,76,74,78,81,86];
const bass=[48,43,45,47];
const hz=(m:number)=>440*2**((m-69)/12);
export class GameAudio{
 private ctx:AudioContext|null=null;
 private master:GainNode|null=null;
 private musicBus:GainNode|null=null;
 private timer:ReturnType<typeof setInterval>|null=null;
 private notes=new Set<OscillatorNode>();
 private next=0;
 private beat=0;
 private active=false;
 private prefs:AudioPreferences={muted:false,music:true,effects:true};
 private hidden=false;
 constructor(private factory:()=>AudioContext=()=>{
  const C=window.AudioContext??(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;
  return new C();
 }){}
 configure(p:AudioPreferences){this.prefs=p;this.sync();}
 setActive(active:boolean){this.active=active;this.sync();}
 setHidden(hidden:boolean){this.hidden=hidden;this.sync();}
 unlock(){
  if(this.prefs.muted||this.hidden)return;
  try{
   if(!this.ctx){this.ctx=this.factory();this.master=this.ctx.createGain();this.master.gain.value=.38;this.master.connect(this.ctx.destination);this.musicBus=this.ctx.createGain();this.musicBus.gain.value=.3;this.musicBus.connect(this.master);}
   void this.ctx.resume().then(()=>this.sync()).catch(()=>{});this.sync();
  }catch{/* Audio support must never block a tap. */}
 }
 private tone(f:number,time:number,length:number,volume:number,type:OscillatorType='sine',music=false){
  if(!this.ctx||!this.master||!this.musicBus)return;
  const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,time);
  g.gain.setValueAtTime(.0001,time);g.gain.exponentialRampToValueAtTime(volume,time+.008);g.gain.exponentialRampToValueAtTime(.0001,time+length);
  o.connect(g);g.connect(music?this.musicBus:this.master);this.notes.add(o);
  o.onended=()=>{this.notes.delete(o);o.disconnect();g.disconnect();};o.start(time);o.stop(time+length+.01);
 }
 play(kind:SoundKind){
  if(this.prefs.muted||!this.prefs.effects||this.hidden||!this.ctx||this.ctx.state!=='running')return;
  const now=this.ctx.currentTime;
  if(kind==='tap'){this.tone(980,now,.065,.16,'triangle');this.tone(1480,now+.012,.045,.065);return;}
  const notes=kind==='win'?[72,76,79,84]:kind==='loss'?[55,51,43]:kind==='rescue'?[60,67,79]:[60,64,67];
  notes.forEach((n,i)=>this.tone(hz(n),now+i*.09,kind==='loss'?.2:.18,.2,kind==='loss'?'triangle':'sine'));
 }
 private sync(){
  if(!this.ctx||!this.master||!this.musicBus)return;
  this.master.gain.setTargetAtTime(this.prefs.muted||this.hidden?0:.38,this.ctx.currentTime,.015);
  const music=this.active&&this.prefs.music&&!this.prefs.muted&&!this.hidden;
  this.musicBus.gain.setTargetAtTime(music?.3:0,this.ctx.currentTime,.025);
  if(!music){if(this.timer)clearInterval(this.timer);this.timer=null;return;}
  if(this.timer||this.ctx.state!=='running')return;
  this.next=this.ctx.currentTime+.04;
  const schedule=()=>{
   if(!this.ctx||this.ctx.state!=='running')return;
   if(this.next<this.ctx.currentTime)this.next=this.ctx.currentTime+.02;
   while(this.next<this.ctx.currentTime+.12){
    const b=this.beat%64;
    if(b%2===0)this.tone(hz(melody[(b/2)%16]),this.next,.16,.09,'triangle',true);
    if(b%4===0)this.tone(hz(bass[Math.floor(b/16)]),this.next,.38,.16,'sine',true);
    if(b%4===0)this.tone(70,this.next,.08,.14,'sine',true);
    else if(b%2===1)this.tone(3800,this.next,.024,.025,'triangle',true);
    this.next+=60/108/2;this.beat++;
   }
  };
  schedule();this.timer=setInterval(schedule,50);
 }
 dispose(){if(this.timer)clearInterval(this.timer);this.timer=null;for(const o of this.notes){try{o.stop();}catch{}}this.notes.clear();if(this.ctx)void this.ctx.close().catch(()=>{});this.ctx=null;this.master=null;this.musicBus=null;}
}
