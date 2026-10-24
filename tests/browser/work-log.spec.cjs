const {test,expect}=require('@playwright/test');
async function fixture(page,documentData=null){
 await page.goto('http://127.0.0.1:4173/extension/manifest.json');await page.setContent('<html data-c3d-demo="true"><body><p style="font:14px system-ui;color:#334155;padding:20px">OFFLINE TEST FIXTURE · Không phải job CVAT thật</p></body></html>');await page.addStyleTag({path:'extension/styles.css'});await page.addScriptTag({path:'extension/work_log.js'});
 await page.evaluate(documentData=>{
  const listeners=new Set();const storage={async get(key){return {[key]:JSON.parse(localStorage.getItem(key)||'null')};},async set(values){for(const [key,value]of Object.entries(values)){const oldValue=JSON.parse(localStorage.getItem(key)||'null');localStorage.setItem(key,JSON.stringify(value));for(const fn of listeners)fn({[key]:{oldValue,newValue:value}},'local');}}};
  const service=__C3D_WORK_LOG.createService({storage});window.messages=[];window.workReads=0;window.workSaved=false;window.failWork=false;
  window.chrome={runtime:{id:'work-test',onMessage:{addListener(){},removeListener(){}},async sendMessage(message){messages.push(message);if(message.type==='C3D_WORK_LOG'){if(failWork)throw Error('quota fixture');return {ok:true,result:await service.run(message.payload,{origin:location.origin,jobId:1224})};}return {ok:true,result:{}};}},storage:{local:storage,onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
  window.workDoc=documentData||{tracks:[{id:100,clientID:38,label_id:1,attributes:[],shapes:[0,7,14].map(frame=>({type:'cuboid',frame,points:[frame*.1,0,1,0,0,0,4.5,1.8,1.5,0,0,0,0,0,0,0],attributes:[],outside:false}))}]};
  window.workSnap={sessionId:'native-work',mode:'live',connected:true,jobId:1224,frame:7,revision:1,activeBoxId:38,boxes:[{id:38,labelId:1,label_name:'vehicles',points:workDoc.tracks[0].shapes[1].points}],labels:[{id:1,name:'vehicles'}],capabilities:{read:true,edit:true,ground:false,selection:true},saveState:'unsaved'};
  window.emitWork=()=>window.dispatchEvent(new CustomEvent('c3d:snapshot:v2',{detail:JSON.stringify(workSnap)}));
  window.addEventListener('c3d:request:v2',e=>{const q=JSON.parse(e.detail);let result={};if(q.type==='GET_SNAPSHOT')result=workSnap;if(q.type==='GET_WORK_DOCUMENT'){workReads++;result={jobId:1224,epoch:'native-work',rows:__C3D_WORK_LOG.documentRows(workDoc,'native-work'),saved:workSaved};}window.dispatchEvent(new CustomEvent('c3d:response:v2',{detail:JSON.stringify({requestId:q.requestId,ok:true,result})}));});
 },documentData);
 await page.addScriptTag({path:'extension/copilot_panel.js'});await page.locator('#c3d-tab-work').click();await expect(page.locator('[data-work-shift]')).toContainText(/Chưa vào ca|Đang trong ca/);
}
async function edit(page,frame=7){await page.evaluate(frame=>{workDoc.tracks[0].shapes.find(s=>s.frame===frame).points[0]+=1;workSnap.revision++;emitWork();},frame);}
test('daily KPI tracks native edits once, undo reduces net work and frame navigation adds no work',async({page})=>{
 await fixture(page);expect(await page.evaluate(()=>workReads)).toBe(0);
 await page.locator('[data-work-target]').fill('2');await page.locator('[data-work-set]').click();await expect(page.locator('[data-work-progress]')).toContainText('0 / 2');
 await page.locator('[data-work-in]').click();await expect(page.locator('[data-work-shift]')).toContainText('Đang trong ca');
 await edit(page);await expect(page.locator('[data-work-cuboids]')).toHaveText('1');await edit(page);await expect(page.locator('[data-work-cuboids]')).toHaveText('1');
 await page.evaluate(()=>{workSnap.frame=8;workSnap.revision++;emitWork();});await expect(page.locator('[data-work-progress]')).toContainText('1 / 2');
 await page.evaluate(()=>{workDoc.tracks[0].shapes.find(s=>s.frame===7).points[0]=.7;workSnap.revision++;emitWork();});await expect(page.locator('[data-work-cuboids]')).toHaveText('0');await expect(page.locator('[data-work-decisions]')).toContainText('Đã tác động 1 cuboid');
 await edit(page,0);await edit(page,14);await expect(page.locator('[data-work-progress]')).toContainText('Đạt mục tiêu tự đặt');await expect(page.locator('[data-work-rows]')).toContainText('Job 1224 · #38');
 await page.screenshot({path:'docs/verification/work-kpi-1.21.0.png',fullPage:true});
 await page.locator('[data-work-out]').click();await expect(page.locator('[data-work-shift]')).toContainText('Chưa vào ca');await edit(page,7);await page.waitForTimeout(600);await expect(page.locator('[data-work-cuboids]')).toHaveText('2');
 await page.evaluate(()=>{workDoc.tracks[0].shapes.find(s=>s.frame===0).points[0]=0;});await page.locator('[data-work-in]').click();await expect(page.locator('[data-work-shift]')).toContainText('Đang trong ca');await expect(page.locator('[data-work-cuboids]')).toHaveText('1');
});
test('ledger and KPI restore after reopening; saved indication requires matching native hashes',async({page})=>{
 await fixture(page);await page.locator('[data-work-target]').fill('5');await page.locator('[data-work-set]').click();await page.locator('[data-work-in]').click();await expect(page.locator('[data-work-shift]')).toContainText('Đang trong ca');
 await edit(page);await expect(page.locator('[data-work-cuboids]')).toHaveText('1');await expect(page.locator('[data-work-saved]')).toHaveText('0');
 await page.evaluate(()=>{workSaved=true;workSnap.saveState='saved';emitWork();});await expect(page.locator('[data-work-saved]')).toHaveText('1');
 const doc=await page.evaluate(()=>workDoc);await fixture(page,doc);await expect(page.locator('[data-work-progress]')).toContainText('1 / 5');await expect(page.locator('[data-work-shift]')).toContainText('Đang trong ca');
 const download=page.waitForEvent('download');await page.locator('[data-work-export]').click();expect((await download).suggestedFilename()).toMatch(/^cvat-work-.*\.csv$/);
});
test('discarded unsaved native edits are reconciled on reload rather than claimed as KPI',async({page})=>{
 await fixture(page);await page.locator('[data-work-in]').click();await expect(page.locator('[data-work-shift]')).toContainText('Đang trong ca');await edit(page);await expect(page.locator('[data-work-cuboids]')).toHaveText('1');
 await fixture(page);await expect(page.locator('[data-work-cuboids]')).toHaveText('0');await expect(page.locator('[data-work-decisions]')).toContainText('Đã tác động 1 cuboid');
});
test('storage errors are visible, historical goals remain separate and unavailable demo cannot fabricate work',async({page})=>{
 await fixture(page);await page.evaluate(()=>window.failWork=true);await page.locator('[data-work-target]').fill('100');await page.locator('[data-work-set]').click();await expect(page.locator('[data-work-status]')).toContainText('quota fixture');
 await page.evaluate(()=>window.failWork=false);const today=await page.locator('[data-work-date]').inputValue();await page.locator('[data-work-date]').fill('2026-01-01');await page.locator('[data-work-date]').dispatchEvent('change');await page.locator('[data-work-target]').fill('8');await page.locator('[data-work-unit]').selectOption('objects');await page.locator('[data-work-set]').click();await expect(page.locator('[data-work-progress]')).toContainText('0 / 8');
 await page.locator('[data-work-date]').fill(today);await page.locator('[data-work-date]').dispatchEvent('change');await expect(page.locator('[data-work-progress]')).toContainText('Chưa đặt KPI');
 await page.goto('http://127.0.0.1:4173/demo/index.html');await page.locator('#c3d-tab-work').click();await expect(page.locator('[data-work-in]')).toBeDisabled();await expect(page.locator('[data-work-status]')).toContainText('Demo không tạo số liệu');
});

test('batch suggestion decisions count explicit successful automatic acceptance and rejection only',async({page})=>{
 await fixture(page);await page.locator('[data-work-in]').click();await expect(page.locator('[data-work-shift]')).toContainText('Đang trong ca');
 await page.evaluate(async()=>{
  const panel=document.createElement('section');document.body.append(panel);
  window.extraWork=__C3D_WORK_UI.mount({root:panel,panel,snapshot:()=>workSnap,request:async()=>({jobId:1224,epoch:'native-work',rows:__C3D_WORK_LOG.documentRows(workDoc,'native-work'),saved:false})});
 });
 await expect.poll(()=>page.evaluate(()=>messages.filter(m=>m.type==='C3D_WORK_LOG'&&m.payload.op==='view').length)).toBeGreaterThan(1);
 await page.waitForTimeout(200);
 await page.evaluate(()=>{
  extraWork.result('BATCH_FRAME',{token:'testbatch',frame:3},{status:'proposal'});extraWork.result('BATCH_PROTECT',{token:'testbatch',frame:3},{protected:true});extraWork.result('BATCH_PROTECT',{token:'testbatch',frame:3},{protected:true});
  extraWork.result('BATCH_FRAME',{token:'testbatch',frame:7},{status:'proposal'});extraWork.result('BATCH_APPLY',{token:'testbatch'},{appliedFrames:[7],error:'partial'});
  extraWork.result('BATCH_FRAME',{token:'testbatch',frame:8},{status:'proposal'});extraWork.result('BATCH_DRAFT',{token:'testbatch',frame:8},{manual:true});extraWork.result('BATCH_APPLY',{token:'testbatch'},{appliedFrames:[8]});
 });
 await expect(page.locator('#c3d-task-work [data-work-decisions]')).toContainText('nhận 0 · bỏ qua rõ ràng 1');
 await page.evaluate(()=>extraWork.result('BATCH_APPLY',{token:'testbatch'},{appliedFrames:[7]}));await expect(page.locator('#c3d-task-work [data-work-decisions]')).toContainText('nhận 1 · bỏ qua rõ ràng 1');await page.evaluate(()=>extraWork.dispose());
});

test('import baseline reset does not inflate work; later manual changes are recorded without raw coordinates',async({page})=>{
 await fixture(page);await page.locator('[data-work-in]').click();await expect(page.locator('[data-work-shift]')).toContainText('Đang trong ca');
 await page.evaluate(async()=>{
  __CVAT_COPILOT_PANEL.dispose();const panel=document.createElement('section');document.body.append(panel);
  window.importWork=__C3D_WORK_UI.mount({root:panel,panel,snapshot:()=>workSnap,request:async()=>({jobId:1224,epoch:'native-work',rows:__C3D_WORK_LOG.documentRows(workDoc,'native-work'),saved:false})});
 });
 await page.waitForTimeout(250);
 await page.evaluate(async()=>{await importWork.flush();importWork.before('IMPORT_ALL_ANNOTATIONS');workDoc.tracks[0].shapes[1].points[0]=99;importWork.onSnapshot({...workSnap,revision:99});importWork.after('IMPORT_ALL_ANNOTATIONS');await importWork.flush();});
 await expect(page.locator('[data-work-cuboids]')).toHaveText('0');
 await page.evaluate(async()=>{workDoc.tracks[0].shapes[1].points[0]=100;await importWork.flush();});await expect(page.locator('[data-work-cuboids]')).toHaveText('1');
 const raw=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('c3d.worklog.')).map(k=>localStorage.getItem(k)).join(''));expect(raw).not.toContain('points');expect(raw).not.toContain('sessionid');await page.evaluate(()=>importWork.dispose());
});

test('batch edit helper boundary keys are excluded while the intended edited cuboid is counted',async({page})=>{
 await fixture(page);await page.locator('[data-work-in]').click();await expect(page.locator('[data-work-shift]')).toContainText('Đang trong ca');
 await page.evaluate(()=>{__CVAT_COPILOT_PANEL.dispose();const panel=document.createElement('section');document.body.append(panel);window.boundaryWork=__C3D_WORK_UI.mount({root:panel,panel,snapshot:()=>workSnap,request:async()=>({jobId:1224,epoch:'native-work',rows:__C3D_WORK_LOG.documentRows(workDoc,'native-work'),saved:false})});});
 await page.waitForTimeout(200);
 await page.evaluate(async()=>{
  await boundaryWork.flush();boundaryWork.result('BATCH_SIZE_OPEN',{}, {token:'size',clientId:38});boundaryWork.before('BATCH_SIZE_APPLY');
  const original=workDoc.tracks[0].shapes[1];original.points[6]=5;
  for(const frame of [6,8])workDoc.tracks[0].shapes.push({...structuredClone(original),frame,points:[frame*.1,0,1,0,0,0,4.5,1.8,1.5]});
  boundaryWork.result('BATCH_SIZE_APPLY',{token:'size'},{appliedFrames:[7],boundaryFrames:[6,8]});boundaryWork.after('BATCH_SIZE_APPLY');await boundaryWork.flush();
 });
 await expect(page.locator('[data-work-cuboids]')).toHaveText('1');await expect(page.locator('[data-work-decisions]')).toContainText('Đã tác động 1 cuboid');await page.evaluate(()=>boundaryWork.dispose());
});
