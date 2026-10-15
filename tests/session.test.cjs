const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {sessionContext}=require('../extension/session_worker');
const {createSessionTransport}=require('../extension/session_transport');
const patterns=['*://cvat.note.transformerlabs.ai/*','*://*.cvat.ai/*','*://localhost/*'];
test('session context restricts host and job route',()=>{
 assert.equal(sessionContext({id:2,url:'https://app.cvat.ai/tasks/2/jobs/17'},patterns).jobId,17);
 for(const url of ['https://evil.test/jobs/17','https://app.cvat.ai.evil.test/jobs/17','https://app.cvat.ai/tasks/17','file://localhost/jobs/17'])
  assert.throws(()=>sessionContext({id:2,url},patterns));
});
function fixture(){
 let current={connected:true,jobId:17,saveState:'saved',capabilities:{edit:true}},calls=[];
 const transport=createSessionTransport({snapshot:()=>current,url:()=> 'https://app.cvat.ai/tasks/2/jobs/17',cookie:()=> 'csrftoken=test-csrf',
  fetch:async(url,options)=>{calls.push({url,options});return {ok:true,status:202,json:async()=>({rq_id:'test-rq'}),arrayBuffer:async()=>new Uint8Array([1,2]).buffer};}});
 const command=(operation,rest={})=>transport({origin:'https://app.cvat.ai',jobId:17,operation,...rest});
 return {current,calls,command};
}
test('export uses current session and CSRF without sessionid transfer',async()=>{
 const f=fixture();assert.deepEqual(await f.command('export',{format:'CVAT for point clouds 1.0'}),{rq_id:'test-rq'});
 assert.equal(f.calls[0].options.credentials,'include');assert.equal(f.calls[0].options.method,'POST');
 assert.equal(f.calls[0].options.headers['X-CSRFToken'],'test-csrf');
 assert.ok(!JSON.stringify(f.calls).includes('sessionid'));assert.ok(f.calls[0].url.includes('save_images=false'));
});
test('annotation operations block unsaved state, stale job, unconfirmed imports and external downloads',async()=>{
 const f=fixture();
 f.current.saveState='unsaved';await assert.rejects(f.command('export',{format:'x'}),/Save CVAT/);
 f.current.saveState='saved';
 await assert.rejects(f.command('import',{format:'x',file:{name:'x.zip',bytes:[1]}}),/Confirm/);
 await assert.rejects(f.command('download',{url:'https://evil.test/file.zip'}),/Unsafe/);
 await assert.rejects(f.command('download',{url:'https://app.cvat.ai/api/jobs/99/dataset/export'}),/Unsafe/);
 await assert.rejects(f.command('user',{jobId:99}),/changed/);
 await assert.rejects(f.command('delete'),/Unsupported/);assert.equal(f.calls.length,0);
});
test('import sends multipart only for confirmed editable job',async()=>{
 const f=fixture();await f.command('import',{format:'CVAT',confirmJob:17,file:{name:'labels.zip',bytes:[1,2,3]}});
 const req=f.calls[0];assert.equal(req.options.body.get('annotation_file').name,'labels.zip');
 assert.equal(req.options.body.get('annotation_file').size,3);
 assert.ok(req.url.includes('/api/jobs/17/annotations/'));
 await assert.rejects(f.command('import',{confirmJob:17,file:{bytes:[1]}}),/already submitted/);
 const blocked=fixture();blocked.current.capabilities.edit=false;await assert.rejects(blocked.command('import',{confirmJob:17,file:{bytes:[1]}}),/editable/);
});
test('cookie worker never releases cookies to content scripts or other pages',async()=>{
 let listener,reads=0;
 const chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,getManifest:()=>({host_permissions:patterns}),onMessage:{addListener:fn=>listener=fn}},
 tabs:{get:async()=>({id:2,url:'https://app.cvat.ai/jobs/17'})},
 cookies:{getAllCookieStores:async()=>[{id:'0',tabIds:[2]}],getAll:async()=>{reads++;return [{name:'sessionid',value:'fake-cookie',path:'/',httpOnly:true}];}}};
 vm.runInNewContext(fs.readFileSync('extension/session_worker.js','utf8'),{chrome,URL});
 const send=(sender)=>new Promise(resolve=>listener({type:'C3D_COOKIES',tabId:2,origin:'https://app.cvat.ai',jobId:17},sender,resolve));
 assert.equal((await send({id:'test',url:'https://app.cvat.ai/jobs/17'})).ok,false);
 assert.equal((await send({id:'test',url:'chrome-extension://test/other.html'})).ok,false);
 assert.equal(reads,0);
 const good=await send({id:'test',url:'chrome-extension://test/session.html?tab=2'});
 assert.equal(good.result.session.value,'fake-cookie');assert.equal(reads,1);
});
