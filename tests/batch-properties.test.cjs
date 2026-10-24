const {test}=require('node:test'),assert=require('node:assert/strict');
const math=require('../extension/geometry_math.js'),{createBatchSizeController}=require('../extension/batch_size.js');
function fixture(){
 let track={id:900,clientID:31,label_id:7,attributes:[],shapes:[0,3,7,14].map(frame=>({frame,type:'cuboid',points:[frame,0,1,0,0,0,4,2,2,0,0,0,0,0,0,0],outside:frame===7,occluded:frame===7,attributes:[]}))},globals={lock:false,hidden:false,pinned:true};
 const history=[],saved=[];let locked=false;
 function stateAt(frame){
  const keys=track.shapes.slice().sort((a,b)=>a.frame-b.frame),left=keys.filter(s=>s.frame<=frame).at(-1),right=keys.find(s=>s.frame>frame),points=left.points.map((v,i)=>right&&!left.outside?v+(right.points[i]-v)*(frame-left.frame)/(right.frame-left.frame):v),flags=new Set(),values={...globals,points,outside:!!left.outside,occluded:!!left.occluded,keyframe:keys.some(s=>s.frame===frame)};
  const state={frame,clientID:31,serverID:900,objectType:'track',shapeType:'cuboid',attributes:{},
   async save(){if(globals.lock&&this.lock)return;history.push({track:structuredClone(track),globals:{...globals}});saved.push(frame);
    for(const prop of ['lock','hidden','pinned'])if(flags.has(prop))globals[prop]=this[prop];
    if(flags.has('keyframe')&&!this.keyframe){track.shapes=track.shapes.filter(s=>s.frame!==frame);return;}
    if(['points','outside','occluded','keyframe'].some(k=>flags.has(k))){let shape=track.shapes.find(s=>s.frame===frame);if(!shape){shape={...structuredClone(left),frame};track.shapes.push(shape);}shape.points=this.points.slice();shape.outside=this.outside;shape.occluded=this.occluded;}
   }};
  for(const name of Object.keys(values))Object.defineProperty(state,name,{get:()=>values[name],set:value=>{values[name]=value;flags.add(name);},enumerable:true});return state;
 }
 const job={startFrame:0,stopFrame:14,labels:[],annotations:{get:async f=>[stateAt(f)],export:async()=>({tracks:[structuredClone(track)]})}},snap={jobId:1224,sessionId:'property',frame:0,boxes:[{id:31,objectType:'track',points:stateAt(0).points}]};
 const controller=createBatchSizeController({math,job:()=>job,snapshot:()=>snap,assertEditable(){},lock:v=>locked=v,refresh:async()=>{}});
 return {controller,stateAt,job,globals,saved,history,get track(){return track;},get locked(){return locked;},undo(){const h=history.pop();track=h.track;globals=h.globals;}};
}
const params=(m,extra={})=>({token:m.token,mode:'property',property:'occluded',value:true,from:3,to:10,...extra});
test('occluded true/false affects only requested range, preserves outside and geometry',async()=>{
 for(const value of [true,false]){
  const f=fixture(),before=Array.from({length:15},(_,i)=>({points:f.stateAt(i).points,outside:f.stateAt(i).outside,occluded:f.stateAt(i).occluded})),m=await f.controller.open(31),p=await f.controller.preview(params(m,{value})),r=await f.controller.apply(p);assert.equal(r.error,null);
  for(let frame=0;frame<=14;frame++){const state=f.stateAt(frame);assert.equal(state.occluded,frame>=3&&frame<=10?value:before[frame].occluded);assert.deepEqual(state.points,before[frame].points);assert.equal(state.outside,before[frame].outside);}
  assert.equal(f.track.id,900);assert.equal(f.track.clientID,31);
 }
});
test('lock/hidden/pinned require whole-track acknowledgement, work in both directions and remain editor-only',async()=>{
 for(const property of ['lock','hidden','pinned'])for(const value of [true,false]){
  const f=fixture();f.globals[property]=!value;const original=structuredClone(f.track),m=await f.controller.open(31);await assert.rejects(f.controller.preview(params(m,{property,value})),/TOÀN TRACK/);
  const p=await f.controller.preview(params(m,{property,value,confirmGlobal:true})),r=await f.controller.apply(p);assert.equal(r.error,null);assert.equal(r.editorOnly,true);assert.equal(r.saveRequired,false);assert.equal(f.stateAt(0)[property],value);assert.equal(f.stateAt(14)[property],value);assert.deepEqual(f.track,original);assert.equal(f.saved.length,1);assert.equal(f.locked,false);
  f.undo();assert.equal(f.stateAt(0)[property],!value);
 }
});
test('property preview detects editor-only state changes and locked geometry edits stay blocked',async()=>{
 const f=fixture(),m=await f.controller.open(31),p=await f.controller.preview(params(m,{property:'hidden',confirmGlobal:true}));f.globals.hidden=true;const r=await f.controller.apply(p);assert.ok(r.error);assert.equal(f.saved.length,0);
 const g=fixture();g.globals.lock=true;const n=await g.controller.open(31);await assert.rejects(g.controller.preview(params(n)),/khóa/);assert.equal(g.saved.length,0);
});
test('keyframe bake creates every selected key; removal retains first, outside and transition keys',async()=>{
 const f=fixture(),m=await f.controller.open(31),p=await f.controller.preview(params(m,{property:'keyframe',from:1,to:6})),r=await f.controller.apply(p);assert.equal(r.error,null);for(let frame=1;frame<=6;frame++)assert.equal(f.stateAt(frame).keyframe,true);
 const g=fixture(),n=await g.controller.open(31),q=await g.controller.preview(params(n,{property:'keyframe',value:false,from:0,to:14}));assert.deepEqual(q.skipped,[0,7,14]);const result=await g.controller.apply(q);assert.equal(result.error,null);assert.deepEqual(g.track.shapes.map(s=>s.frame).sort((a,b)=>a-b),[0,7,14]);
});
test('keyframe removal protects attribute anchors and rejects invalid properties',async()=>{
 const f=fixture();f.track.shapes.find(s=>s.frame===3).attributes=[{spec_id:99,value:'anchor'}];const m=await f.controller.open(31),p=await f.controller.preview(params(m,{property:'keyframe',value:false,from:3,to:3}));assert.deepEqual(p.skipped,[3]);assert.deepEqual(p.frames,[]);
 for(const extra of [{property:'delete'},{value:'true'}])await assert.rejects(f.controller.preview(params(m,extra)));
});
