import {Color,Vector3,SRGBColorSpace,type Scene,type Camera} from 'three';
import {Projector} from 'three/addons/renderers/Projector.js';
/** CPU fallback renders the SAME 3D geometry when WebGL is unavailable.
 * Canvas avoids thousands of SVG DOM nodes; quality and frame rate are bounded. */
export class SoftwareRenderer{
 readonly domElement=document.createElement('canvas');
 outputColorSpace=SRGBColorSpace; toneMapping=0;toneMappingExposure=1;
 private ctx=this.domElement.getContext('2d')!;
 private projector=new Projector();private width=1;private height=1;
 private light=new Vector3(-.4,.8,1).normalize();private color=new Color();
 setPixelRatio(){} setClearColor(){} compile(){} forceContextLoss(){} dispose(){}
 setSize(w:number,h:number){this.width=w;this.height=h;this.domElement.width=w;this.domElement.height=h;}
 render(scene:Scene,camera:Camera){
  const ctx=this.ctx,w=this.width,h=this.height;ctx.clearRect(0,0,w,h);
  const data=this.projector.projectScene(scene,camera,true,true);
  type Face={v1:{positionScreen:{x:number;y:number;z:number}};v2:Face['v1'];v3:Face['v1'];normalModel:Vector3;material:{color?:Color;map?:unknown;opacity:number}};
  for(const e of data.elements as unknown as Face[]){if(!e.v3||!e.material.color||e.material.map)continue;const {v1,v2,v3}=e;if(v1.positionScreen.z>1||v2.positionScreen.z>1||v3.positionScreen.z>1)continue;
   this.color.copy(e.material.color).multiplyScalar(.55+.65*Math.max(0,e.normalModel.dot(this.light)));ctx.fillStyle=this.color.getStyle(SRGBColorSpace);ctx.strokeStyle=ctx.fillStyle;ctx.globalAlpha=e.material.opacity;ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo((v1.positionScreen.x+1)*w/2,(1-v1.positionScreen.y)*h/2);ctx.lineTo((v2.positionScreen.x+1)*w/2,(1-v2.positionScreen.y)*h/2);ctx.lineTo((v3.positionScreen.x+1)*w/2,(1-v3.positionScreen.y)*h/2);ctx.closePath();ctx.fill();ctx.stroke();
  }
  ctx.globalAlpha=1;scene.traverseVisible(o=>{if(o.userData.label){const c=o.getWorldPosition(new Vector3()).project(camera),left=o.localToWorld(new Vector3(-.625,0,0)).project(camera),up=o.localToWorld(new Vector3(0,.155,0)).project(camera);const x=(c.x+1)*w/2,y=(1-c.y)*h/2,scale=Math.abs(c.x-left.x)*w/2;ctx.save();ctx.translate(x,y);ctx.rotate(-Math.atan2(c.y-left.y,c.x-left.x));ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${Math.max(6,Math.abs(up.y-c.y)*h*.8)}px Arial`;ctx.fillText(o.userData.label,0,0,scale*2);ctx.restore();}});
 }
}
