export type SoundKind='tap'|'win'|'loss'|'rescue'|'start';
export type AudioPreferences={muted:boolean;music:boolean;effects:boolean};
// Original arcade funk: syncopated bass, clean beat and bright C-major hooks.
// Scheduled ahead on the audio clock; music never runs inside the tap transport.
const melody=[76,0,79,0,81,79,0,76,74,0,76,79,0,74,72,0,
 76,79,0,84,83,0,79,76,74,76,0,79,0,74,72,0];
const bass=[36,45,41,43];
const chords=[[60,64,67],[57,60,64],[57,60,65],[59,62,67]];
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
 setTension(value:number){this.tension=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;}
 private prefs:AudioPreferences={muted:false,music:true,effects:true};
 private hidden=false;
 constructor(private factory:()=>AudioContext=()=>{
  const C=window.AudioContext??(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;
  return new C();
 }){}
 configure(p:AudioPreferences){this.prefs=p;this.sync();}
 setActive(active:boolean){if(active&&!this.active)this.beat=0;this.active=active;this.sync();}
 setHidden(hidden:boolean){this.hidden=hidden;this.sync();}
 unlock(){
  if(this.prefs.muted||this.hidden)return;
  try{
   if(!this.ctx){this.ctx=this.factory();this.master=this.ctx.createGain();this.master.gain.value=.38;this.master.connect(this.ctx.destination);this.musicBus=this.ctx.createGain();this.musicBus.gain.value=.3;this.musicBus.connect(this.master);}
   void this.ctx.resume().then(()=>this.sync()).catch(()=>{});this.sync();
  }catch{/* Audio support must never block a tap. */}
 }
 private tone(f:number,time:number,length:number,volume:number,type:OscillatorType='sine',music=false,endFrequency?:number){
  if(!this.ctx||!this.master||!this.musicBus)return;
  // Even rapid taps cannot create an unbounded pile of voices.
  if(this.notes.size>=64){const oldest=this.notes.values().next().value;try{oldest?.stop();}catch{}if(oldest)this.notes.delete(oldest);}
  const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,time);
  if(endFrequency)o.frequency.exponentialRampToValueAtTime(endFrequency,time+length);
  g.gain.setValueAtTime(.0001,time);g.gain.exponentialRampToValueAtTime(volume,time+.008);g.gain.exponentialRampToValueAtTime(.0001,time+length);
  o.connect(g);g.connect(music?this.musicBus:this.master);this.notes.add(o);
  o.onended=()=>{this.notes.delete(o);o.disconnect();g.disconnect();};o.start(time);o.stop(time+length+.01);
 }
 play(kind:SoundKind,tap?:number){
  if(tap!==undefined)this.setTension(tap/120);
  if(this.prefs.muted||!this.prefs.effects||this.hidden||!this.ctx||this.ctx.state!=='running')return;
  const now=this.ctx.currentTime;
  if(kind==='tap'){
   // A rising, soft coin pluck on every successful physical tap, never a reply.
   const f=hz(72+12*this.tension);this.tone(f,now,.075,.15,'sine');this.tone(f*2,now,.035,.03,'sine');
   if(tap&&tap%20===0)[76,79,84].forEach((n,i)=>this.tone(hz(n),now+i*.045,.16,.075,'sine'));
   return;
  }
  const notes=kind==='win'?[72,76,79,84]:kind==='loss'?[76,72,68,57]:kind==='rescue'?[67,72,79,84]:[60,64,67];
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
    const b=this.beat%64,step=b%16,bar=Math.floor(b/16),note=melody[Math.floor(b/2)],t=this.tension;
    if(b%4===0)this.tone(135,this.next,.13,.36,'sine',true,43); // kick
    if([0,3,6,10,12,14].includes(step)){
     this.tone(hz(bass[bar]+(step===14?12:0)),this.next,.16,.21,'triangle',true);
    }
    if(b%8===4){this.tone(185,this.next,.055,.1,'triangle',true,90);this.tone(1730,this.next,.035,.028,'triangle',true);}
    if(b%2===0)this.tone(5900,this.next,.022,.016,'triangle',true);
    if(b%2===0&&note)this.tone(hz(note),this.next,.13,.06,'triangle',true);
    if([2,10].includes(step))chords[bar].forEach(n=>this.tone(hz(n),this.next,.15,.022+t*.016,'triangle',true));
    if(t>=.25&&b%4===2)this.tone(8100,this.next,.035,.017,'sine',true);
    if(t>=.5&&b%2===1)this.tone(hz(chords[bar][Math.floor(step/2)%3]+12),this.next,.085,.034,'sine',true);
    if(t>=.75&&step===14)chords[bar].forEach(n=>this.tone(hz(n+12),this.next,.2,.022,'sine',true));
    if(t>=.9&&b%4===3)this.tone(6200,this.next,.018,.018,'triangle',true);
    this.next+=60/(124+10*t)/4;this.beat++;

   }
  };
  schedule();this.timer=setInterval(schedule,50);
 }
 dispose(){if(this.timer)clearInterval(this.timer);this.timer=null;for(const o of this.notes){try{o.stop();}catch{}}this.notes.clear();if(this.ctx)void this.ctx.close().catch(()=>{});this.ctx=null;this.master=null;this.musicBus=null;}
}
