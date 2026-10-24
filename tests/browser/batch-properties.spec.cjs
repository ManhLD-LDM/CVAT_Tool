const {test,expect}=require('@playwright/test');
test('property UI sends explicit values and distinguishes whole-track editor flags',async({page})=>{
 await page.setContent('<body><div id="root"><button id="c3d-batch-size">Batch Edit</button></div></body>');
 await page.addScriptTag({path:'extension/batch_size_ui.js'});
 await page.evaluate(()=>{
  window.requests=[];
  __C3D_BATCH_SIZE_UI.mount({root:document.querySelector('#root'),snapshot:()=>({activeBoxId:31}),reference:()=>({clientId:31}),toast(){},request:async(type,payload)=>{
   requests.push({type,payload});
   if(type==='BATCH_SIZE_OPEN')return {token:'flags',clientId:31,jobId:1224,label:'two-wheels',start:0,stop:59,frame:0,dimensions:[2,.7,1.6],attributes:[]};
   if(type==='BATCH_SIZE_PREVIEW'){
    const global=['lock','hidden','pinned'].includes(payload.property);
    if(global&&!payload.confirmGlobal)throw Error('Cần xác nhận TOÀN TRACK');
    return {...payload,planId:1,clientId:31,global,frames:[0],boundaryFrames:[],skipped:[]};
   }
   if(type==='BATCH_SIZE_APPLY')return {appliedFrames:[0],boundaryFrames:[],editorOnly:true,saveRequired:false};
  }});
 });
 await page.getByRole('button',{name:'Batch Edit',exact:true}).click();
 await page.locator('[data-mode]').selectOption('property');
 await expect(page.locator('[data-size]')).not.toBeVisible();
 await page.locator('[data-property-name]').selectOption('occluded');
 await page.locator('[data-property-value]').selectOption('false');
 await page.getByRole('button',{name:'Xem trước',exact:true}).click();
 expect(await page.evaluate(()=>requests.at(-1).payload)).toMatchObject({property:'occluded',value:false,mode:'property'});
 for(const name of ['keyframe','lock','hidden','pinned'])await page.locator('[data-property-name]').selectOption(name);
 await page.getByRole('button',{name:'Xem trước',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Cần xác nhận TOÀN TRACK');
 await expect(page.getByRole('button',{name:'Xác nhận áp dụng',exact:true})).toBeDisabled();
 await page.locator('[data-confirm-global]').check();
 await page.getByRole('button',{name:'Xem trước',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('TOÀN TRACK / chỉ phiên editor');
 await page.getByRole('button',{name:'Xác nhận áp dụng',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('không lưu trong annotation server');
});
