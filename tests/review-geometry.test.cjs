const {test}=require('node:test'),assert=require('node:assert/strict');
const {projection}=require('../extension/review_geometry.js');
const p=[10,20,2,0,0,.7,4,2,2,0,0,0,0,0,0,0];
test('manual drag translates in each review plane with fixed dimensions and rotation',()=>{
 for(const view of ['Top','Side','Front']){const g=projection(p,view),q=g.move(p,20,-10);assert.deepEqual(q.slice(3),p.slice(3));const a=g.point(p),b=g.point(q);assert.ok(Math.abs(b[0]-a[0]-20)<1e-8);assert.ok(Math.abs(b[1]-a[1]+10)<1e-8);}
});
test('resize handles keep opposite face fixed and enforce positive dimensions',()=>{
 for(const view of ['Top','Side','Front']){const g=projection(p,view);for(const h of g.handles(p)){const q=g.resize(p,h.axis,h.direction[0],h.direction[1]),a=h.axis===0?[Math.cos(p[5]),Math.sin(p[5]),0]:h.axis===1?[-Math.sin(p[5]),Math.cos(p[5]),0]:[0,0,1];for(let j=0;j<3;j++)assert.ok(Math.abs((q[j]-a[j]*q[6+h.axis]/2)-(p[j]-a[j]*p[6+h.axis]/2))<1e-8);assert.ok(Math.abs(q[6+h.axis]-p[6+h.axis]-1)<1e-8);assert.ok(g.resize(p,h.axis,-1e8,-1e8).slice(6,9).every(v=>v>=.01));}}
});
test('yaw rotation works in Top only and keeps center, dimensions, roll/pitch unchanged',()=>{
 const g=projection(p,'Top'),center=g.point(p),q=g.yaw(p,[center[0]+30,center[1]],[center[0],center[1]-30]);assert.ok(Math.abs(q[5]-p[5]-Math.PI/2)<1e-8);assert.deepEqual(q.slice(0,5),p.slice(0,5));assert.deepEqual(q.slice(6),p.slice(6));assert.deepEqual(projection(p,'Side').yaw(p,[0,0],[2,2]),p);
});
