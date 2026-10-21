const {test}=require('node:test'),assert=require('node:assert/strict');
const {createAnnotationIO}=require('../extension/annotation_io.js'),math=require('../extension/geometry_math.js');
const copy=x=>structuredClone(x),points=x=>[x,0,1,0,0,0,4,2,2,0,0,0,0,0,0,0];
// Offline linear-cuboid oracle. Native Track.getPosition uses the first shape as
// outside before its first keyframe; the creation-time Track.frame is not a gate.
function sampleTrack(track,frame){
 const keys=track.shapes.slice().sort((a,b)=>a.frame-b.frame),left=keys.filter(s=>s.frame<=frame).at(-1),right=keys.find(s=>s.frame>frame);
 if(!left)return {...copy(keys[0]),outside:true};
 if(!right||left.frame===frame)return copy(left);
 const t=(frame-left.frame)/(right.frame-left.frame);
 return {...copy(left),points:left.points.map((v,i)=>v+(right.points[i]-v)*t)};
}
function fixture(initial=null,schema=null,origin='https://cvat.test'){
 const labels=schema||[{id:7,name:'vehicles',attributes:[]}];let data=initial||{tracks:[38,63,79].map((clientID,i)=>({clientID,id:48950+i,label_id:7,frame:0,group:0,attributes:[],shapes:[0,7,14].map(frame=>({id:100000+clientID*100+frame,type:'cuboid',frame,points:points(clientID+frame),outside:false,occluded:false,z_order:0,rotation:0,attributes:[]}))})),shapes:[],tags:[],intervals:[]};
 const history=[],commits=[];let locked=false,saveFail=null;
 const job={startFrame:0,stopFrame:59,labels,annotations:{export:async()=>copy(data),get:async frame=>{
  const states=[];
  for(const kind of ['tracks','shapes'])for(const obj of data[kind]){
   if(kind==='shapes'&&obj.frame!==frame)continue;
   const shape=kind==='tracks'?sampleTrack(obj,frame):obj;
   const state={clientID:obj.clientID,serverID:obj.id,objectType:kind==='tracks'?'track':'shape',shapeType:'cuboid',frame,label:labels.find(l=>l.id===obj.label_id),points:shape.points.slice(),keyframe:kind==='tracks'&&obj.shapes.some(x=>x.frame===frame),outside:shape.outside,lock:!!obj.lock,attributes:{},
    async save(){if(saveFail===frame)throw new Error('injected native failure');history.push(copy(data));
     if(kind==='tracks'){
      if(this.keyframe===false)obj.shapes=obj.shapes.filter(x=>x.frame!==frame);
      else{const saved={...shape,frame,points:this.points.slice(),outside:this.outside,occluded:this.occluded,z_order:this.zOrder,rotation:this.rotation,attributes:Object.entries(this.attributes).filter(([id])=>this.label.attributes.some(a=>a.id===+id&&a.mutable)).map(([spec_id,value])=>({spec_id:+spec_id,value}))};const index=obj.shapes.findIndex(x=>x.frame===frame);if(index<0){delete saved.id;obj.shapes.push(saved);}else obj.shapes[index]=saved;obj.shapes.sort((a,b)=>a.frame-b.frame);}
     }else Object.assign(obj,{points:this.points.slice(),outside:this.outside,occluded:this.occluded,z_order:this.zOrder,rotation:this.rotation});obj.label_id=this.label.id;obj.attributes=Object.entries(this.attributes).filter(([id])=>kind==='shapes'||this.label.attributes.some(a=>a.id===+id&&!a.mutable)).map(([spec_id,value])=>({spec_id:+spec_id,value}));return this;}};
   states.push(state);
  }return states;
 },group:async(states,reset)=>{history.push(copy(data));const assigned=reset?0:1+Math.max(0,...data.tracks.map(t=>t.group||0));for(const state of states){const item=[...data.tracks,...data.shapes].find(t=>t.clientID===state.clientID);item.group=assigned;}return assigned;},commit:async(add,remove)=>{history.push(copy(data));commits.push({add:copy(add),remove:copy(remove)});let next=Math.max(79,...data.tracks.map(x=>x.clientID));
  for(const kind of ['tracks','shapes']){data[kind]=data[kind].filter(x=>!(remove[kind]||[]).some(y=>y.clientID===x.clientID));for(const item of add[kind]||[])data[kind].push({...copy(item),clientID:++next});}}}};
 const snapshot={connected:true,sessionId:'fixture',jobId:1224,frame:0};
 const io=createAnnotationIO({math,job:()=>job,snapshot:()=>snapshot,origin:()=>origin,assertEditable(){},lock:v=>locked=v,refresh:async()=>{}});
 return {io,job,snapshot,commits,history,get data(){return data;},get locked(){return locked;},undo(){data=history.pop();},failAt:f=>saveFail=f};
}
test('export includes exact native display and database IDs, including unsaved objects',async()=>{
 const f=fixture();delete f.data.tracks[2].id;
 const result=await f.io.exported({jobId:1224});assert.deepEqual(result.data.tracks.map(x=>x.clientID),[38,63,79]);assert.equal(result.data.tracks[0].id,48950);assert.equal(result.data.c3d.source,'native-editor-including-unsaved');assert.equal(result.data.tracks[2].id,undefined);
});

test('editor export is versioned and refuses a collection missing real display IDs',async()=>{
 const f=fixture(),file=(await f.io.exported()).data;assert.equal(file.c3d.toolVersion,'1.17.5');assert.ok(file.c3d.exportedAt);
 delete f.data.tracks[0].clientID;await assert.rejects(f.io.exported(),/display IDs/);
});

test('legacy add, merge and delete-all requests are rejected without native mutations',async()=>{
 for(const mode of ['append','merge']){
  const f=fixture();await assert.rejects(f.io.preview({mode,payload:copy(f.data)}),/Only edit/);assert.equal(f.history.length,0);assert.equal(f.commits.length,0);
 }
 for(const scope of ['merge','all']){
  const f=fixture(),before=copy(f.data),p=await f.io.preview({payload:copy(f.data)});
  await assert.rejects(f.io.apply({token:p.token,keys:['tracks:0'],scope}),/Only edit/);assert.deepEqual(f.data,before);assert.equal(f.history.length,0);assert.equal(f.commits.length,0);
 }
});

test('foreign job metadata in a wrapped raw export is not discarded during import',async()=>{
 const f=fixture(),file={jobId:1264,origin:'https://cvat.test',annotations:copy(f.data)};
 await assert.rejects(f.io.preview({payload:file}),/another job/);assert.equal(f.history.length,0);
 file.jobId=1224;assert.equal((await f.io.preview({payload:file})).rows[0].matched,true);
});

test('supplied raw job1264 file requires explicit display-ID mapping even when database IDs exist',{skip:!process.env.CVAT_IO_CASE},async()=>{
 const fs=require('node:fs'),bytes=fs.readFileSync(process.env.CVAT_IO_CASE),file=JSON.parse(bytes);
 assert.equal(file.tracks.length,80);assert.equal(file.tracks[0].id,70115);assert.equal(file.tracks.some(t=>t.clientID!=null),false);assert.equal(file.c3d,undefined);
 const labels=[...new Set(file.tracks.map(t=>t.label_id))].map(id=>{
  const tracks=file.tracks.filter(t=>t.label_id===id),specs=new Map();
  for(const t of tracks){for(const a of t.attributes||[])specs.set(a.spec_id,{id:a.spec_id,name:'attr-'+a.spec_id,mutable:false,defaultValue:a.value});for(const s of t.shapes)for(const a of s.attributes||[])specs.set(a.spec_id,{id:a.spec_id,name:'attr-'+a.spec_id,mutable:true,defaultValue:a.value});}
  return {id,name:'label-'+id,attributes:[...specs.values()]};
 });
 // Display IDs below are model identities for replay, not evidence of a live editor mapping.
 const current=copy(file);current.tracks.forEach((t,i)=>t.clientID=i+1);
 const f=fixture(current,labels),p=await f.io.preview({payload:file});assert.equal(p.rows.filter(r=>r.matched).length,0);
 const r=await f.io.apply({token:p.token,keys:[p.rows[0].key],mapping:{'tracks:0':1}});assert.equal(r.error,null);assert.deepEqual(r.changed,[1]);assert.equal(f.data.tracks[0].id,70115);assert.equal(f.commits.length,0);
 const other=copy(current);other.tracks.forEach(t=>t.id+=100000);const g=fixture(other,labels),q=await g.io.preview({payload:file});assert.equal(q.rows.filter(r=>r.matched).length,0);assert.equal(g.history.length,0);
 assert.deepEqual(fs.readFileSync(process.env.CVAT_IO_CASE),bytes);
});

test('owner JSON old/new tracks 48950 and 48975 replace every keyframe while retaining native #38/#63',{skip:!process.env.CVAT_IO_OLD||!process.env.CVAT_IO_NEW},async()=>{
 const fs=require('node:fs'),oldBytes=fs.readFileSync(process.env.CVAT_IO_OLD),newBytes=fs.readFileSync(process.env.CVAT_IO_NEW);
 const old=JSON.parse(oldBytes),incoming=JSON.parse(newBytes),labels=[];
 for(const id of new Set(incoming.tracks.map(t=>t.label_id))){
  const specs=new Map();for(const t of incoming.tracks.filter(t=>t.label_id===id)){
   for(const a of t.attributes||[])specs.set(a.spec_id,{id:a.spec_id,name:'attr-'+a.spec_id,mutable:false,default_value:''});
   for(const sh of t.shapes)for(const a of sh.attributes||[])specs.set(a.spec_id,{id:a.spec_id,name:'attr-'+a.spec_id,mutable:true,default_value:''});
  }labels.push({id,name:'label-'+id,attributes:[...specs.values()]});
 }
 old.tracks.forEach((t,i)=>t.clientID=i+1);const f=fixture(copy(old),labels),before=copy(f.data);
 const file={tracks:incoming.tracks.filter(t=>[48950,48975].includes(t.id)),shapes:[]};
 const p=await f.io.preview({payload:file});assert.ok(p.rows.every(r=>!r.matched));
 const mapping=Object.fromEntries(p.rows.map(r=>[r.key,before.tracks.find(t=>t.id===r.sourceServerId).clientID])); // Explicit replay mapping, not automatic application policy.
 const result=await f.io.apply({token:p.token,keys:p.rows.map(r=>r.key),mapping});assert.equal(result.error,null);
 for(const target of file.tracks){const actual=f.data.tracks.find(t=>t.id===target.id);
  assert.equal(actual.clientID,target.id===48950?38:63);assert.equal(actual.shapes.length,target.shapes.length);
  for(const shape of target.shapes){const applied=actual.shapes.find(s=>s.frame===shape.frame);assert.deepEqual(applied.points,shape.points);assert.equal(applied.outside,shape.outside);}
 }
 for(const t of before.tracks.filter(t=>![48950,48975].includes(t.id)))assert.deepEqual(f.data.tracks.find(x=>x.id===t.id),t);
 assert.deepEqual(fs.readFileSync(process.env.CVAT_IO_OLD),oldBytes);assert.deepEqual(fs.readFileSync(process.env.CVAT_IO_NEW),newBytes);
});
test('selected Replace preserves #38/#63 identities and replaces the complete keyframe sets without touching #79',async()=>{
 const f=fixture(),before=copy(f.data),data=(await f.io.exported()).data;data.tracks=data.tracks.slice(0,2);
 for(const t of data.tracks){t.shapes=t.shapes.filter(s=>s.frame!==7);t.shapes[1].points=points(100);t.shapes.push({...copy(t.shapes[0]),frame:29,points:points(200),outside:true});}
 const plan=await f.io.preview({jobId:1224,mode:'replace',payload:data});assert.deepEqual(plan.rows.map(x=>x.targetClientId),[38,63]);
 const result=await f.io.apply({token:plan.token,keys:plan.rows.map(r=>r.key),scope:'selected'});
 assert.equal(result.error,null);assert.deepEqual(result.changed,[38,63]);assert.deepEqual(result.added,[]);assert.deepEqual(f.data.tracks[2],before.tracks[2]);assert.equal(f.commits.length,0);
 for(const t of f.data.tracks.slice(0,2)){assert.deepEqual(t.shapes.map(s=>s.frame),[0,14,29]);assert.equal(t.shapes[2].outside,true);assert.equal(t.shapes[1].points[0],100);}
 assert.deepEqual(f.data.tracks.map(t=>[t.clientID,t.id]),before.tracks.map(t=>[t.clientID,t.id]));
 while(f.history.length)f.undo();assert.deepEqual(f.data,before);
});
test('raw legacy JSON never substitutes database ID or array order for missing clientID',async()=>{
 const f=fixture(),data=copy(f.data);delete data.c3d;for(const t of data.tracks)delete t.clientID;
 data.tracks.reverse();const p=await f.io.preview({payload:data});assert.deepEqual(p.rows.map(x=>x.targetClientId),[null,null,null]);
 await assert.rejects(f.io.apply({token:p.token,keys:[p.rows[0].key]}),/not found/);assert.equal(f.history.length,0);
});
test('unknown IDs, foreign job, duplicate IDs and stale previews fail before writes',async()=>{
 for(const scenario of ['unknown','foreign','duplicate','stale','scope']){
  const f=fixture(),data=(await f.io.exported()).data;
  if(scenario==='unknown'){data.tracks[0].id=123456;delete data.tracks[0].clientID;}
  if(scenario==='foreign')data.c3d.jobId=9;
  if(scenario==='duplicate')data.tracks.push(copy(data.tracks[0]));
  if(['foreign','duplicate'].includes(scenario))await assert.rejects(f.io.preview({payload:data}));
  else{const p=await f.io.preview({payload:data});if(scenario==='stale')f.data.tracks[0].shapes[0].points[0]+=.2;
   await assert.rejects(f.io.apply({token:p.token,keys:[p.rows[0].key],scope:scenario==='scope'?'all':'selected'}));}
  assert.equal(f.history.length,0);
 }
});
test('invalid geometry and protected targets stop before any edit',async()=>{
 for(const scenario of ['geometry','lock']){
  const f=fixture(),data=(await f.io.exported()).data;
  if(scenario==='geometry')data.tracks[0].shapes[0].points[6]=-1;
  if(scenario==='lock')f.data.tracks[0].lock=true;
  if(scenario==='geometry')await assert.rejects(f.io.preview({payload:data}));
  else {const p=await f.io.preview({payload:data});await assert.rejects(f.io.apply({token:p.token,keys:[p.rows[0].key]}));}
  assert.equal(f.history.length,0);
 }
});

test('standalone cuboid Replace keeps its native display/database ID and leaves tracks untouched',async()=>{
 const f=fixture();f.data.shapes.push({clientID:91,id:80001,type:'cuboid',frame:0,label_id:7,points:points(1),group:0,attributes:[]});
 const before=copy(f.data.tracks),file={tracks:[],shapes:[{...copy(f.data.shapes[0]),points:points(7)}]};
 const p=await f.io.preview({payload:file});const result=await f.io.apply({token:p.token,keys:[p.rows[0].key]});
 assert.equal(result.error,null);assert.equal(f.data.shapes[0].id,80001);assert.equal(f.data.shapes[0].clientID,91);assert.equal(f.data.shapes[0].points[0],7);assert.deepEqual(f.data.tracks,before);
});

test('Replace follows #clientID even when the source database ID belongs to a different current object',async()=>{
 const f=fixture(),file=(await f.io.exported()).data,before=copy(f.data);
 file.tracks=file.tracks.slice(0,1);file.tracks[0].id=f.data.tracks[1].id;file.tracks[0].shapes[0].points[0]=333;
 const p=await f.io.preview({payload:file});assert.equal(p.rows[0].targetClientId,38);assert.equal(p.rows[0].dbDiffers,true);
 const r=await f.io.apply({token:p.token,keys:['tracks:0']});assert.equal(r.error,null);assert.deepEqual(r.changed,[38]);assert.equal(f.data.tracks[0].id,before.tracks[0].id);assert.equal(f.data.tracks[0].points,undefined);assert.equal(f.data.tracks[0].shapes[0].points[0],333);assert.deepEqual(f.data.tracks[1],before.tracks[1]);assert.equal(f.commits.length,0);
});

test('legacy file with changed database IDs can explicitly map source tracks to current display IDs without recreation',async()=>{
 const f=fixture(),file=copy(f.data),before=copy(f.data);file.tracks=file.tracks.slice(0,1);file.tracks[0].id=70115;delete file.tracks[0].clientID;
 file.tracks[0].shapes[0].points[0]=123;
 const p=await f.io.preview({payload:file});assert.equal(p.rows[0].matched,false);assert.deepEqual(p.targets.map(t=>t.clientID),[38,63,79]);
 const r=await f.io.apply({token:p.token,keys:['tracks:0'],mapping:{'tracks:0':63}});
 assert.equal(r.error,null);assert.deepEqual(r.changed,[63]);assert.equal(f.data.tracks[1].id,before.tracks[1].id);assert.equal(f.data.tracks[1].clientID,63);assert.equal(f.data.tracks[1].shapes[0].points[0],123);
 assert.deepEqual(f.data.tracks[0],before.tracks[0]);assert.deepEqual(f.data.tracks[2],before.tracks[2]);assert.equal(f.commits.length,0);
});

test('explicit mapping rejects duplicate, missing, wrong-kind and unselected targets before any edit',async()=>{
 for(const mapping of [{'tracks:0':63,'tracks:1':63},{'tracks:0':999},{'tracks:0':'63'},{'tracks:9':63}]){
  const f=fixture(),file=copy(f.data);for(const t of file.tracks){t.id+=30000;delete t.clientID;}
  const p=await f.io.preview({payload:file});await assert.rejects(f.io.apply({token:p.token,keys:['tracks:0','tracks:1'],mapping}));assert.equal(f.history.length,0);
 }
 const f=fixture(),file=copy(f.data);f.data.shapes.push({clientID:91,id:80001,type:'cuboid',frame:0,label_id:7,points:points(1),group:0,attributes:[]});
 const p=await f.io.preview({payload:file});await assert.rejects(f.io.apply({token:p.token,keys:['tracks:0'],mapping:{'tracks:0':91}}),/not found/);assert.equal(f.history.length,0);
});

test('explicit mapping still enforces stale preview and protected target',async()=>{
 for(const scenario of ['stale','locked']){
  const f=fixture(),file=copy(f.data);file.tracks[0].id=70115;delete file.tracks[0].clientID;
  if(scenario==='locked')f.data.tracks[1].lock=true;
  const p=await f.io.preview({payload:file});if(scenario==='stale')f.data.tracks[1].shapes[0].points[0]++;
  await assert.rejects(f.io.apply({token:p.token,keys:['tracks:0'],mapping:{'tracks:0':63}}));assert.equal(f.history.length,0);
 }
});

test('same-job clientID matching does not depend on database IDs or editor session identity',async()=>{
 const f=fixture();delete f.data.tracks[0].id;const file=(await f.io.exported()).data;
 let p=await f.io.preview({payload:file});assert.equal(p.rows[0].matched,true);
 file.c3d.sessionId='a-previous-editor';p=await f.io.preview({payload:file});assert.equal(p.rows[0].matched,true);
 const r=await f.io.apply({token:p.token,keys:[p.rows[0].key]});assert.equal(r.error,null);assert.deepEqual(r.changed,[38]);assert.equal(f.commits.length,0);
});

test('a missing source #clientID never falls back to a matching database ID',async()=>{
 const f=fixture(),file=(await f.io.exported()).data;file.tracks[0].clientID=999;
 const p=await f.io.preview({payload:file});assert.equal(p.rows[0].matched,false);
 await assert.rejects(f.io.apply({token:p.token,keys:['tracks:0']}),/not found/);assert.equal(f.history.length,0);assert.equal(f.commits.length,0);
});

test('fresh live editor export retains #38 on a model target with different database IDs',{skip:!process.env.CVAT_IO_EDITOR_CASE},async()=>{
 const fs=require('node:fs'),bytes=fs.readFileSync(process.env.CVAT_IO_EDITOR_CASE),file=JSON.parse(bytes),current=copy(file);
 assert.equal(file.c3d.jobId,1224);assert.equal(file.tracks.length,79);assert.ok(file.tracks.every(t=>Number.isInteger(t.clientID)));
 // Model a different database allocation while keeping the user-requested #IDs.
 current.tracks.forEach(t=>t.id+=100000);const f=fixture(current,file.labels_manifest,file.c3d.origin),before=copy(f.data);
 const p=await f.io.preview({payload:file});assert.equal(p.rows.filter(r=>r.matched).length,79);assert.ok(p.rows.every(r=>r.dbDiffers));
 const row=p.rows.find(r=>r.sourceClientId===38),r=await f.io.apply({token:p.token,keys:[row.key]});assert.equal(r.error,null);assert.deepEqual(r.changed,[38]);assert.deepEqual(r.added,[]);assert.deepEqual(r.removed,[]);assert.equal(f.commits.length,0);
 const actual=f.data.tracks.find(t=>t.clientID===38);assert.equal(actual.id,148950);assert.equal(actual.clientID,38);
 for(const t of before.tracks.filter(t=>t.clientID!==38))assert.deepEqual(f.data.tracks.find(x=>x.clientID===t.clientID),t);
 assert.deepEqual(fs.readFileSync(process.env.CVAT_IO_EDITOR_CASE),bytes);
});

test('unknown labels and attributes fail explicitly, without guessing a class or dropping attributes',async()=>{
 const f=fixture(),file=(await f.io.exported()).data;
 file.tracks[0].label_id=99;await assert.rejects(f.io.preview({payload:file}),/label/);file.tracks[0].label_id=7;
 file.tracks[0].attributes=[{spec_id:123,value:'car'}];await assert.rejects(f.io.preview({payload:file}),/attribute/);assert.equal(f.history.length,0);
});

test('source grouping is rebuilt only among selected IDs; unselected members are preserved',async()=>{
 const f=fixture(),file=(await f.io.exported()).data;file.tracks[0].group=5;file.tracks[1].group=5;
 const before=copy(f.data.tracks[2]),p=await f.io.preview({payload:file});const r=await f.io.apply({token:p.token,keys:p.rows.slice(0,2).map(x=>x.key)});
 assert.equal(r.error,null);assert.equal(f.data.tracks[0].group,f.data.tracks[1].group);assert.ok(f.data.tracks[0].group>0);assert.deepEqual(f.data.tracks[2],before);
});

test('Replace copies immutable attributes, inherits mutable keyframe values and resets stale schema fields',async()=>{
 const f=fixture(),label=f.job.labels[0];label.attributes=[{id:1,name:'subtype',mutable:false,default_value:'car'},{id:2,name:'pose',mutable:true,default_value:'standing'}];
 const file=(await f.io.exported()).data;file.tracks=file.tracks.slice(0,1);file.tracks[0].attributes=[{spec_id:1,value:'SUV'}];file.tracks[0].shapes[0].attributes=[{spec_id:2,value:'sitting'}];
 const p=await f.io.preview({payload:file});const result=await f.io.apply({token:p.token,keys:[p.rows[0].key]});
 assert.equal(result.error,null);assert.deepEqual(f.data.tracks[0].attributes,[{spec_id:1,value:'SUV'}]);
 for(const shape of f.data.tracks[0].shapes)assert.deepEqual(shape.attributes,[{spec_id:2,value:'sitting'}]);
});
test('partial native failure releases lock, reports changed IDs and never deletes unrelated IDs',async()=>{
 const f=fixture(),data=(await f.io.exported()).data;data.tracks=data.tracks.slice(0,2);f.failAt(7);
 const p=await f.io.preview({payload:data});const result=await f.io.apply({token:p.token,keys:p.rows.map(r=>r.key)});
 assert.match(result.error,/injected/);assert.deepEqual(result.changed,[38]);assert.deepEqual(result.removed,[]);assert.equal(f.data.tracks.length,3);assert.equal(f.locked,false);
 await assert.rejects(f.io.apply({token:p.token,keys:[p.rows[0].key]}),/expired/);
});

test('concurrent Apply consumes the preview exactly once',async()=>{
 const f=fixture(),data=(await f.io.exported()).data,p=await f.io.preview({payload:data});
 const results=await Promise.allSettled([f.io.apply({token:p.token,keys:[p.rows[0].key]}),f.io.apply({token:p.token,keys:[p.rows[0].key]})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.history.length,3);assert.equal(f.locked,false);
});


test('full-job template edits earlier and later starts, sparse interpolation and visibility without recreating IDs',async()=>{
 for(const [oldStart,newStart] of [[0,8],[8,0]]){
  const f=fixture();const target=f.data.tracks[0];target.frame=oldStart;
  target.shapes=target.shapes.filter(s=>s.frame>=oldStart);if(!target.shapes.some(s=>s.frame===oldStart))target.shapes.unshift({...copy(target.shapes[0]),frame:oldStart});
  const before=copy(f.data),file=copy(f.data);file.tracks=file.tracks.slice(0,1);
  const source=file.tracks[0];source.frame=newStart;
  source.shapes=[newStart,23,41].map((frame,i)=>({...copy(source.shapes[0]),frame,points:points(200+i*20),outside:i===1}));
  const p=await f.io.preview({mode:'edit',payload:file});assert.equal(p.rows[0].matched,true);assert.deepEqual(p.frameRange,{start:0,stop:59});
  const r=await f.io.apply({token:p.token,keys:['tracks:0']});assert.equal(r.error,null);
  const actual=f.data.tracks[0];assert.equal(actual.clientID,38);assert.equal(actual.id,before.tracks[0].id);assert.equal(actual.frame,oldStart);assert.equal(f.commits.length,0);
  assert.deepEqual(actual.shapes.map(s=>s.frame),[newStart,23,41]);
  for(let frame=0;frame<=59;frame++){
   const expected=sampleTrack(source,frame),observed=sampleTrack(actual,frame);
   assert.deepEqual(observed.points,expected.points,'geometry at frame '+frame);assert.equal(observed.outside,expected.outside,'visibility at frame '+frame);
  }
  assert.deepEqual(f.data.tracks.slice(1),before.tracks.slice(1));
  while(f.history.length)f.undo();assert.deepEqual(f.data,before);
 }
});

test('dense template writes every frame including unchanged frames and keeps omitted IDs intact',async()=>{
 const f=fixture(),file=copy(f.data),before=copy(f.data);file.tracks=file.tracks.slice(0,1);
 file.tracks[0].shapes=Array.from({length:60},(_,frame)=>({...copy(file.tracks[0].shapes[0]),frame,points:points(frame),outside:frame<5||frame>50}));
 // Half of the existing target already matches; these frames must still be saved.
 f.data.tracks[0].shapes=copy(file.tracks[0].shapes);f.data.tracks[0].shapes.forEach(s=>{if(s.frame%2)s.points[0]+=100;});
 const p=await f.io.preview({payload:file}),r=await f.io.apply({token:p.token,keys:['tracks:0']});assert.equal(r.error,null);assert.equal(f.history.length,60);assert.equal(f.commits.length,0);
 for(let frame=0;frame<60;frame++){assert.deepEqual(f.data.tracks[0].shapes[frame].points,file.tracks[0].shapes[frame].points);assert.equal(f.data.tracks[0].shapes[frame].outside,file.tracks[0].shapes[frame].outside);}
 assert.deepEqual(f.data.tracks.slice(1),before.tracks.slice(1));
});
