import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
const mat=(color:number,roughness=.48)=>new T.MeshStandardMaterial({color,roughness,metalness:.02});
export function buildCharacters(lowPower=false){
 const red=mat(0xf51c30,.3),redDark=mat(0xa80719),white=mat(0xfff7e9),black=mat(0x241016),orange=mat(0xd97822,.7),light=mat(0xffd89a,.75),brown=mat(0x58220d),blue=mat(0x286b9b);
 const sphere=new T.SphereGeometry(1,lowPower?14:24,lowPower?9:16);
 function ball(parent:T.Object3D,m:T.Material,x:number,y:number,z:number,sx:number,sy=sx,sz=sx){const o=new T.Mesh(sphere,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);parent.add(o);o.castShadow=true;return o;}
 function box(parent:T.Object3D,m:T.Material,w:number,h:number,d:number,x:number,y:number,z:number,r=.1){const o=new T.Mesh(new RoundedBoxGeometry(w,h,d,3,r),m);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;}
 function line(parent:T.Object3D,m:T.Material,points:number[][],r=.045){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p as [number,number,number])));const o=new T.Mesh(new T.TubeGeometry(curve,20,r,lowPower?6:8,false),m);parent.add(o);return o;}
 const bag=new T.Group(),body=new T.Group();bag.add(body);
 const pouch=box(body,red,1.6,1.8,.82,0,1.28,0,.22);const pouchVertices=pouch.geometry.attributes.position;for(let i=0;i<pouchVertices.count;i++){const y=pouchVertices.getY(i);pouchVertices.setX(i,pouchVertices.getX(i)*(1-.09*(y+.9)/1.8));}pouch.geometry.computeVertexNormals();
 // A recessed opening, two genuinely volumetric handles, and groceries.
 box(body,redDark,1.12,.13,.48,0,2.16,0,.06);
 for(const z of [-.25,.25])line(body,red,[[-.51,2.05,z],[-.51,2.55,z],[0,2.79,z],[.51,2.55,z],[.51,2.05,z]],.085);
 box(body,mat(0x398257),.35,.6,.24,.32,2.27,-.04,.04).rotation.z=-.16;
 const bottle=ball(body,mat(0x258ac8,.2),-.3,2.29,0,.14,.33,.14);box(body,mat(0x1463ac),.18,.12,.18,-.3,2.63,0,.025);
 const can=new T.Mesh(new T.CylinderGeometry(.18,.18,.26,24),mat(0xf0b645,.3));can.position.set(.02,2.2,.16);body.add(can);
 const eyes:T.Group[]=[];
 for(const x of [-.28,.28]){const eye=new T.Group();eye.position.set(x,1.65,.38);ball(eye,white,0,0,0,.245,.29,.115);ball(eye,brown,.025,-.015,.105,.112,.135,.066);ball(eye,black,.028,-.015,.16,.056,.086,.025);ball(eye,white,.06,.048,.185,.028);body.add(eye);eyes.push(eye);}
 const brows=[line(body,redDark,[[-.52,2.01,.43],[-.3,2.1,.48],[-.08,2.04,.44]],.052),line(body,redDark,[[.08,2.04,.44],[.3,2.1,.48],[.52,2.01,.43]],.052)];
 const smile=ball(body,black,0,1.14,.4,.27,.13,.045),fear=ball(body,black,0,1.12,.41,.14,.225,.05);fear.visible=false;
 const tooth=box(body,white,.32,.055,.025,0,1.2,.45,.02);
 const label=document.createElement('canvas');label.width=512;label.height=128;const ctx=label.getContext('2d')!;ctx.fillStyle='#ffffff';ctx.font='bold 80px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('Бристоль',256,65);const texture=new T.CanvasTexture(label);texture.colorSpace=T.SRGBColorSpace;
 const logo=new T.Mesh(new T.PlaneGeometry(1.25,.31),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));logo.userData.label='Бристоль';logo.position.set(0,.75,.382);body.add(logo);
 const bagArms:T.Group[]=[];for(const side of [-1,1]){const arm=new T.Group();arm.position.set(side*.72,1.38,0);ball(arm,red,side*.16,-.17,0,.12,.3,.13).rotation.z=side*.5;ball(arm,red,side*.28,-.35,.05,.18,.19,.15);body.add(arm);bagArms.push(arm);}
 const bagFeet:T.Mesh[]=[];for(const x of [-.4,.4]){ball(bag,redDark,x,.26,0,.12,.24,.13);bagFeet.push(ball(bag,red,x,.12,.13,.23,.13,.3));}
 const squirrel=new T.Group(),torso=new T.Group();squirrel.add(torso);
 ball(torso,orange,0,.98,0,.46,.66,.35);ball(torso,light,0,.96,.29,.32,.44,.09);box(torso,blue,.78,.35,.6,0,.5,.02,.14);
 const head=new T.Group();head.position.set(0,1.76,.02);torso.add(head);ball(head,orange,0,0,0,.59,.52,.46);
 for(const x of [-.32,.32]){const ear=new T.Group();ear.position.set(x,.44,-.05);ear.rotation.z=-Math.sign(x)*.18;const e=new T.Mesh(new T.ConeGeometry(.19,.64,20),orange);e.position.y=.25;ear.add(e);const inner=new T.Mesh(new T.ConeGeometry(.1,.39,16),mat(0xcf896d));inner.position.set(0,.24,.1);ear.add(inner);head.add(ear);ball(head,light,x*.75,-.17,.38,.29,.23,.16);}
 for(const side of [-1,1]){ball(head,white,side*.24,.05,.38,.175,.2,.11);ball(head,brown,side*.24-.025,.03,.475,.082,.105,.05);ball(head,black,side*.24-.025,.03,.516,.04,.067,.022);ball(head,white,side*.24,.078,.539,.023);line(head,brown,[[side*.09,.22,.44],[side*.25,.3,.46],[side*.43,.25,.4]],.046);}
 ball(head,brown,0,-.16,.56,.14,.085,.08);line(head,brown,[[-.16,-.3,.51],[0,-.36,.57],[.16,-.3,.51]],.022);
 for(const x of [-.047,.047])box(head,white,.085,.145,.048,x,-.36,.575,.023);
 const tail=new T.Group();tail.position.set(.35,.6,-.28);torso.add(tail);
 const tailCurve=new T.CatmullRomCurve3([[0,0,0],[.63,.35,-.08],[.95,1.22,-.06],[.62,1.74,0],[.16,1.6,.03],[.18,1.16,.06],[.48,1.13,.1]].map(p=>new T.Vector3(...p as [number,number,number])));
 const tailGeo=new T.TubeGeometry(tailCurve,42,.32,12,false),pos=tailGeo.attributes.position;for(let ring=0;ring<=42;ring++){const u=ring/42,c=tailCurve.getPointAt(u),radius=.35+.9*Math.sin(Math.PI*u)**.6;for(let j=0;j<=12;j++){const i=ring*13+j;pos.setXYZ(i,c.x+(pos.getX(i)-c.x)*radius,c.y+(pos.getY(i)-c.y)*radius,c.z+(pos.getZ(i)-c.z)*radius);}}tailGeo.computeVertexNormals();tail.add(new T.Mesh(tailGeo,orange));

 const squirrelArms:T.Group[]=[];for(const side of [-1,1]){const arm=new T.Group();arm.position.set(side*.4,1.22,.03);ball(arm,orange,side*.11,-.22,.12,.13,.3,.15).rotation.z=side*.35;ball(arm,orange,side*.15,-.43,.21,.16,.17,.17);torso.add(arm);squirrelArms.push(arm);}
 const squirrelFeet:T.Group[]=[];for(const side of [-1,1]){const leg=new T.Group();leg.position.set(side*.24,.43,0);ball(leg,orange,0,-.17,0,.16,.28,.17);ball(leg,orange,0,-.36,.16,.2,.12,.31);ball(leg,light,0,-.34,.37,.125,.07,.05);squirrel.add(leg);squirrelFeet.push(leg);}
 return {bag,body,eyes,brows,smile,fear,tooth,bagArms,bagFeet,squirrel,torso,head,tail,squirrelArms,squirrelFeet,texture};
}
