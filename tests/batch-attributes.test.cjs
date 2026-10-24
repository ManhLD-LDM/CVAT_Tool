const {test}=require('node:test'),assert=require('node:assert/strict');
const math=require('../extension/geometry_math.js'),{createBatchSizeController}=require('../extension/batch_size.js');
function fixture(){
 const schema=[{id:1,name:'age',mutable:false,inputType:'select',values:['child','adult'],defaultValue:'adult'},{id:2,name:'pose',mutable:true,inputType:'select',values:['standing','sitting','bending'],defaultValue:'standing'},{id:3,name:'ride_state',mutable:true,inputType:'checkbox',values:['false'],defaultValue:'false'}];
 let track={id:900,clientID:5,label_id:7,attributes:[{spec_id:1,value:'adult'}],shapes:[0,7,14].map(frame=>({frame,type:'cuboid',points:[frame,0,1,0,0,0,4,2,2,0,0,0,0,0,0,0],outside:false,attributes:frame===7?[{spec_id:2,value:'bending'}]:[]}))};
 const history=[],saved=[];let protectedFrame=-1,failFrame=-1,outsideFrame=-1,locked=false;
 function stateAt(frame){
  const keys=track.shapes.slice().sort((a,b)=>a.frame-b.frame),left=keys.filter(s=>s.frame<=frame).at(-1),right=keys.find(s=>s.frame>frame);const points=left.points.map((v,i)=>right?v+(right.points[i]-v)*(frame-left.frame)/(right.frame-left.frame):v);
  const values=Object.fromEntries(schema.map(a=>[a.id,a.defaultValue]));for(const a of track.attributes)values[a.spec_id]=a.value;for(const key of keys.filter(s=>s.frame<=frame))for(const a of key.attributes)values[a.spec_id]=a.value;
  const state={frame,clientID:5,serverID:900,objectType:'track',shapeType:'cuboid',keyframe:keys.some(s=>s.frame===frame),points,attributes:values,lock:frame===protectedFrame,outside:frame===outsideFrame,
   async save(){if(frame===failFrame)throw new Error('native failed');history.push(structuredClone(track));saved.push(frame);
    let key=track.shapes.find(s=>s.frame===frame);const changes=Object.entries(this.attributes).filter(([id,v])=>schema.find(a=>a.id===+id).mutable&&v!==values[id]);
    if(changes.length&&!key){key={frame,type:'cuboid',points:points.slice(),outside:this.outside,attributes:[]};track.shapes.push(key);}
    for(const [id,v] of Object.entries(this.attributes)){const spec=schema.find(a=>a.id===+id),list=spec.mutable?key?.attributes:track.attributes;if(!list||spec.mutable&&!changes.some(([i])=>i===id))continue;const prior=list.find(a=>a.spec_id===+id);if(prior)prior.value=v;else list.push({spec_id:+id,value:v});}
   }};return state;
 }
 const job={startFrame:0,stopFrame:14,labels:[{id:7,name:'pedestrian',attributes:schema}],annotations:{get:async f=>[stateAt(f)],export:async()=>({tracks:[structuredClone(track)]})}},snap={jobId:1224,sessionId:'attrs',frame:3,boxes:[{id:5,objectType:'track',points:stateAt(3).points}]};
 const controller=createBatchSizeController({math,job:()=>job,snapshot:()=>snap,assertEditable(){},lock:v=>locked=v,refresh:async()=>{}});
 return {controller,job,stateAt,saved,history,get track(){return track;},get locked(){return locked;},protect:f=>protectedFrame=f,fail:f=>failFrame=f,outside:f=>outsideFrame=f,undo(){track=history.pop();}};
}
const params=(m,extra={})=>({token:m.token,mode:'attributes',from:3,to:10,attributes:{2:'sitting'},...extra});
test('schema exposes mutable pose/ride_state and immutable age; only selected attributes change and geometry/IDs survive',async()=>{
 const f=fixture(),before=structuredClone(f.track),m=await f.controller.open(5);assert.equal(m.attributes.find(a=>a.name==='age').mutable,false);
 const plan=await f.controller.preview(params(m,{attributes:{2:'sitting',3:'true'}}));assert.deepEqual(plan.boundaryFrames,[11]);assert.equal(f.saved.length,0);
 const result=await f.controller.apply(plan);assert.equal(result.error,null);assert.deepEqual(result.appliedFrames,[3,4,5,6,7,8,9,10]);assert.equal(f.saved.at(-1),11);
 for(let frame=0;frame<=14;frame++){
  const state=f.stateAt(frame);assert.equal(state.attributes[1],'adult');assert.equal(state.attributes[2],frame>=3&&frame<=10?'sitting':frame<7?'standing':'bending');assert.equal(state.attributes[3],frame>=3&&frame<=10?'true':'false');assert.deepEqual(state.points,[frame,0,1,0,0,0,4,2,2,0,0,0,0,0,0,0]);
 }
 assert.equal(f.track.id,900);assert.equal(f.track.clientID,5);while(f.history.length)f.undo();assert.deepEqual(f.track,before);
});
test('existing boundary without explicit attributes is restored, not allowed to inherit changed range value',async()=>{
 const f=fixture(),m=await f.controller.open(5),p=await f.controller.preview(params(m,{from:3,to:6}));assert.deepEqual(p.boundaryFrames,[7]);const r=await f.controller.apply(p);assert.equal(r.error,null);assert.equal(f.stateAt(7).attributes[2],'bending');assert.equal(f.stateAt(14).attributes[2],'bending');
});
test('immutable age requires explicit whole-track confirmation and changes globally without changing pose',async()=>{
 const f=fixture(),m=await f.controller.open(5);await assert.rejects(f.controller.preview(params(m,{attributes:{1:'child'}})),/TOÀN TRACK/);assert.equal(f.saved.length,0);
 const p=await f.controller.preview(params(m,{attributes:{1:'child'},confirmTrackAttributes:true}));assert.deepEqual(p.globalAttributes,['age']);const r=await f.controller.apply(p);assert.equal(r.error,null);assert.equal(r.appliedFrames.length,1);assert.equal(f.stateAt(0).attributes[1],'child');assert.equal(f.stateAt(14).attributes[1],'child');assert.equal(f.stateAt(10).attributes[2],'bending');
});
test('invalid schema values, unknown IDs, no fields, locked boundaries and stale data block writes',async()=>{
 for(const extra of [{attributes:{}},{attributes:{99:'x'}},{attributes:{2:'flying'}},{attributes:{3:'yes'}},{from:12,to:2}]){const f=fixture(),m=await f.controller.open(5);await assert.rejects(f.controller.preview(params(m,extra)));assert.equal(f.saved.length,0);}
 const f=fixture(),m=await f.controller.open(5);f.protect(11);await assert.rejects(f.controller.preview(params(m)),/khóa/);assert.equal(f.saved.length,0);
 const g=fixture(),n=await g.controller.open(5),p=await g.controller.preview(params(n));g.track.attributes[0].value='child';const r=await g.controller.apply(p);assert.ok(r.error);assert.equal(g.saved.length,0);
});
test('partial attribute failure still restores end boundary and releases lock',async()=>{
 const f=fixture(),m=await f.controller.open(5),p=await f.controller.preview(params(m));f.fail(5);const r=await f.controller.apply(p);assert.match(r.error,/native failed/);assert.deepEqual(r.appliedFrames,[3,4,5]);assert.deepEqual(r.boundaryFrames,[11]);assert.equal(f.stateAt(11).attributes[2],'bending');assert.equal(f.locked,false);
});
test('no-op changes do not write and outside frames are explicitly skipped',async()=>{
 const f=fixture(),m=await f.controller.open(5),p=await f.controller.preview(params(m,{from:0,to:3,attributes:{3:'false'}}));assert.deepEqual(p.frames,[]);assert.deepEqual(p.boundaryFrames,[]);
 const g=fixture();g.outside(4);const n=await g.controller.open(5),q=await g.controller.preview(params(n));assert.ok(q.skipped.includes(4));
});


test('numeric and text attributes use the same schema-driven path with range and step checks',async()=>{
 const f=fixture();f.job.labels[0].attributes.push({id:4,name:'score',mutable:true,inputType:'number',values:['0','10','0.5'],defaultValue:'0'},{id:5,name:'note',mutable:true,inputType:'text',values:[],defaultValue:''});
 const m=await f.controller.open(5);
 for(const value of ['NaN','11','0.3',''])await assert.rejects(f.controller.preview(params(m,{attributes:{4:value}})),/quy chuẩn/);
 const p=await f.controller.preview(params(m,{attributes:{4:'2.5',5:'reviewed'}})),r=await f.controller.apply(p);assert.equal(r.error,null);assert.equal(f.stateAt(5).attributes[4],'2.5');assert.equal(f.stateAt(5).attributes[5],'reviewed');assert.equal(f.stateAt(11).attributes[4],'0');assert.equal(f.stateAt(11).attributes[5],'');
});
