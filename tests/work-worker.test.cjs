const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function worker(memory={}){
 let handler;const chrome={runtime:{id:'extension',getManifest:()=>({host_permissions:['<all_urls>']}),onMessage:{addListener(fn){handler=fn;}}},storage:{local:{get:async key=>({[key]:structuredClone(memory[key])}),set:async values=>Object.assign(memory,structuredClone(values))}}};
 vm.runInNewContext(fs.readFileSync('extension/session_worker.js','utf8'),{chrome,URL,structuredClone});
 return {memory,call(payload,sender={id:'extension',tab:{id:1,url:'https://cvat.example/tasks/1/jobs/1224'}}){return new Promise(resolve=>handler({type:'C3D_WORK_LOG',payload},sender,r=>resolve(JSON.parse(JSON.stringify(r)))));}};
}
test('work worker validates extension sender and CVAT job; scope comes from the actual tab',async()=>{
 const w=worker();assert.equal((await w.call({op:'view'},{id:'other',tab:{url:'https://cvat.example/jobs/1'}})).ok,false);assert.equal((await w.call({op:'view'},{id:'extension',tab:{url:'https://example.com/'}})).ok,false);
 assert.equal((await w.call({op:'in',id:'worker-shift'})).ok,true);
 const r=await w.call({op:'observe',id:'event',shiftId:'worker-shift',origin:'https://forged.example',jobId:99,changes:[{objectKey:'tracks:db:100',clientId:38,frame:3,before:'old',after:'new',present:true}]});assert.equal(r.result.changed,1);assert.equal(r.result.objects[0].jobId,1224);assert.equal(r.result.objects[0].origin,'https://cvat.example');
});
test('work worker restart restores the same shift, goal and deduplicated work',async()=>{
 const a=worker();await a.call({op:'goal',unit:'cuboids',target:20});await a.call({op:'in',id:'shift'});const message={op:'observe',id:'once',shiftId:'shift',changes:[{objectKey:'tracks:db:100',clientId:38,frame:3,before:'old',after:'new',present:true}]};await a.call(message);
 const b=worker(a.memory),r=await b.call(message);assert.equal(r.result.changed,1);assert.equal(r.result.edits,1);assert.equal(r.result.goal.target,20);assert.equal(r.result.active.id,'shift');
});
