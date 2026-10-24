const {test}=require('node:test'),assert=require('node:assert/strict');
const w=require('../extension/work_log.js');
const now=new Date(2026,9,24,9).getTime(),ctx={origin:'https://cvat.example',jobId:1224};
function fixture(){let store=w.fresh(),time=now,seq=0;return {run(p,c=ctx){const r=w.apply(store,p,c,time);store=r.store;return r.result;},edit(changes,extra={}){return this.run({op:'observe',id:'event'+(++seq),shiftId:'shift',epoch:'editor',changes,...extra});},get store(){return store;},advance(ms){time+=ms;}};}
const row=(frame=3,before='old',after='new',extra={})=>({objectKey:'tracks:db:100',clientId:38,frame,before,after,present:after!==null,...extra});
test('work ledger counts unique cuboid frames and unique objects, not edits or interpolated frames',()=>{
 const f=fixture();f.run({op:'in',id:'shift'});f.edit([row(3),row(4)]);const s=f.edit([row(3,'new','newer')]);assert.equal(s.changed,2);assert.equal(s.changedObjects,1);assert.equal(s.touched,2);assert.equal(s.edits,3);assert.deepEqual(s.objects[0].frames,[3,4]);
});
test('no active shift and stale-shift messages cannot contribute work',()=>{
 const f=fixture();assert.equal(f.edit([row()]).changed,0);f.run({op:'in',id:'another'});assert.equal(f.edit([row()]).changed,0);f.run({op:'out'});assert.equal(f.edit([row()]).changed,0);
});
test('undo back to baseline reduces KPI while preserving touched history; redo restores one cuboid',()=>{
 const f=fixture();f.run({op:'in',id:'shift'});f.edit([row()]);const undo=f.edit([row(3,'new','old')]);assert.equal(undo.changed,0);assert.equal(undo.touched,1);assert.equal(undo.reverted,1);assert.equal(f.edit([row()]).changed,1);
});
test('deletion/outside never increases completed cuboids or deleted object KPI',()=>{
 const f=fixture();f.run({op:'in',id:'shift'});const s=f.edit([row(3,'old',null),row(null,'head',null)]);assert.equal(s.changed,0);assert.equal(s.changedObjects,0);assert.equal(s.deleted,1);
 const g=fixture();g.run({op:'in',id:'shift'});assert.equal(g.edit([row(3,'old','outside',{present:false})]).changed,0);
});
test('global class/attribute changes count one object and zero cuboid frames',()=>{
 const f=fixture();f.run({op:'in',id:'shift'});const s=f.edit([row(null)]);assert.equal(s.changedObjects,1);assert.equal(s.changed,0);assert.equal(s.objects[0].global,true);
});
test('same displayed ID in another job or server is a distinct object',()=>{
 const f=fixture();f.run({op:'in',id:'shift'});f.edit([row()]);f.run({op:'observe',id:'job',shiftId:'shift',changes:[row()]},{...ctx,jobId:1264});const s=f.run({op:'observe',id:'server',shiftId:'shift',changes:[row()]},{...ctx,origin:'https://another.example'});assert.equal(s.changedObjects,3);assert.equal(s.changed,3);
});
test('duplicate deliveries and worker restart do not inflate counts',()=>{
 const f=fixture();f.run({op:'in',id:'shift'});const message={op:'observe',id:'fixed',shiftId:'shift',changes:[row()]};f.run(message);const s=w.apply(structuredClone(f.store),message,ctx,now).result;assert.equal(s.edits,1);assert.equal(s.changed,1);
});
test('KPI goal is per local calendar day with explicit unit, zero means unset',()=>{
 const f=fixture();f.run({op:'in',id:'shift'});f.run({op:'goal',target:3,unit:'cuboids'});let s=f.edit([row()]);assert.equal(s.remaining,2);f.run({op:'goal',target:1,unit:'objects'});s=f.run({op:'view'});assert.equal(s.progress,100);assert.equal(s.remaining,0);assert.equal(f.run({op:'view',date:'2026-10-23'}).goal.target,0);
 for(const target of [-1,1.2,NaN])assert.throws(()=>f.run({op:'goal',target,unit:'cuboids'}));assert.throws(()=>f.run({op:'goal',target:1,unit:'hours'}));assert.throws(()=>f.run({op:'view',date:'2026-02-31'}));
});
test('saved hashes only acknowledge actual observed state; unconfirmed state is pending',()=>{
 const f=fixture();f.run({op:'in',id:'shift'});f.edit([row()]);assert.equal(f.run({op:'view'}).saved,0);f.edit([],{saved:true,states:[{objectKey:'tracks:db:100',frame:3,hash:'different'}]});assert.equal(f.run({op:'view'}).saved,0);const s=f.edit([],{saved:true,states:[{objectKey:'tracks:db:100',frame:3,hash:'new'}]});assert.equal(s.saved,1);assert.equal(f.edit([row(3,'new','edited')]).saved,0);
});
test('new-object ID assignment aliases the same work, never creates another KPI unit',()=>{
 const f=fixture(),anon='tracks:new:editor:38';f.run({op:'in',id:'shift'});f.edit([row(3,null,'created',{objectKey:anon})]);let s=f.edit([],{aliases:[{from:anon,to:'tracks:db:100'}],saved:true,states:[{objectKey:'tracks:db:100',frame:3,hash:'created'}]});assert.equal(s.saved,1);s=f.edit([row(3,'created','edited')]);assert.equal(s.changed,1);assert.equal(s.changedObjects,1);
});
test('reloading a discarded unsaved edit returns KPI to baseline without inventing more work',()=>{
 const f=fixture();f.run({op:'in',id:'shift'});f.edit([row()]);const s=f.edit([],{reconcile:true,states:[{objectKey:'tracks:db:100',frame:3,hash:'old',present:true}]});assert.equal(s.changed,0);assert.equal(s.touched,1);assert.equal(s.edits,1);
 const g=fixture();g.run({op:'in',id:'shift'});g.edit([row()]);const uncertain=g.edit([],{reconcile:true,states:[{objectKey:'tracks:db:100',frame:3,hash:'external',present:true}]});assert.equal(uncertain.changed,0);assert.equal(uncertain.uncertain,1);
});
test('explicit suggestion decisions are idempotent, separate from KPI and not recorded outside shifts',()=>{
 const f=fixture();f.run({op:'decision',key:'batch:3',value:'accepted'});f.run({op:'in',id:'shift'});f.run({op:'decision',key:'batch:3',value:'accepted'});f.run({op:'decision',key:'batch:3',value:'accepted'});const s=f.run({op:'decision',key:'batch:4',value:'rejected'});assert.equal(s.accepted,1);assert.equal(s.rejected,1);assert.equal(s.changed,0);
});
test('heartbeat counts focused activity once across tabs and does not bill browser downtime',()=>{
 const f=fixture();f.run({op:'in',id:'shift'});f.advance(20000);f.run({op:'beat',working:true});f.run({op:'beat',working:true});assert.equal(f.run({op:'view'}).activeMs,20000);f.advance(3600000);assert.equal(f.run({op:'beat',working:true}).activeMs,20000);f.advance(20000);assert.equal(f.run({op:'beat',working:true}).activeMs,40000);
});
test('active time crosses midnight into the correct local days',()=>{
 let store=w.fresh();const start=new Date(2026,9,24,23,59,50).getTime();store=w.apply(store,{op:'in',id:'night'},ctx,start).store;store=w.apply(store,{op:'beat',working:true},ctx,start+20000).store;assert.equal(w.summary(store,'2026-10-24',start+20000).activeMs,10000);assert.equal(w.summary(store,'2026-10-25',start+20000).activeMs,10000);
});
test('service serializes concurrent tabs, restores storage and exposes quota failure',async()=>{
 const memory={};let time=now;const storage={async get(k){return {[k]:structuredClone(memory[k])};},async set(v){await new Promise(r=>setTimeout(r,2));Object.assign(memory,structuredClone(v));}};
 const service=w.createService({storage,clock:()=>time});const shifts=await Promise.all([service.run({op:'in',id:'one'},ctx),service.run({op:'in',id:'two'},ctx)]);assert.equal(shifts[0].active.id,shifts[1].active.id);
 const shiftId=shifts[0].active.id;await Promise.all([3,4].map(frame=>service.run({op:'observe',id:'edit'+frame,shiftId,changes:[row(frame)]},ctx)));assert.equal((await w.createService({storage,clock:()=>time}).run({op:'view'},ctx)).changed,2);
 const broken=w.createService({storage:{get:storage.get,set:async()=>{throw Error('quota');}},clock:()=>now});await assert.rejects(broken.run({op:'goal',unit:'objects',target:100},ctx),/quota/);assert.equal((await service.run({op:'view'},ctx)).goal.target,0);
});
test('native document rows are coordinate-free stable fingerprints and retain displayed IDs',()=>{
 const data={tracks:[{id:100,clientID:38,label_id:1,attributes:[],shapes:[{type:'cuboid',frame:3,points:[1,2,3],outside:false}]}]};const rows=w.documentRows(data,'editor');assert.equal(rows.length,2);assert.equal(rows[1].clientId,38);assert.equal(rows[1].objectKey,'tracks:db:100');assert.equal('points'in rows[1],false);assert.deepEqual(w.documentRows(structuredClone(data),'editor'),rows);data.tracks[0].shapes[0].points[0]++;assert.notEqual(w.documentRows(data,'editor')[1].hash,rows[1].hash);
});
test('native floating-point noise and attribute ordering do not invent workload',()=>{
 const data={tracks:[{id:100,clientID:38,label_id:1,attributes:[{spec_id:2,value:'b'},{spec_id:1,value:'a'}],shapes:[{type:'cuboid',frame:3,points:[.7,1,2],attributes:[]}]}]},before=w.documentRows(data,'editor');data.tracks[0].shapes[0].points[0]=.7000000000000001;data.tracks[0].attributes.reverse();assert.deepEqual(w.documentRows(data,'editor'),before);
});
test('service isolates personal KPI data between servers in the same browser profile',async()=>{
 const memory={},storage={get:async k=>({[k]:memory[k]}),set:async values=>Object.assign(memory,structuredClone(values))},service=w.createService({storage,clock:()=>now});
 await service.run({op:'goal',target:99,unit:'cuboids'},ctx);await service.run({op:'in',id:'private'},ctx);await service.run({op:'observe',id:'secret',shiftId:'private',changes:[row()]},ctx);
 const other=await service.run({op:'view'},{origin:'https://unrelated.example',jobId:1});assert.equal(other.changed,0);assert.equal(other.goal.target,0);assert.equal(other.active,null);assert.deepEqual(other.objects,[]);
});
