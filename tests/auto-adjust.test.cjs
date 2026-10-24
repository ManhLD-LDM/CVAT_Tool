const {test}=require('node:test'),assert=require('node:assert/strict'),m=require('../extension/geometry_math.js');
const ground={a:0,b:0,c:0,accepted:true,confidence:1};
const box=yaw=>({points:[0,0,1,0,0,yaw,4,2,2,0,0,0,0,0,0,0]});
function cloud(yaw=0){const points=[],c=Math.cos(yaw),s=Math.sin(yaw);for(let i=0;i<=24;i++)for(let j=0;j<=12;j++)for(const z of [.3,.6,.9,1.2]){const x=-1+i/12,y=-.4+j/15;points.push([c*x-s*y,s*x+c*y,z]);}for(let x=-3;x<3;x+=.2)for(let y=-2;y<2;y+=.2)points.push([x,y,0]);points.push([8,8,1]);return points;}
for(const yaw of [0,.6,-1.2])for(const [long,lateral,dx,dy] of [['forward','left',1,.6],['backward','right',-1,-.6],['forward','none',1,0],['none','right',0,-.6]])test('fixed-size push '+long+'/'+lateral+' yaw '+yaw,()=>{
 const original=box(yaw),result=m.autoAdjustBox(cloud(yaw),original,ground,[],{moveLongitudinal:long,moveLateral:lateral}),p=result.points;
 assert.ok(Math.abs(p[0]-(Math.cos(yaw)*dx-Math.sin(yaw)*dy))<.05);assert.ok(Math.abs(p[1]-(Math.sin(yaw)*dx+Math.cos(yaw)*dy))<.05);assert.deepEqual(p.slice(2),original.points.slice(2));
 const repeated=m.autoAdjustBox(cloud(yaw),{points:p},ground,[],{moveLongitudinal:long,moveLateral:lateral});assert.ok(Math.hypot(repeated.points[0]-p[0],repeated.points[1]-p[1])<1e-6);
});
test('ground, disconnected outliers and neighboring objects cannot supply contact',()=>{
 const source=cloud(),original=box(0),options={moveLongitudinal:'forward'};
 assert.deepEqual(m.autoAdjustBox([...source,...Array(200).fill([20,20,1])],original,ground,[],options).points,m.autoAdjustBox(source,original,ground,[],options).points);
 assert.throws(()=>m.autoAdjustBox(source.filter(q=>q[2]===0),original,ground,[],options),/No supported/);
 assert.throws(()=>m.autoAdjustBox(source,original,ground,[original],options),/No supported/);
 assert.throws(()=>m.autoAdjustBox(source,original,{...ground,accepted:false},[],options),/Reliable ground/);
});
test('oversized support and tilted boxes fail',()=>{
 const original=box(0);original.points[6]=1;assert.throws(()=>m.autoAdjustBox(cloud(),original,ground,[],{moveLongitudinal:'forward'}),/extends beyond/);original.points[6]=4;original.points[3]=.1;assert.throws(()=>m.autoAdjustBox(cloud(),original,ground,[],{}),/upright/);
});
test('options no longer expose obsolete shrink limits',()=>{assert.deepEqual(m.autoAdjustOptions({maxShrinkDistance:10}),{autoMove:true,autoGround:true,moveLongitudinal:'none',moveLateral:'none'});});
test('near-ground layers follow local slope and cannot authorize a push',()=>{
 const sloped={...ground,a:.02,rmse:.03},layer=[];for(let x=-2;x<=2;x+=.08)for(let y=-1;y<=1;y+=.08)layer.push([x,y,.02*x+.18]);
 assert.throws(()=>m.autoAdjustBox(layer,box(0),sloped,[],{moveLongitudinal:'forward'}),/No supported/);
 const clean=cloud().filter(q=>q[2]>.2).map(([x,y,z])=>[x,y,z+.02*x]);assert.deepEqual(m.autoAdjustBox([...clean,...layer],box(0),sloped,[],{moveLongitudinal:'forward'}).points,m.autoAdjustBox(clean,box(0),sloped,[],{moveLongitudinal:'forward'}).points);
});
