import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
const mat=(color:number,roughness=.48)=>new T.MeshStandardMaterial({color,roughness,metalness:.02});
export function buildCharacters(lowPower=false){
 const red=mat(0xb91d2b,.78),redDark=mat(0xa80719),white=mat(0xfff7e9),black=mat(0x241016),orange=mat(0x985b31,.96),light=mat(0xc1ac8a,.95),brown=mat(0x58220d),blue=mat(0x286b9b);
 const sphere=new T.SphereGeometry(1,lowPower?14:24,lowPower?9:16);
 function ball(parent:T.Object3D,m:T.Material,x:number,y:number,z:number,sx:number,sy=sx,sz=sx){const o=new T.Mesh(sphere,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);parent.add(o);o.castShadow=true;return o;}
 function box(parent:T.Object3D,m:T.Material,w:number,h:number,d:number,x:number,y:number,z:number,r=.1){const o=new T.Mesh(new RoundedBoxGeometry(w,h,d,3,r),m);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;}
 function line(parent:T.Object3D,m:T.Material,points:number[][],r=.045){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p as [number,number,number])));const o=new T.Mesh(new T.TubeGeometry(curve,20,r,lowPower?6:8,false),m);parent.add(o);return o;}
 const bag=new T.Group(),body=new T.Group();bag.add(body);
 const pouch=box(body,red,1.6,1.8,.7,0,1.28,0,.07);const pouchVertices=pouch.geometry.attributes.position;for(let i=0;i<pouchVertices.count;i++){const y=pouchVertices.getY(i);pouchVertices.setX(i,pouchVertices.getX(i)*(1-.09*(y+.9)/1.8));}pouch.geometry.computeVertexNormals();
 // Folded side gussets and embossed seams make the character a physical bag.
 const crease=mat(0x941421,.94),edge=mat(0xc5343c,.85);
 for(const side of [-1,1]){
  line(body,crease,[[side*.73,.46,.32],[side*.64,1.15,.35],[side*.7,2.12,.28]],.013);
  line(body,edge,[[side*.7,.43,.32],[side*.43,.61,.354],[side*.3,.79,.355]],.008);
  line(body,crease,[[side*.7,.42,-.31],[side*.59,1.3,-.35],[side*.69,2.13,-.29]],.012);
 }
 line(body,crease,[[-.68,.42,.34],[0,.4,.355],[.68,.42,.34]],.015);
 // A recessed opening, two genuinely volumetric handles, and groceries.
 box(body,redDark,1.12,.13,.48,0,2.16,0,.06);
 for(const z of [-.25,.25])line(body,red,[[-.51,2.05,z],[-.51,2.55,z],[0,2.79,z],[.51,2.55,z],[.51,2.05,z]],.085);
 box(body,mat(0x398257),.35,.6,.24,.32,2.27,-.04,.04).rotation.z=-.16;
 const bottle=ball(body,mat(0x258ac8,.2),-.3,2.29,0,.14,.33,.14);box(body,mat(0x1463ac),.18,.12,.18,-.3,2.63,0,.025);
 const can=new T.Mesh(new T.CylinderGeometry(.18,.18,.26,24),mat(0xf0b645,.3));can.position.set(.02,2.2,.16);body.add(can);
 const eyes:T.Group[]=[];
 for(const x of [-.28,.28]){const eye=new T.Group();eye.position.set(x*.77,1.65,.34);eye.scale.set(.66,.66,.66);ball(eye,white,0,0,0,.245,.29,.115);ball(eye,brown,.025,-.015,.105,.112,.135,.066);ball(eye,black,.028,-.015,.16,.056,.086,.025);ball(eye,white,.06,.048,.185,.028);body.add(eye);eyes.push(eye);}
 const brows=[line(body,redDark,[[-.52,2.01,.43],[-.3,2.1,.48],[-.08,2.04,.44]],.023),line(body,redDark,[[.08,2.04,.44],[.3,2.1,.48],[.52,2.01,.43]],.023)];
 const smile=ball(body,black,0,1.22,.42,.15,.047,.02),fear=ball(body,black,0,1.12,.42,.105,.155,.025);fear.visible=false;
 const sadMouth=line(body,black,[[-.15,1.11,.44],[0,1.2,.46],[.15,1.11,.44]],.026);sadMouth.visible=false;
 const sadBrows=new T.Group();body.add(sadBrows);sadBrows.visible=false;
 line(sadBrows,redDark,[[-.5,2.01,.43],[-.29,2.07,.48],[-.08,2.18,.44]],.025);
 line(sadBrows,redDark,[[.08,2.18,.44],[.29,2.07,.48],[.5,2.01,.43]],.025);
 const tooth=box(body,white,.17,.016,.012,0,1.24,.38,.005);
 const label=document.createElement('canvas');label.width=512;label.height=128;const ctx=label.getContext('2d')!;ctx.fillStyle='#ffffff';ctx.font='bold 80px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('Бристоль',256,65);const texture=new T.CanvasTexture(label);texture.colorSpace=T.SRGBColorSpace;
 const logo=new T.Mesh(new T.PlaneGeometry(1.25,.31),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));logo.userData.label='Бристоль';logo.position.set(0,.8,.363);body.add(logo);
 const bagArms:T.Group[]=[];for(const side of [-1,1]){const arm=new T.Group();arm.position.set(side*.72,1.38,0);arm.scale.setScalar(.78);ball(arm,red,side*.16,-.17,0,.12,.3,.13).rotation.z=side*.5;ball(arm,red,side*.28,-.35,.05,.18,.19,.15);body.add(arm);bagArms.push(arm);}
 const bagFeet:T.Mesh[]=[];for(const x of [-.4,.4]){ball(bag,redDark,x,.26,0,.12,.24,.13);bagFeet.push(ball(bag,red,x,.12,.13,.17,.1,.23));}
 const squirrel=new T.Group(),torso=new T.Group();squirrel.add(torso);
 ball(torso,orange,0,.95,0,.36,.66,.31);ball(torso,light,0,.98,.265,.235,.42,.08);for(const side of [-1,1])ball(torso,orange,side*.24,.49,-.02,.24,.31,.25);
 const head=new T.Group();head.position.set(0,1.68,.11);head.scale.set(.83,.83,.9);torso.add(head);ball(head,orange,0,0,0,.45,.41,.4);
 for(const x of [-.28,.28]){const ear=new T.Group();ear.position.set(x,.44,-.05);ear.rotation.z=-Math.sign(x)*.18;const e=new T.Mesh(new T.ConeGeometry(.115,.4,16),orange);e.position.y=.11;ear.add(e);const inner=new T.Mesh(new T.ConeGeometry(.064,.24,12),mat(0x775146));inner.position.set(0,.11,.07);ear.add(inner);head.add(ear);ball(head,light,x*.75,-.17,.38,.18,.13,.21);}
 for(const side of [-1,1]){
  ball(head,brown,side*.26,.03,.315,.103,.12,.095);
  ball(head,black,side*.27,.035,.369,.075,.084,.061);
  ball(head,white,side*.28,.066,.42,.016);
  // Short cheek tufts and fine whiskers, without a cartoon smile or front teeth.
  for(let j=0;j<3;j++)line(head,brown,[[side*.11,-.17,.53],[side*(.34+j*.055),-.13-j*.065,.5]],.005);
 }
 ball(head,light,0,-.2,.42,.22,.16,.2);ball(head,brown,0,-.13,.61,.072,.047,.05);
 line(head,brown,[[0,-.17,.61],[0,-.24,.6]],.009);
 const tail=new T.Group();tail.position.set(.35,.6,-.28);torso.add(tail);
 const tailCurve=new T.CatmullRomCurve3([[0,0,0],[.54,.28,-.12],[.77,.85,-.16],[.64,1.39,-.13],[.31,1.64,-.1],[.07,1.5,-.07]].map(p=>new T.Vector3(...p as [number,number,number])));
 const tailGeo=new T.TubeGeometry(tailCurve,42,.32,12,false),pos=tailGeo.attributes.position;for(let ring=0;ring<=42;ring++){const u=ring/42,c=tailCurve.getPointAt(u),radius=.35+.9*Math.sin(Math.PI*u)**.6;for(let j=0;j<=12;j++){const i=ring*13+j;pos.setXYZ(i,c.x+(pos.getX(i)-c.x)*radius,c.y+(pos.getY(i)-c.y)*radius,c.z+(pos.getZ(i)-c.z)*radius);}}tailGeo.computeVertexNormals();tail.add(new T.Mesh(tailGeo,orange));
 // Fine tapered fur ridges follow the volume rather than forming a curled toy tail.
 if(!lowPower){const fur=mat(0x75462b,1);for(let j=0;j<20;j++){const u=.12+j*.036,c=tailCurve.getPointAt(u);line(tail,fur,[[c.x-.12,c.y-.09,c.z+.27],[c.x+.015,c.y+.07,c.z+.3],[c.x+.14,c.y+.13,c.z+.22]],.008);}}


 const squirrelArms:T.Group[]=[];for(const side of [-1,1]){const arm=new T.Group();arm.position.set(side*.32,1.22,.03);arm.scale.setScalar(.8);ball(arm,orange,side*.11,-.22,.12,.13,.3,.15).rotation.z=side*.35;ball(arm,orange,side*.15,-.43,.21,.16,.17,.17);torso.add(arm);squirrelArms.push(arm);}
 const squirrelFeet:T.Group[]=[];for(const side of [-1,1]){const leg=new T.Group();leg.position.set(side*.24,.43,0);ball(leg,orange,0,-.17,0,.16,.28,.17);ball(leg,orange,0,-.36,.16,.14,.09,.28);ball(leg,light,0,-.34,.37,.125,.07,.05);squirrel.add(leg);squirrelFeet.push(leg);}
 const products:T.Group[]=[];
 for(let i=0;i<10;i++){
  const item=new T.Group();item.visible=false;
  if(i%4===0){ball(item,mat(0xbd442b,.6),0,0,0,.11,.12,.1);line(item,brown,[[0,.1,0],[.014,.17,0]],.014);ball(item,mat(0x55723b),.045,.14,0,.055,.015,.03).rotation.z=.5;}
  else if(i%4===1){box(item,mat(0xcbbd92),.18,.27,.13,0,0,0,.012);box(item,mat(0x4c715b),.183,.07,.135,0,-.045,0,.004);}
  else if(i%4===2){const tin=new T.Mesh(new T.CylinderGeometry(.085,.085,.2,12),mat(0x8f9994,.3));item.add(tin);box(item,mat(0xb25130),.15,.11,.025,0,0,.075,.006);}
  else{const bread=ball(item,mat(0xc39352,.9),0,0,0,.08,.2,.075);bread.rotation.z=.35;}
  products.push(item);
 }
 return {products,bag,body,eyes,brows,smile,fear,sadMouth,sadBrows,tooth,bagArms,bagFeet,squirrel,torso,head,tail,squirrelArms,squirrelFeet,texture};
}
