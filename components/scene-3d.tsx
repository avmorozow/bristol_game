'use client';
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import type {Status} from '@/lib/game/engine';
export type SceneHandle={tap:()=>void};
type Props={status:Status|'home';attemptId?:string;boosterUsed?:boolean;variant?:number;paused:boolean;onReady:(ready:boolean)=>void;onAvatar?:(src:string)=>void};
export const Scene3D=forwardRef<SceneHandle,Props>(function Scene3D(props,ref){
 const host=useRef<HTMLDivElement>(null),live=useRef(props),impulse=useRef(0),tapSerial=useRef(0),lean=useRef(0),[failed,setFailed]=useState(false);live.current=props;
 useImperativeHandle(ref,()=>({tap:()=>{impulse.current=1;tapSerial.current++;if(tapSerial.current%3===0)lean.current=tapSerial.current%2?.075:-.075;}}),[]);
 useEffect(()=>{
  let dead=false,cleanup=()=>{};
  void (async()=>{try{
   const [T,{buildCharacters}]=await Promise.all([import('three'),import('@/lib/game/scene-models')]);if(dead||!host.current)return;
   const el=host.current;let software=false;let renderer:import('three').WebGLRenderer|import('@/lib/game/software-renderer').SoftwareRenderer;try{renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});}catch{const {SoftwareRenderer}=await import('@/lib/game/software-renderer');if(dead)return;renderer=new SoftwareRenderer();software=true;}if(renderer instanceof T.WebGLRenderer){renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setClearColor(0x000000,0);}renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;el.appendChild(renderer.domElement);
   const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.1,60);camera.position.set(0,2.25,7.6);camera.lookAt(0,1.35,0);
   scene.add(new T.HemisphereLight(0xffecd9,0x8e5366,2.8));const key=new T.DirectionalLight(0xffefd8,3.6);key.position.set(-3,6,5);scene.add(key);const rim=new T.DirectionalLight(0xffd69e,2.4);rim.position.set(3,3,-3);scene.add(rim);const fill=new T.DirectionalLight(0xffffff,1.1);fill.position.set(3,2,4);scene.add(fill);
   const m=buildCharacters(software);scene.add(m.bag,m.squirrel,...m.products);m.squirrel.visible=false;
   // The entire chase takes place on the same tiled shop floor.
   const floor=new T.Group();floor.userData.ground=true;scene.add(floor);
   for(let x=-4;x<=4;x++)for(let z=-1;z<=1;z++){const tile=new T.Mesh(new T.BoxGeometry(1.38,.075,1.32),new T.MeshStandardMaterial({color:(x+z)%2?0x8b8580:0x928c86,roughness:.98}));tile.position.set(x*1.4,-.085,z*1.34);floor.add(tile);}
   const shadowMaterial=new T.MeshBasicMaterial({color:0x413b35,transparent:true,opacity:.16,depthWrite:false});
   const shadow=(radius:number)=>{const o=new T.Mesh(new T.CircleGeometry(radius,32),shadowMaterial);o.rotation.x=-Math.PI/2;o.position.y=-.041;scene.add(o);return o;};const bagShadow=shadow(.53),squirrelShadow=shadow(.45);
   // Portrait comes from the actual model, so the speaker and scene match.
   const {SoftwareRenderer}=await import('@/lib/game/software-renderer');if(dead)return;
   const portrait=new SoftwareRenderer();portrait.setSize(80,80);const portraitScene=new T.Scene(),portraitHead=m.head.clone();portraitHead.position.set(0,0,0);portraitHead.scale.setScalar(1);portraitHead.rotation.y=-.15;portraitScene.add(portraitHead);const portraitCamera=new T.PerspectiveCamera(36,1,.1,10);portraitCamera.position.set(0,.13,2.35);portraitCamera.lookAt(0,.13,0);portrait.render(portraitScene,portraitCamera);live.current.onAvatar?.(portrait.domElement.toDataURL());portrait.dispose();
   const flights=m.products.map(()=>({age:9,side:1}));let productCursor=0,lastTapSerial=0;
   let dirty=true;const size=()=>{dirty=true;if(!el.clientWidth||!el.clientHeight)return;camera.aspect=el.clientWidth/el.clientHeight;camera.position.z=camera.aspect<.85?8.1:7.6;camera.updateProjectionMatrix();if(renderer instanceof T.WebGLRenderer)renderer.setSize(el.clientWidth,el.clientHeight,false);else renderer.setSize(el.clientWidth,el.clientHeight);};size();const observer=new ResizeObserver(size);observer.observe(el);
   const reduced=matchMedia('(prefers-reduced-motion: reduce)');let phase='idle',phaseTime=0,time=0,last=0,frame=0,previousId='',previousStatus='',previousBoost=false,side=1,variant=0;let ready=false;
   const phaseTo=(p:string)=>{phase=p;phaseTime=0;el.dataset.phase=p;el.dataset.bagEmotion=['steal','caught','escape'].includes(p)?'fear':'happy';};
   const render=(now:number)=>{if(dead)return;frame=requestAnimationFrame(render);if(now-last<1000/(software?24:45))return;const dt=Math.min(.25,(now-last)/1000||.016);last=now;const p=live.current;
    if(p.attemptId!==previousId){previousId=p.attemptId??'';previousStatus='';previousBoost=!!p.boosterUsed;variant=p.variant??0;side=variant%2?-1:1;phaseTo('idle');}
    if(p.status!==previousStatus){if(p.status==='loss_pending')phaseTo(previousStatus?'steal':'caught');else if(p.status==='lost'){phaseTo(previousStatus==='loss_pending'||!previousStatus?'escape':'steal');if(!previousStatus)phaseTime=1;}else if(p.status==='won'||p.status==='final_ready')phaseTo('win');else if(p.status==='active'&&p.boosterUsed&&!previousBoost)phaseTo('rescue');else if(p.status==='home'||p.status==='active')phaseTo('idle');previousStatus=p.status;previousBoost=!!p.boosterUsed;}
    if(p.paused||document.hidden){if(!ready){renderer.render(scene,camera);ready=true;el.dataset.renderer=software?'software-3d':'webgl';p.onReady(true);}return;}
    time+=dt;phaseTime+=dt;impulse.current*=Math.exp(-dt*13);lean.current*=Math.exp(-dt*6);
    const t=phaseTime,smooth=(x:number)=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);},idle=reduced.matches?0:Math.sin(time*2.3)*.035;
    m.bag.visible=true;m.bag.position.set(0,idle,0);m.bag.rotation.set(0,-.24+Math.sin(time*.7)*.08,reduced.matches?0:lean.current);m.bag.scale.set(1+impulse.current*.035,1-impulse.current*.05,1+impulse.current*.025);
    m.squirrel.visible=false;m.squirrel.scale.setScalar(.92);m.squirrel.rotation.set(0,-side*.23,0);m.squirrel.position.set(side*3.8,0,0);
    const afraid=['steal','caught','escape'].includes(phase);m.fear.visible=afraid;m.smile.visible=!afraid;m.tooth.visible=false;m.eyes.forEach(e=>e.scale.y=afraid?.78:.66);m.brows.forEach((b,i)=>{b.position.y=afraid?.1:0;b.rotation.z=afraid?(i===0?-.12:.12):0;});m.bagArms.forEach((arm,i)=>arm.rotation.z=afraid?(i===0?-1.85:1.85):Math.sin(time*2+i)*.05);m.squirrelArms.forEach((arm,i)=>arm.rotation.z=(i===0?-.35:.35));m.squirrelFeet.forEach((foot,i)=>foot.rotation.x=0);m.tail.rotation.z=reduced.matches?0:Math.sin(time*2)*.07;m.head.rotation.z=reduced.matches?0:Math.sin(time*1.8)*.025;
    if(p.status==='home'){m.bag.position.x=-.48;m.bag.scale.multiplyScalar(1.08);m.squirrel.visible=true;m.squirrel.position.set(.82,0,-.48);m.squirrel.scale.setScalar(.7);m.squirrel.rotation.y=-.5;}
    const hold=()=>{m.squirrel.visible=true;m.squirrel.position.set(side*.5,.03,0);m.bag.position.set(side*-.25,.47,.53);m.bag.scale.setScalar(.64);m.bag.rotation.set(0,-side*.2,side*-.17);m.squirrelArms[side===1?0:1].rotation.z=side===1?-1.3:1.3;};
    if(phase==='steal'){
     m.squirrel.visible=true;const approach=smooth(t/.45);m.squirrel.position.set(side*(2.55-2.05*approach),reduced.matches?0:Math.abs(Math.sin(t*18))*.13,variant===2?-.65*(1-approach):0);
     m.squirrelFeet.forEach((foot,i)=>foot.rotation.x=reduced.matches?0:Math.sin(t*20+i*Math.PI)*.65);
     if(variant===2&&!reduced.matches)m.squirrel.position.y+=Math.sin(Math.PI*approach)*.6;
     if(t>.3){const grab=smooth((t-.3)/.28);m.bag.position.set(side*-.25*grab,.47*grab,.53*grab);m.bag.scale.setScalar(1-.36*grab);m.bag.rotation.z=-side*.17*grab;m.squirrelArms[side===1?0:1].rotation.z=side===1?-1.3:1.3;}
     if(t>.65)phaseTo(p.status==='lost'?'escape':'caught');
    }else if(phase==='caught'){hold();if(!reduced.matches)m.bag.rotation.z+=Math.sin(time*22)*.024;}
    else if(phase==='escape'){hold();const away=smooth(t/.85);m.squirrel.position.x+=side*4*away;m.bag.position.x+=side*4*away;m.squirrel.position.y+=reduced.matches?0:Math.abs(Math.sin(t*18))*.13;m.bag.position.y+=m.squirrel.position.y;m.squirrelFeet.forEach((foot,i)=>foot.rotation.x=reduced.matches?0:Math.sin(t*20+i*Math.PI)*.65);if(t>.85){m.bag.visible=false;m.squirrel.visible=false;}}
    else if(phase==='rescue'){const run=smooth(t/.72);m.squirrel.visible=t<.75;m.squirrel.position.set(side*(.5+3.8*run),reduced.matches?0:Math.sin(Math.PI*run)*.6,0);m.squirrel.rotation.z=side*-.3*Math.sin(Math.PI*run);m.squirrelArms.forEach((arm,i)=>arm.rotation.z=i===0?-2:2);const drop=smooth(t/.3);m.bag.position.set(0,.47*(1-drop),.53*(1-drop));m.bag.scale.setScalar(.64+.36*drop);if(t>.78)phaseTo('idle');}
    else if(phase==='win'&&!reduced.matches){m.bag.position.y=Math.abs(Math.sin(Math.min(t,1.2)*Math.PI*2))*.22*(t<1.2?1:0);m.bagArms.forEach((arm,i)=>arm.rotation.z=i===0?-1.6:1.6);m.bag.rotation.y=-.13+Math.sin(t*3)*.15;}
    if(reduced.matches){m.bag.rotation.z=0;if(phase==='steal'){hold();phaseTo(p.status==='lost'?'escape':'caught');}if(phase==='escape'){m.bag.visible=false;m.squirrel.visible=false;}if(phase==='rescue')phaseTo('idle');}
    // Fixed pool: latest taps trigger short product arcs, never a delayed queue.
    if(lastTapSerial!==tapSerial.current){lastTapSerial=tapSerial.current;if(p.status==='active'&&!reduced.matches)for(let j=0;j<2;j++){const i=productCursor++%m.products.length;flights[i]={age:0,side:(i%2?1:-1)};}}
    let flying=0;flights.forEach((f,i)=>{f.age+=dt;const item=m.products[i],wasVisible=item.visible;item.visible=p.status==='active'&&!reduced.matches&&f.age<.68;if(wasVisible!==item.visible)dirty=true;if(!item.visible)return;flying++;const u=f.age/.68;item.position.set(f.side*(.12+.72*u),2.48+Math.sin(u*Math.PI)*.62-u*.22,.35+u*.36);item.rotation.set(u*5,f.side*u*7,u*3);item.scale.setScalar((1-Math.max(0,(u-.7)/.3))*.85);});
    bagShadow.visible=m.bag.visible;squirrelShadow.visible=m.squirrel.visible;bagShadow.position.x=m.bag.position.x;bagShadow.position.z=m.bag.position.z;bagShadow.scale.set(m.bag.scale.x,1,m.bag.scale.z);squirrelShadow.position.x=m.squirrel.position.x;squirrelShadow.position.z=m.squirrel.position.z;
    if(el.dataset.products!==String(flying))el.dataset.products=String(flying);el.dataset.ground='stone';if(el.dataset.lean!==lean.current.toFixed(3))el.dataset.lean=lean.current.toFixed(3);
    if(!dirty&&ready&&!flying&&((software&&['idle','caught'].includes(phase)&&phaseTime>.5&&impulse.current<.01&&Math.abs(lean.current)<.003)||(phase==='escape'&&t>1.2)||(software&&phase==='win'&&t>1.5)))return;
    renderer.render(scene,camera);dirty=false;if(!ready){ready=true;el.dataset.renderer=software?'software-3d':'webgl';p.onReady(true);}
   };
   const lost=(e:Event)=>{e.preventDefault();setFailed(true);live.current.onReady(true);};renderer.domElement.addEventListener('webglcontextlost',lost);if(renderer instanceof T.WebGLRenderer)renderer.compile(scene,camera);frame=requestAnimationFrame(render);
   cleanup=()=>{cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('webglcontextlost',lost);scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(x=>x.dispose());}});m.texture.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  }catch{if(!dead){setFailed(true);live.current.onReady(true);}}})();
  return()=>{dead=true;cleanup();};
 },[]);
 return <div ref={host} className="scene-3d" aria-hidden="true" data-testid="scene-3d">{failed&&<div className={`scene-fallback fallback-${props.status}`}><img src="/assets/bag-3d.webp" alt=""/>{['loss_pending','lost'].includes(props.status)&&<img src="/assets/squirrel-3d.webp" alt=""/>}</div>}</div>;
});
