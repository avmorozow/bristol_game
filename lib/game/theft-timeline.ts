// Shared clock for the 3D bag and the two original-art sprite frames.
export const THEFT={grab:560,disappear:700,swap:740,finish:1080} as const;
export function theftFrame(elapsed:number){
 const t=Math.max(0,elapsed);
 return {phase:t<THEFT.grab?'approach':t<THEFT.swap?'grab':t<THEFT.finish?'carry':'done',
  bagScale:t<THEFT.grab?1:Math.max(0,1-(t-THEFT.grab)/(THEFT.disappear-THEFT.grab)),
  showBag:t<THEFT.disappear,showCarriedBag:t>=THEFT.swap};
}
