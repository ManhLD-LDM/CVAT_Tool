/* Independent screen/box geometry for manual batch drafts (yaw-only handles). */
(function(root){
'use strict';
function projection(base,view){
 const c=Math.cos(base[5]),s=Math.sin(base[5]),dims=view==='Top'?[base[6],base[7]]:view==='Side'?[base[6],base[8]]:[base[7],base[8]],scale=Math.min(270/(dims[0]+2.8),85/(dims[1]+2));
 function point(q){const dx=q[0]-base[0],dy=q[1]-base[1],z=q[2]-base[2],u=c*dx+s*dy,v=-s*dx+c*dy;return view==='Top'?[150+u*scale,55-v*scale]:view==='Side'?[150+u*scale,55-z*scale]:[150+v*scale,55-z*scale];}
 function move(p,dx,dy){const q=p.slice(),a=dx/scale,b=-dy/scale;if(view==='Top'){q[0]+=c*a-s*b;q[1]+=s*a+c*b;}else if(view==='Side'){q[0]+=c*a;q[1]+=s*a;q[2]+=b;}else{q[0]-=s*a;q[1]+=c*a;q[2]+=b;}return q;}
 function axis(p,i){return i===0?[Math.cos(p[5]),Math.sin(p[5]),0]:i===1?[-Math.sin(p[5]),Math.cos(p[5]),0]:[0,0,1];}
 function handles(p){const center=point(p),indices=view==='Top'?[0,1]:view==='Side'?[0,2]:[1,2];return indices.map(i=>{const a=axis(p,i),position=point(p.slice(0,3).map((v,j)=>v+a[j]*p[6+i]/2)),unit=point(p.slice(0,3).map((v,j)=>v+a[j]));return {axis:i,position,direction:unit.map((v,j)=>v-center[j])};}).filter(h=>Math.hypot(...h.direction)>1e-4);}
 function resize(p,i,dx,dy){const q=p.slice(),h=handles(p).find(h=>h.axis===i);if(!h)return q;const d=h.direction,raw=(dx*d[0]+dy*d[1])/(d[0]*d[0]+d[1]*d[1]),size=Math.min(100,Math.max(.01,p[6+i]+raw)),delta=size-p[6+i],a=axis(p,i);q[6+i]=size;for(let j=0;j<3;j++)q[j]+=a[j]*delta/2;return q;}
 function yaw(p,start,end){if(view!=='Top')return p.slice();const center=point(p),a=Math.atan2(-(start[1]-center[1]),start[0]-center[0]),b=Math.atan2(-(end[1]-center[1]),end[0]-center[0]),q=p.slice();q[5]=Math.atan2(Math.sin(p[5]+b-a),Math.cos(p[5]+b-a));return q;}
 return {point,move,handles,resize,yaw,scale};
}
function hull(points){const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);const low=[],high=[];for(const p of sorted){while(low.length>1&&cross(low.at(-2),low.at(-1),p)<=0)low.pop();low.push(p);}for(const p of sorted.slice().reverse()){while(high.length>1&&cross(high.at(-2),high.at(-1),p)<=0)high.pop();high.push(p);}return low.slice(0,-1).concat(high.slice(0,-1));}
const api={projection,hull};root.__C3D_REVIEW_GEOMETRY=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
