const {test,expect}=require('@playwright/test');
async function setup(page){
 await page.setContent('<body><div id="root"><button id="c3d-batch-size">Batch Edit</button></div></body>');await page.addStyleTag({path:'extension/styles.css'});await page.addScriptTag({path:'extension/batch_size_ui.js'});
 await page.evaluate(()=>{
  window.requests=[];
  __C3D_BATCH_SIZE_UI.mount({root:document.querySelector('#root'),snapshot:()=>({activeBoxId:31}),reference:()=>({clientId:31}),toast(){},request:async(type,payload)=>{
   requests.push({type,payload});if(type==='BATCH_SIZE_OPEN')return {token:'outside',clientId:31,jobId:1224,label:'two-wheels',start:0,stop:59,frame:0,dimensions:[1.63,.77,1.2],attributes:[]};
   if(type==='BATCH_SIZE_PREVIEW')return {token:'outside',planId:1,mode:'outside',clientId:31,from:payload.from,to:payload.to,outside:payload.outside,changedCount:3,frames:[7,8,9],skipped:[],unchanged:[],boundaryFrames:[6,10]};
   if(type==='BATCH_SIZE_APPLY')return {appliedFrames:[7,8,9],boundaryFrames:[6,10],saveRequired:true,error:null};
  }});
 });
 await page.getByRole('button',{name:'Batch Edit',exact:true}).click();await page.locator('[data-mode]').selectOption('outside');
}
test('Outside panel supports explicit true/false with range preview and native Apply confirmation',async({page})=>{
 await setup(page);await expect(page.locator('[data-size]')).not.toBeVisible();await expect(page.locator('[data-attributes]')).not.toBeVisible();await expect(page.locator('[data-outside]')).toBeVisible();
 await page.locator('[data-from]').fill('7');await page.locator('[data-to]').fill('9');await page.locator('[data-outside-value]').selectOption('false');await page.getByRole('button',{name:'Xem trước',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Outside = false (Hiện)');expect(await page.evaluate(()=>requests.at(-1).payload)).toMatchObject({mode:'outside',outside:false,from:7,to:9});
 await page.locator('[data-outside-value]').selectOption('true');await expect(page.getByRole('button',{name:'Xác nhận áp dụng',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Xem trước',exact:true}).click();await expect(page.getByRole('status')).toContainText('Outside = true (Ẩn)');await expect(page.getByRole('status')).toContainText('6, 10');
 await page.getByRole('button',{name:'Xác nhận áp dụng',exact:true}).click();await expect(page.getByRole('status')).toContainText('Đã sửa 3 frame');expect(await page.evaluate(()=>requests.at(-1).type)).toBe('BATCH_SIZE_APPLY');
});
test('switching functions invalidates Outside preview and closing does not apply',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Xem trước',exact:true}).click();await page.locator('[data-mode]').selectOption('size');await expect(page.locator('[data-outside]')).not.toBeVisible();await expect(page.locator('[data-size]')).toBeVisible();await expect(page.getByRole('button',{name:'Xác nhận áp dụng',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Đóng',exact:true}).click();expect(await page.evaluate(()=>requests.some(r=>r.type==='BATCH_SIZE_APPLY'))).toBe(false);
});
