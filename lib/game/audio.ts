export type SoundKind='tap'|'win'|'loss'|'rescue'|'start';
export type AudioPreferences={muted:boolean;music:boolean;effects:boolean};
// Original shop-heist swing: woody marimba, plucked strings and walking bass.
// Scheduled ahead on the audio clock; music never runs inside the tap transport.
const melody=[69,0,72,76,0,74,72,0,67,69,0,72,71,0,64,0,
 69,72,76,0,79,76,74,0,72,0,71,69,68,71,76,0];
const bass=[45,50,43,52];
const chords=[[57,60,64],[50,57,62],[55,59,62],[56,59,64]];
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
 private tension=0;
 private taps=0;
 setTension(value:number){this.tension=Math.max(0,Math.min(1,value));}
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
  if(kind==='tap'){const f=[740,880,990,880][this.taps++%4];this.tone(f,now,.055,.11,'sine');this.tone(f*2.7,now,.027,.035,'sine');return;}
  const notes=kind==='win'?[69,72,76,81]:kind==='loss'?[76,72,68,57]:kind==='rescue'?[69,76,81,88]:[57,64,69];
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
    const b=this.beat%128,bar=Math.floor(b/16)%4,note=melody[Math.floor(b/2)%32];
    if(b%2===0&&note){this.tone(hz(note),this.next,.18,.11,'sine',true);this.tone(hz(note)*3.98,this.next,.065,.018,'sine',true);}
    if(b%4===0){const walk=b%16===12?7:0;this.tone(hz(bass[bar]+walk),this.next,.24,.18,'triangle',true);this.tone(66,this.next,.075,.12,'sine',true);}
    if(b%8===4)chords[bar].forEach((n,i)=>this.tone(hz(n),this.next+i*.009,.105,.025,'triangle',true));
    if(b%2===1)this.tone(2600+(b%4)*310,this.next,.025,.014,'triangle',true);
    if(this.tension>.65&&b%4===2)this.tone(hz(81+(b%8===2?0:3)),this.next,.075,.025,'sine',true);
    this.next+=(60/114/4)*(b%2===0?1.13:.87);this.beat++;

   }
  };
  schedule();this.timer=setInterval(schedule,50);
 }
 dispose(){if(this.timer)clearInterval(this.timer);this.timer=null;for(const o of this.notes){try{o.stop();}catch{}}this.notes.clear();if(this.ctx)void this.ctx.close().catch(()=>{});this.ctx=null;this.master=null;this.musicBus=null;}
}
