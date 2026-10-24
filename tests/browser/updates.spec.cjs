const {test,expect}=require('@playwright/test');
async function setup(page,state='available'){
 await page.setContent('<main><span data-update-status role="status"></span><button data-update-install>Update online</button><button data-update-local>Reload local</button><button data-update-setup hidden>Cài updater</button></main>');
 await page.addStyleTag({path:'extension/styles.css'});
 await page.evaluate(state=>{
  window.updateCalls=[];window.nativeCalls=[];window.listeners=[];window.importPending=false;window.failure=null;
  window.chrome={runtime:{id:'fixture',getManifest:()=>({version:'1.15.0'}),onMessage:{addListener:fn=>listeners.push(fn),removeListener:fn=>listeners.splice(listeners.indexOf(fn),1)},
   sendMessage:async message=>{updateCalls.push(message);if(failure)return {ok:false,error:failure};return {ok:true,result:message.type==='C3D_UPDATE_CHECK'?{state,latest:'1.15.1'}:{reloading:true}};}}};
 },state);
 await page.addScriptTag({path:'extension/update_client.js'});
 await page.evaluate(()=>{
  window.clientEnv={root:document.querySelector('main'),toast:()=>{},flush:async()=>{},importPending:()=>window.importPending,
   request:async(type)=>{nativeCalls.push(type);if(type==='GET_SNAPSHOT')return {connected:true,saveState:'saved',jobId:3,sessionId:'fixture'};return {saved:true};}};
  window.client=__C3D_UPDATE_CLIENT.mount(clientEnv);
  window.workerMessage=type=>new Promise(resolve=>listeners[0]({type},{id:'fixture'},resolve));
 });
 await expect(page.locator('[data-update-status]')).not.toContainText('Đang kiểm tra');
}
test('online update checks at mount and click, then explicitly installs a new release',async({page})=>{
 await setup(page);
 await expect(page.locator('[data-update-status]')).toContainText('Có bản mới 1.15.1');
 expect(await page.evaluate(()=>updateCalls.map(c=>c.type))).toEqual(['C3D_UPDATE_CHECK']);
 await page.getByRole('button',{name:'Update online',exact:true}).click();
 expect(await page.evaluate(()=>updateCalls.map(c=>c.type))).toEqual(['C3D_UPDATE_CHECK','C3D_UPDATE_CHECK','C3D_SAFE_RELOAD']);
 expect(await page.evaluate(()=>updateCalls.at(-1))).toEqual({type:'C3D_SAFE_RELOAD',install:true});
});

test('local reload bypasses GitHub in every release state and keeps save guards',async({page})=>{
 for(const state of ['current','available','ahead','unavailable']){
  await setup(page,state);await expect(page.getByRole('button',{name:'Update online',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reload local',exact:true}).click();
  expect(await page.evaluate(()=>updateCalls.map(c=>c.type))).toEqual(['C3D_UPDATE_CHECK','C3D_SAFE_RELOAD']);
  expect(await page.evaluate(()=>updateCalls.at(-1))).toEqual({type:'C3D_SAFE_RELOAD',install:false});
 }
});

test('online check with current, ahead or unavailable release never reloads or downgrades local build',async({page})=>{
 for(const state of ['current','ahead','unavailable']){
  await setup(page,state);await page.getByRole('button',{name:'Update online',exact:true}).click();
  expect(await page.evaluate(()=>updateCalls.map(c=>c.type))).toEqual(['C3D_UPDATE_CHECK','C3D_UPDATE_CHECK']);
  await expect(page.getByRole('button',{name:'Reload local',exact:true})).toBeEnabled();
 }
});

test('local reload does not wait for a hanging startup GitHub check',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{
  client.dispose();updateCalls=[];
  chrome.runtime.sendMessage=async message=>{updateCalls.push(message);if(message.type==='C3D_UPDATE_CHECK')return new Promise(()=>{});return {ok:true,result:{reloading:true}};};
  client=__C3D_UPDATE_CLIENT.mount(clientEnv);
 });
 await expect(page.locator('[data-update-status]')).toContainText('Đang kiểm tra');
 await page.getByRole('button',{name:'Reload local',exact:true}).click();
 expect(await page.evaluate(()=>updateCalls)).toEqual([{type:'C3D_UPDATE_CHECK'},{type:'C3D_SAFE_RELOAD',install:false}]);
});

test('save failure is shown without falling back to an unsafe page refresh',async({page})=>{
 await setup(page,'current');await page.evaluate(()=>failure='Không lưu được CVAT');
 await page.getByRole('button',{name:'Reload local',exact:true}).click();
 await expect(page.locator('[data-update-status]')).toContainText('Không lưu được CVAT');
 expect(await page.evaluate(()=>updateCalls.at(-1))).toEqual({type:'C3D_SAFE_RELOAD',install:false});
});

test('worker save guard locks the page, verifies clean state, then releases on failure/cancel',async({page})=>{
 await setup(page);
 expect((await page.evaluate(()=>workerMessage('C3D_RELOAD_HOLD'))).ok).toBe(true);
 await expect(page.locator('.c3d-reload-hold')).toBeVisible();
 expect((await page.evaluate(()=>workerMessage('C3D_RELOAD_VERIFY'))).ok).toBe(true);
 await page.evaluate(()=>workerMessage('C3D_RELOAD_RELEASE'));
 await expect(page.locator('.c3d-reload-hold')).toHaveCount(0);
 expect(await page.evaluate(()=>nativeCalls)).toContain('PREPARE_RELOAD');
 expect(await page.evaluate(()=>nativeCalls)).toContain('RELEASE_RELOAD');
});
test('pending server import blocks save-before-reload to protect imported annotations',async({page})=>{
 await setup(page);await page.evaluate(()=>window.importPending=true);
 const response=await page.evaluate(()=>workerMessage('C3D_RELOAD_HOLD'));expect(response.ok).toBe(false);expect(response.error).toContain('import');
 expect(await page.evaluate(()=>nativeCalls.includes('PREPARE_RELOAD'))).toBe(false);
});
test('reload waits for post-save ledger flush and releases native hold if it fails',async({page})=>{
 await setup(page);await page.evaluate(()=>{clientEnv.afterSave=async()=>nativeCalls.push('WORK_LOG_AFTER_SAVE');});
 expect((await page.evaluate(()=>workerMessage('C3D_RELOAD_HOLD'))).ok).toBe(true);
 expect(await page.evaluate(()=>nativeCalls.indexOf('WORK_LOG_AFTER_SAVE')>nativeCalls.indexOf('PREPARE_RELOAD'))).toBe(true);
 await page.evaluate(()=>workerMessage('C3D_RELOAD_RELEASE'));
 await page.evaluate(()=>{clientEnv.afterSave=async()=>{throw Error('Nhật ký chưa ghi');};});const failed=await page.evaluate(()=>workerMessage('C3D_RELOAD_HOLD'));expect(failed.ok).toBe(false);expect(failed.error).toContain('Nhật ký');await expect(page.locator('.c3d-reload-hold')).toHaveCount(0);
});
