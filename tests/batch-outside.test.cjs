const {test}=require('node:test'),assert=require('node:assert/strict');
const math=require('../extension/geometry_math.js'),{createBatchSizeController}=require('../extension/batch_size.js');
function fixture(){
 let track={id:900,clientID:31,label_id:7,attributes:[{spec_id:1,value:'adult'}],shapes:[0,7,14].map(frame=>({frame,type:'cuboid',points:[frame,frame/2,1,0,0,.03*frame,4,2,2,0,0,0,0,0,0,0],outside:frame===7,attributes:[],occluded:frame===7}))};
 const saved=[],history=[];let protect=-1,fail=-1,noOp=false,locked=false;
 function stateAt(frame){
  const keys=track.shapes.slice().sort((a,b)=>a.frame-b.frame),left=keys.filter(s=>s.frame<=frame).at(-1),right=keys.find(s=>s.frame>frame),p=left.points.map((v,i)=>right&&!left.outside?v+(right.points[i]-v)*(frame-left.frame)/(right.frame-left.frame):v);
  const state={frame,clientID:31,serverID:900,objectType:'track',shapeType:'cuboid',points:p,outside:left.outside,keyframe:keys.some(s=>s.frame===frame),lock:frame===protect,attributes:{1:'adult'},
   async save(){if(frame===fail)throw new Error('native failed');if(noOp)return;history.push(structuredClone(track));saved.push(frame);let key=track.shapes.find(s=>s.frame===frame);if(!key){key={...structuredClone(left),frame};track.shapes.push(key);}key.points=this.points.slice();key.outside=this.outside;}};return state;
 }
 const job={startFrame:0,stopFrame:14,labels:[],annotations:{get:async(frame,all)=>{assert.equal(all,true);return [stateAt(frame)];},export:async()=>({tracks:[structuredClone(track)]})}},snap={jobId:1224,sessionId:'outside',frame:0,boxes:[{id:31,objectType:'track',points:stateAt(0).points}]};
 const controller=createBatchSizeController({math,job:()=>job,snapshot:()=>snap,assertEditable(){},lock:v=>locked=v,refresh:async()=>{}});
 return {controller,stateAt,saved,history,get track(){return track;},get locked(){return locked;},protect:f=>protect=f,fail:f=>fail=f,noOp:()=>noOp=true,undo(){track=history.pop();}};
}
const args=(m,extra={})=>({token:m.token,mode:'outside',from:3,to:10,outside:true,...extra});
test('outside true/false edits range including existing outside frames while retaining geometry, IDs, attributes and external visibility',async()=>{
 for(const outside of [true,false]){
  const f=fixture(),before=structuredClone(f.track),states=Array.from({length:15},(_,i)=>structuredClone({points:f.stateAt(i).points,outside:f.stateAt(i).outside})),m=await f.controller.open(31),p=await f.controller.preview(args(m,{outside}));
  assert.deepEqual(p.frames,[3,4,5,6,7,8,9,10]);assert.deepEqual(p.boundaryFrames,[2,11]);assert.deepEqual(p.skipped,[]);assert.equal(f.saved.length,0);
  const r=await f.controller.apply(p);assert.equal(r.error,null);assert.deepEqual(f.saved.slice(0,2),[2,11]);assert.equal(f.track.id,900);assert.equal(f.track.clientID,31);assert.deepEqual(f.track.attributes,before.attributes);
  for(let frame=0;frame<=14;frame++){const state=f.stateAt(frame);assert.equal(state.outside,frame>=3&&frame<=10?outside:states[frame].outside,'visibility '+frame);state.points.forEach((v,i)=>assert.ok(Math.abs(v-states[frame].points[i])<1e-6,'geometry '+frame));}
  while(f.history.length)f.undo();assert.deepEqual(f.track,before);
 }
});
test('whole-job visibility and single-frame outside edits handle job edges',async()=>{
 for(const range of [{from:0,to:14},{from:0,to:0},{from:14,to:14}]){
  const f=fixture(),m=await f.controller.open(31),p=await f.controller.preview(args(m,{...range,outside:true})),r=await f.controller.apply(p);assert.equal(r.error,null);for(let frame=range.from;frame<=range.to;frame++)assert.equal(f.stateAt(frame).outside,true);
  assert.ok(p.boundaryFrames.every(frame=>frame>=0&&frame<=14));
 }
});
test('unchanged outside preview adds no keys; invalid boolean/range/locked boundaries/stale data stop before mutation',async()=>{
 const f=fixture(),m=await f.controller.open(31),p=await f.controller.preview(args(m,{from:8,to:10}));assert.deepEqual(p.frames,[]);assert.deepEqual(p.boundaryFrames,[]);
 for(const extra of [{outside:'false'},{outside:0},{from:-1},{to:100},{from:9,to:3}])await assert.rejects(f.controller.preview(args(m,extra)));assert.equal(f.saved.length,0);
 for(const frame of [2,5,11]){const g=fixture(),n=await g.controller.open(31);g.protect(frame);await assert.rejects(g.controller.preview(args(n)));assert.equal(g.saved.length,0);}
 const g=fixture(),n=await g.controller.open(31),q=await g.controller.preview(args(n));g.track.shapes[0].outside=true;const r=await g.controller.apply(q);assert.ok(r.error);assert.equal(g.saved.length,0);
});
test('native failure/no-op is reported without deleting tracks and with prewritten boundaries retained',async()=>{
 const f=fixture(),m=await f.controller.open(31),p=await f.controller.preview(args(m));f.fail(5);const r=await f.controller.apply(p);assert.ok(r.error);assert.equal(r.partial,true);assert.deepEqual(r.boundaryFrames,[2,11]);assert.equal(f.stateAt(11).outside,true);assert.equal(f.stateAt(14).outside,false);assert.equal(f.locked,false);
 const g=fixture(),n=await g.controller.open(31),q=await g.controller.preview(args(n));g.noOp();const result=await g.controller.apply(q);assert.ok(result.error);assert.equal(g.locked,false);
});
