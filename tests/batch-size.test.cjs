const {test}=require('node:test'),assert=require('node:assert/strict');
const math=require('../extension/geometry_math.js');
const {createBatchSizeController}=require('../extension/batch_size.js');
function fixture(){
 const shapes=new Map([0,14].map(frame=>[frame,{frame,points:[frame,.2*frame,1+frame/20,0,0,.03*frame,4+frame/14,2,2,0,0,0,0,0,0,0],outside:false,type:'cuboid'}]));
 const history=[],snap={jobId:601,sessionId:'s',frame:7,boxes:[]};let fail=null,readonly=false,locked=false,saves=0,refreshes=0;
 let protect=-1,outside=-1;const stateAt=f=>{
  const ordered=[...shapes.keys()].sort((a,b)=>a-b),a=ordered.filter(x=>x<=f).at(-1),b=ordered.find(x=>x>=f),pa=shapes.get(a).points,pb=shapes.get(b??a).points;
  const points=pa.map((x,i)=>i<9&&b!==a&&b!=null?x+(pb[i]-x)*(f-a)/(b-a):x);
  return {clientID:5,serverID:42339,objectType:'track',shapeType:'cuboid',frame:f,points,keyframe:shapes.has(f),outside:f===outside,lock:f===protect,
   async save(){if(f===fail)throw new Error('injected failure');saves++;history.push(f);shapes.set(f,{frame:f,points:this.points.slice(),outside:this.outside,type:'cuboid'});return this;}};
 };
 const exported=()=>({clientID:5,id:42339,label_id:1,shapes:[...shapes.values()].sort((a,b)=>a.frame-b.frame)});
 const job={startFrame:0,stopFrame:14,annotations:{get:async f=>[stateAt(f)],export:async()=>({tracks:[structuredClone(exported())]})}};let activeJob=job;
 snap.boxes=[{id:5,objectType:'track',points:stateAt(7).points}];
 const controller=createBatchSizeController({math,job:()=>activeJob,snapshot:()=>snap,assertEditable(){if(readonly)throw new Error('readonly');},lock:v=>locked=v,refresh:async()=>refreshes++});
 return {controller,shapes,history,snap,job,stateAt,exported,fail:f=>fail=f,protect:f=>protect=f,outside:f=>outside=f,readonly:()=>readonly=true,changeJob:()=>activeJob={...job},get locked(){return locked;},get saves(){return saves;},get refreshes(){return refreshes;}};
}
const params=(meta,extra={})=>({token:meta.token,from:3,to:10,dimensions:[4.5,1.8,1.5],anchor:'bottom',...extra});
test('manual size edits every visible frame including keyframes, retaining IDs and orientation without PCD',async()=>{
 const f=fixture(),m=await f.controller.open(5),before=Array.from({length:15},(_,i)=>f.stateAt(i).points.slice());
 const plan=await f.controller.preview(params(m,{from:0,to:14}));assert.equal(plan.frames.length,15);assert.equal(plan.keyframes,2);assert.equal(f.saves,0);
 const r=await f.controller.apply(plan);assert.equal(r.error,null);assert.equal(r.appliedFrames.length,15);assert.equal(f.exported().id,42339);assert.equal(f.exported().clientID,5);
 for(let i=0;i<=14;i++){const p=f.stateAt(i).points;assert.deepEqual(p.slice(6,9),[4.5,1.8,1.5]);assert.deepEqual(p.slice(0,2),before[i].slice(0,2));assert.deepEqual(p.slice(3,6),before[i].slice(3,6));assert.ok(Math.abs(math.parseCVAT16Points(p).zBottom-math.parseCVAT16Points(before[i]).zBottom)<1e-8);}
 assert.equal(f.locked,false);assert.equal(f.refreshes,1);await assert.rejects(f.controller.apply(plan),/Xem trước/);
});
test('sparse interpolation stays unchanged outside range; boundary keys are saved first',async()=>{
 const f=fixture(),m=await f.controller.open(5),before=Array.from({length:15},(_,i)=>f.stateAt(i).points.slice());
 const plan=await f.controller.preview(params(m,{anchor:'center'}));assert.deepEqual(plan.boundaryFrames,[2,11]);
 const r=await f.controller.apply(plan);assert.equal(r.error,null);assert.deepEqual(f.history.slice(0,2),[2,11]);
 for(const i of [0,1,2,11,12,13,14])f.stateAt(i).points.forEach((v,j)=>assert.ok(Math.abs(v-before[i][j])<1e-8));
 for(let i=3;i<=10;i++)assert.deepEqual(f.stateAt(i).points.slice(0,6),before[i].slice(0,6));
});
test('keep bottom handles roll and pitch using rotated cuboid vertices',async()=>{
 const f=fixture();for(const shape of f.shapes.values())shape.points.splice(3,3,.15,.22,.7);
 const old=f.stateAt(7).points.slice(),m=await f.controller.open(5),plan=await f.controller.preview(params(m,{from:7,to:7}));
 const r=await f.controller.apply(plan);assert.equal(r.error,null);assert.ok(Math.abs(math.parseCVAT16Points(old).zBottom-math.parseCVAT16Points(f.stateAt(7).points).zBottom)<1e-8);
});
test('outside frames are skipped; locked states and boundaries block all writes',async()=>{
 const f=fixture();f.outside(7);const m=await f.controller.open(5),plan=await f.controller.preview(params(m));assert.deepEqual(plan.skipped,[7]);
 for(const frame of [2,5]){const g=fixture();g.protect(frame);const n=await g.controller.open(5);await assert.rejects(g.controller.preview(params(n)),/khóa/);assert.equal(g.saves,0);}
});
test('range, finite positive dimensions, anchor and standalone shapes are validated',async()=>{
 const f=fixture(),m=await f.controller.open(5);
 for(const extra of [{from:10,to:3},{from:-1},{to:15},{from:1.5},{dimensions:[NaN,2,2]},{dimensions:[0,2,2]},{dimensions:[101,2,2]},{anchor:'ground'}])await assert.rejects(f.controller.preview(params(m,extra)));
 f.snap.boxes[0].objectType='shape';await assert.rejects(f.controller.open(5),/TRACK/);assert.equal(f.saves,0);
});
test('stale previews, read-only editor, changed jobs and concurrent apply cannot write twice',async()=>{
 for(const mode of ['changed','readonly','job','locked']){
  const f=fixture(),m=await f.controller.open(5),plan=await f.controller.preview(params(m));
  if(mode==='changed')f.shapes.get(0).points[0]++;if(mode==='readonly')f.readonly();if(mode==='job')f.changeJob();if(mode==='locked')f.protect(7);
  const r=await Promise.allSettled([f.controller.apply(plan)]);if(r[0].status==='fulfilled')assert.ok(r[0].value.error);assert.equal(f.saves,0);assert.equal(f.locked,false);
 }
 const f=fixture(),m=await f.controller.open(5),plan=await f.controller.preview(params(m));
 const results=await Promise.allSettled([f.controller.apply(plan),f.controller.apply(plan)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.history.length,10);
});
test('partial failure reports actual writes, refreshes and unlocks; boundary geometry survives',async()=>{
 const f=fixture(),before=f.stateAt(12).points.slice(),m=await f.controller.open(5),plan=await f.controller.preview(params(m));f.fail(5);
 const r=await f.controller.apply(plan);assert.deepEqual(r.appliedFrames,[3,4]);assert.deepEqual(r.boundaryFrames,[2,11]);assert.equal(r.partial,true);assert.match(r.error,/injected/);assert.equal(f.locked,false);assert.equal(f.refreshes,1);
 f.stateAt(12).points.forEach((v,i)=>assert.ok(Math.abs(v-before[i])<1e-8));
});
test('no-op preview does not add unnecessary boundary keys; cancel invalidates plan',async()=>{
 const f=fixture(),m=await f.controller.open(5);for(const s of f.shapes.values())s.points.splice(6,3,4.5,1.8,1.5);
 const n=await f.controller.open(5),plan=await f.controller.preview(params(n));assert.deepEqual(plan.frames,[]);assert.deepEqual(plan.boundaryFrames,[]);
 f.controller.cancel();await assert.rejects(f.controller.apply(plan));assert.equal(f.saves,0);
});
test('a no-op native save is rejected, and a save throwing after commit reports its changed frame',async()=>{
 for(const afterCommit of [false,true]){
  const f=fixture(),get=f.job.annotations.get;f.job.annotations.get=async frame=>{const states=await get(frame);if(frame===3){const save=states[0].save;states[0].save=async function(){if(afterCommit){await save.call(this);throw new Error('after commit');}return this;};}return states;};
  const m=await f.controller.open(5),plan=await f.controller.preview(params(m)),r=await f.controller.apply(plan);
  assert.ok(r.error);assert.deepEqual(r.appliedFrames,afterCommit?[3]:[]);assert.equal(f.shapes.has(4),false);assert.equal(f.locked,false);
 }
});
test('superseded previews cannot replace a newer range plan',async()=>{
 const f=fixture(),m=await f.controller.open(5);let release;const waiting=new Promise(r=>release=r),get=f.job.annotations.get;let once=true;
 f.job.annotations.get=async frame=>{if(frame===3&&once){once=false;await waiting;}return get(frame);};
 const old=f.controller.preview(params(m));await new Promise(r=>setTimeout(r,0));const latest=await f.controller.preview(params(m,{from:7,to:7}));release();await assert.rejects(old,/thay đổi/);
 const r=await f.controller.apply(latest);assert.equal(r.error,null);assert.deepEqual(r.appliedFrames,[7]);
});
