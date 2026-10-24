/* Shared direction wheel model: clockwise degrees, vehicle forward = zero. */
(function(root){
 'use strict';
 const wrap=a=>((a%360)+360)%360;
 const difference=(a,b)=>((a-b+540)%360)-180;
 function defaults(){return {version:1,heading:0,slots:[['Back',180,0],['Front',0,1],['Front-left',315,2],['Left',270,3],['Back-left',225,4],['Front-right',45,5],['Right',90,6],['Back-right',135,7]].map(([name,angle,image],i)=>({id:'pov-'+i,name,angle,image,start:null}))};}
 function normalize(raw){const out=defaults();if(raw?.version!==1)return out;if(Number.isFinite(raw.heading))out.heading=wrap(raw.heading);if(!Array.isArray(raw.slots)||raw.slots.length>32)return out;
  const ids=new Set(),angles=new Set();out.slots=[];for(const s of raw.slots){if(!s||typeof s.id!=='string'||!s.id||s.id.length>80||ids.has(s.id)||typeof s.name!=='string'||!Number.isFinite(s.angle)||angles.has(wrap(s.angle))||!(s.image===null||Number.isInteger(s.image)&&s.image>=0&&s.image<64))continue;ids.add(s.id);angles.add(wrap(s.angle));out.slots.push({id:s.id,name:s.name.slice(0,80),angle:wrap(s.angle),image:s.image,start:Number.isFinite(s.start)?wrap(s.start):null});}return out;}
 function sectors(config){const slots=[...config.slots].sort((a,b)=>a.angle-b.angle);return slots.map((s,i)=>{const previous=slots[(i+slots.length-1)%slots.length],gap=slots.length===1?360:wrap(s.angle-previous.angle),mid=wrap(previous.angle+gap/2),custom=s.start;
  const start=Number.isFinite(custom)&&wrap(custom-previous.angle)>0&&wrap(custom-previous.angle)<gap?custom:mid;return {...s,start};});}
 function select(config,bearing,previousId=null){if(!Number.isFinite(bearing))return null;const slots=sectors(config);if(!slots.length)return null;if(slots.length===1)return slots[0];const angle=wrap(bearing-config.heading);
  const inside=(s,i,margin=0)=>{const end=slots[(i+1)%slots.length].start;return wrap(angle-s.start)>=margin&&wrap(angle-s.start)<=wrap(end-s.start)-margin;};
  let i=slots.findIndex((s,i)=>inside(s,i));if(i<0)i=0;const next=slots[i],previous=slots.find(s=>s.id===previousId);
  // A 3 degree dead band prevents flicker when crossing a boundary.
  if(previous&&previous.id!==next.id&&Math.min(Math.abs(difference(angle,next.start)),Math.abs(difference(angle,slots[(i+1)%slots.length].start)))<3)return previous;
  return next;
 }
 function bearing(origin,target){if(!origin||!target||![...origin,...target].every(Number.isFinite)||Math.hypot(target[0]-origin[0],target[1]-origin[1])<.05)return null;return wrap(-Math.atan2(target[1]-origin[1],target[0]-origin[0])*180/Math.PI);}
 const api={defaults,normalize,sectors,select,bearing,wrap};root.__C3D_REFERENCE_IMAGES=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
