const {test,expect}=require('@playwright/test');
async function setup(page,mode='edit',unmatched=false){
 await page.setContent('<html><body></body></html>');await page.addStyleTag({path:'extension/styles.css'});
 await page.evaluate(unmatched=>{window.requests=[];window.changed=false;window.preview={token:'import-fixture',rows:[
  {key:'tracks:0',sourceClientId:38,sourceServerId:48950,targetClientId:38,matched:true,label:'pedestrian',frames:60},
  {key:'tracks:1',sourceClientId:63,sourceServerId:48975,targetClientId:63,matched:true,label:'pedestrian',frames:60},
  {key:'tracks:2',sourceClientId:79,sourceServerId:72716,targetClientId:79,matched:true,label:'vehicles',frames:3}]};
  if(unmatched){preview.targets=preview.rows.map((r,i)=>({kind:'tracks',clientID:r.targetClientId,serverID:90000+i,label:r.label,frame:0}));preview.rows.forEach((r,i)=>{r.kind='tracks';r.sourceClientId=null;r.sourceServerId=70115+i;r.matched=false;r.targetClientId=null;});}
 },unmatched);
 await page.addScriptTag({path:'extension/annotation_io_ui.js'});
 await page.evaluate(async mode=>{
  window.ui=__C3D_ANNOTATION_IO_UI.mount({jobId:1224,sessionId:'fixture',mode,data:{tracks:[]},toast:()=>{},request:async(type,payload)=>{
   requests.push({type,payload});if(type==='PREVIEW_ANNOTATION_IMPORT')return preview;changed=true;return {changed:[38,63],added:[],removed:[],message:'Editor updated; Save CVAT to persist.'};}});await ui.open();
 },mode);
}
test('Replace selection applies exactly chosen #38 and #63 after explicit confirmation, with no page reload',async({page})=>{
 await setup(page);await expect(page.getByRole('dialog',{name:'Chọn ID import'})).toContainText('CVAT #38');
 await page.locator('[data-import-key="tracks:2"]').uncheck();
 await page.getByRole('button',{name:'Áp dụng chỉnh sửa',exact:true}).click();expect(await page.evaluate(()=>changed)).toBe(false);
 await expect(page.getByRole('status')).toContainText('Đánh dấu xác nhận');
 await page.getByRole('checkbox',{name:'Xác nhận thay đổi annotation'}).check();await page.getByRole('button',{name:'Áp dụng chỉnh sửa',exact:true}).click();
 expect(await page.evaluate(()=>requests.at(-1).payload)).toEqual({jobId:1224,sessionId:'fixture',token:'import-fixture',keys:['tracks:0','tracks:1']});
 await expect(page.getByRole('status')).toContainText('Đã sửa #38, #63');expect(await page.evaluate(()=>changed)).toBe(true);
});
test('one edit workflow has no add/replace scope selector and selecting all preserves explicit ID selection',async({page})=>{
 await setup(page);await expect(page.getByRole('heading')).toHaveText('Chỉnh ID đã chọn theo file');
 await expect(page.getByRole('combobox',{name:'Phạm vi replace'})).toHaveCount(0);
 await expect(page.getByRole('dialog')).toContainText('không tạo hoặc xóa box');
 await page.getByRole('button',{name:'Bỏ chọn',exact:true}).click();
 await expect(page.getByRole('button',{name:'Áp dụng chỉnh sửa',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Chọn tất cả',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('3 / 3');
 await page.getByRole('checkbox',{name:'Xác nhận thay đổi annotation'}).check();await page.getByRole('button',{name:'Áp dụng chỉnh sửa',exact:true}).click();
 expect(await page.evaluate(()=>requests.at(-1).payload)).toEqual({jobId:1224,sessionId:'fixture',token:'import-fixture',keys:['tracks:0','tracks:1','tracks:2']});
 expect(await page.evaluate(()=>requests[0].payload.mode)).toBe('edit');
});

test('filtering ID list preserves selections and closing preview makes no edits',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Bỏ chọn',exact:true}).click();
 await page.locator('[data-import-key="tracks:1"]').check();await page.getByRole('searchbox',{name:'Tìm ID import'}).fill('vehicles');
 await expect(page.locator('[data-import-key="tracks:1"]')).not.toBeVisible();await expect(page.getByRole('status')).toContainText('1 / 3');
 await page.getByRole('button',{name:'Đóng',exact:true}).click();expect(await page.evaluate(()=>changed)).toBe(false);
});

test('unmatched raw IDs require explicit current CVAT targets and block duplicate mappings',async({page})=>{
 await setup(page,'replace',true);
 await expect(page.getByRole('dialog')).toContainText('DB 70115 → không tìm thấy ID đích');
 await page.getByRole('button',{name:'Chọn tất cả',exact:true}).click();await expect(page.getByRole('status')).toContainText('3 ID chưa có đích');
 await expect(page.getByRole('button',{name:'Áp dụng chỉnh sửa',exact:true})).toBeDisabled();
 await page.locator('[data-target-key="tracks:0"]').selectOption('63');await page.locator('[data-target-key="tracks:1"]').selectOption('63');await page.locator('[data-import-key="tracks:2"]').uncheck();
 await expect(page.getByRole('status')).toContainText('Trùng ID đích');await expect(page.getByRole('button',{name:'Áp dụng chỉnh sửa',exact:true})).toBeDisabled();
 await page.locator('[data-target-key="tracks:1"]').selectOption('38');await page.getByRole('checkbox',{name:'Xác nhận thay đổi annotation'}).check();
 await expect(page.getByRole('dialog')).toContainText('DB 70116 → CVAT #38 (đích đã chọn)');
 await page.getByRole('button',{name:'Áp dụng chỉnh sửa',exact:true}).click();
 expect(await page.evaluate(()=>requests.at(-1).payload.mapping)).toEqual({'tracks:0':63,'tracks:1':38});
});

test('changing or clearing explicit target clears prior confirmation and never creates objects',async({page})=>{
 await setup(page,'replace',true);await page.locator('[data-target-key="tracks:0"]').selectOption('63');await page.getByRole('checkbox',{name:'Xác nhận thay đổi annotation'}).check();
 await page.locator('[data-target-key="tracks:0"]').selectOption('38');await expect(page.getByRole('checkbox',{name:'Xác nhận thay đổi annotation'})).not.toBeChecked();
 expect(await page.evaluate(()=>changed)).toBe(false);
 await page.locator('[data-target-key="tracks:0"]').selectOption('');await expect(page.locator('[data-import-key="tracks:0"]')).not.toBeChecked();await expect(page.locator('[data-target-key="tracks:0"]')).toHaveValue('');
});

test('a different start frame does not disable the target ID and full job range is visible',async({page})=>{
 await page.setContent('<body></body>');await page.addScriptTag({path:'extension/annotation_io_ui.js'});
 await page.evaluate(async()=>{
  __C3D_ANNOTATION_IO_UI.mount({jobId:1224,sessionId:'fixture',data:{},toast(){},request:async()=>({token:'t',frameRange:{start:0,stop:59},rows:[{key:'tracks:0',kind:'tracks',sourceClientId:38,targetClientId:38,matched:true,startFrame:8,label:'vehicles',frames:52}],targets:[{kind:'tracks',clientID:38,serverID:48950,frame:0,label:'vehicles'}]})}).open();
 });
 await expect(page.getByRole('dialog')).toContainText('Toàn bộ job: frame 0–59');
 await expect(page.locator('[data-target-key="tracks:0"] option[value="38"]')).toBeEnabled();
 await expect(page.locator('[data-target-key="tracks:0"]')).toHaveValue('38');
 await expect(page.getByRole('button',{name:'Áp dụng chỉnh sửa',exact:true})).toBeEnabled();
 await expect(page.getByRole('dialog')).not.toContainText('khác frame bắt đầu');
});

test('preview makes clientID identity explicit even when source and destination database IDs differ',async({page})=>{
 await page.setContent('<body></body>');await page.addScriptTag({path:'extension/annotation_io_ui.js'});
 await page.evaluate(async()=>{
  window.__C3D_ANNOTATION_IO_UI.mount({jobId:1224,sessionId:'fixture',mode:'replace',data:{},toast(){},request:async()=>({token:'t',rows:[{key:'tracks:0',kind:'tracks',sourceClientId:38,sourceServerId:70115,targetClientId:38,targetServerId:48950,dbDiffers:true,matched:true,label:'vehicles',frames:60}],targets:[{kind:'tracks',clientID:38,serverID:48950,label:'vehicles'}]})}).open();
 });
 await expect(page.getByRole('dialog')).toContainText('Chỉnh khớp theo #clientID hiển thị, không theo DB ID');
 await expect(page.getByRole('dialog')).toContainText('DB khác; vẫn sửa theo #clientID, giữ DB đích 48950');
 await expect(page.locator('[data-target-key="tracks:0"]')).toHaveValue('38');
});


test('cross-job template requires scene/frame confirmation and flags class mismatches without selecting them',async({page})=>{
 await page.setContent('<body></body>');await page.addStyleTag({path:'extension/styles.css'});await page.addScriptTag({path:'extension/annotation_io_ui.js'});
 await page.evaluate(async()=>{
  window.requests=[];
  const preview={token:'cross-job',crossJob:true,frameRange:{start:0,stop:59},source:{jobId:1264,toolVersion:'1.17.5',hasDisplayIds:true},rows:[
   {key:'tracks:0',kind:'tracks',sourceClientId:38,targetClientId:38,matched:true,label:'pedestrian',targetLabel:'pedestrian',labelMismatch:false,frames:13},
   {key:'tracks:1',kind:'tracks',sourceClientId:72,targetClientId:72,matched:true,label:'vehicles',targetLabel:'pedestrian',labelMismatch:true,frames:3}
  ],targets:[{kind:'tracks',clientID:38,label:'pedestrian'},{kind:'tracks',clientID:72,label:'pedestrian'}]};
  await __C3D_ANNOTATION_IO_UI.mount({jobId:1224,sessionId:'fixture',data:{},toast(){},request:async(type,payload)=>{requests.push({type,payload});return type==='PREVIEW_ANNOTATION_IMPORT'?preview:{changed:[38],message:'Editor updated.'};}}).open();
 });
 await expect(page.getByRole('dialog')).toContainText('Job 1264');await expect(page.getByRole('dialog')).toContainText('Job 1224');
 await expect(page.getByRole('dialog')).toContainText('Khác class: đích pedestrian, mẫu vehicles');
 await expect(page.locator('[data-import-key="tracks:0"]')).toBeChecked();await expect(page.locator('[data-import-key="tracks:1"]')).not.toBeChecked();
 await expect(page.getByRole('button',{name:'Áp dụng chỉnh sửa',exact:true})).toBeDisabled();
 await page.getByRole('checkbox',{name:'Xác nhận mẫu khác job',exact:true}).check();
 await page.getByRole('checkbox',{name:'Xác nhận thay đổi annotation',exact:true}).check();
 await page.getByRole('checkbox',{name:'Xác nhận mẫu khác job',exact:true}).uncheck();
 await expect(page.getByRole('checkbox',{name:'Xác nhận thay đổi annotation',exact:true})).not.toBeChecked();
 await page.getByRole('checkbox',{name:'Xác nhận mẫu khác job',exact:true}).check();await page.getByRole('checkbox',{name:'Xác nhận thay đổi annotation',exact:true}).check();
 await page.getByRole('button',{name:'Áp dụng chỉnh sửa',exact:true}).click();
 expect(await page.evaluate(()=>requests.at(-1).payload)).toEqual({jobId:1224,sessionId:'fixture',token:'cross-job',keys:['tracks:0'],confirmCrossJob:true});
});


async function setupReplacement(page,backupFails=false){
 await page.setContent('<body></body>');await page.addScriptTag({path:'extension/annotation_io_ui.js'});
 await page.evaluate(async backupFails=>{
  window.requests=[];window.backupClicks=0;HTMLAnchorElement.prototype.click=function(){backupClicks++;};
  await __C3D_ANNOTATION_IO_UI.mount({mode:'recreate',jobId:1224,sessionId:'fixture',data:{},toast(){},request:async(type,payload)=>{
   requests.push({type,payload});
   if(type==='PREVIEW_ANNOTATION_IMPORT')return {mode:'recreate',token:'recreate-fixture',existing:79,crossJob:true,source:{jobId:1264},rows:[{key:'tracks:0'},{key:'tracks:1'}]};
   if(type==='EXPORT_ALL_ANNOTATIONS'){if(backupFails)throw new Error('Backup failed');return {data:{c3d:{toolVersion:'1.17.7'},tracks:[]}};}
   return {added:[{clientID:80},{clientID:81}],removed:[1,2],message:'Save CVAT; Undo available.'};
  }}).open();
 },backupFails);
}

test('full replacement is explicit, requires confirmation, requests backup before import and uses no ID mappings',async({page})=>{
 await setupReplacement(page);await expect(page.getByRole('heading')).toHaveText('Xóa annotation hiện tại & import mới');
 await expect(page.getByRole('dialog')).toContainText('79 đối tượng');await expect(page.getByRole('dialog')).toContainText('CVAT cấp ID mới');await expect(page.getByRole('dialog')).toContainText('Nguồn Job 1264');
 await expect(page.getByRole('combobox')).toHaveCount(0);await expect(page.getByRole('button',{name:'Xóa & import mới',exact:true})).toBeDisabled();
 await page.getByRole('checkbox',{name:'Confirm full replacement'}).check();await page.getByRole('button',{name:'Xóa & import mới',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Đã import 2');
 expect(await page.evaluate(()=>requests.map(r=>r.type))).toEqual(['PREVIEW_ANNOTATION_IMPORT','EXPORT_ALL_ANNOTATIONS','IMPORT_ALL_ANNOTATIONS']);
 expect(await page.evaluate(()=>requests.at(-1).payload)).toEqual({jobId:1224,sessionId:'fixture',token:'recreate-fixture',keys:['tracks:0','tracks:1'],confirmRecreate:true,confirmCrossJob:true});
 expect(await page.evaluate(()=>backupClicks)).toBe(1);
});

test('failed replacement backup stops before any import',async({page})=>{
 await setupReplacement(page,true);await page.getByRole('checkbox',{name:'Confirm full replacement'}).check();await page.getByRole('button',{name:'Xóa & import mới',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Backup failed');expect(await page.evaluate(()=>requests.some(r=>r.type==='IMPORT_ALL_ANNOTATIONS'))).toBe(false);
});

test('closing full replacement preview does not export or import',async({page})=>{
 await setupReplacement(page);await page.getByRole('button',{name:'Đóng',exact:true}).click();
 expect(await page.evaluate(()=>requests.length)).toBe(1);await expect(page.getByRole('dialog')).toHaveCount(0);
});
