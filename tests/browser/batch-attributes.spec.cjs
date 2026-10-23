const {test,expect}=require('@playwright/test');
async function open(page){
 await page.setContent('<body><div id="root"><button id="c3d-batch-size">Batch Edit</button></div></body>');await page.addStyleTag({path:'extension/styles.css'});await page.addScriptTag({path:'extension/batch_size_ui.js'});
 await page.evaluate(()=>{
  window.requests=[];window.previewFails=false;
  __C3D_BATCH_SIZE_UI.mount({root:document.querySelector('#root'),snapshot:()=>({activeBoxId:30}),reference:()=>({clientId:30}),toast(){},request:async(type,payload)=>{
   requests.push({type,payload});
   if(type==='BATCH_SIZE_OPEN')return {token:'edit',clientId:30,jobId:1224,start:0,stop:59,frame:7,dimensions:[.85,.78,1.71],attributes:[{id:1,name:'age',mutable:false,inputType:'select',values:['child','adult'],value:'adult'},{id:2,name:'pose',mutable:true,inputType:'select',values:['standing','sitting','bending'],value:'standing'},{id:3,name:'ride_state',mutable:true,inputType:'checkbox',values:['false'],value:'false'}]};
   if(type==='BATCH_SIZE_PREVIEW'){
    if(payload.attributes[1]&&!payload.confirmTrackAttributes)throw new Error('age áp dụng TOÀN TRACK; cần xác nhận');
    return {token:'edit',planId:1,mode:'attributes',clientId:30,from:payload.from,to:payload.to,frames:[7,8,9],skipped:[],unchanged:[],boundaryFrames:[10],attributes:Object.entries(payload.attributes).map(([id,value])=>({name:({1:'age',2:'pose',3:'ride_state'})[id],value,mutable:id!=='1'}))};
   }
   if(type==='BATCH_SIZE_APPLY')return {appliedFrames:[7,8,9],boundaryFrames:[10],error:null,saveRequired:true};
  }});
 });
 await page.getByRole('button',{name:'Batch Edit',exact:true}).click();await page.locator('[data-mode]').selectOption('attributes');
}
test('Batch Edit attribute UI selects fields from schema, preserves boolean false and invalidates changed previews',async({page})=>{
 await open(page);await expect(page.locator('[data-size]')).not.toBeVisible();await expect(page.locator('[data-attributes]')).toBeVisible();
 await page.locator('[data-from]').fill('7');await page.locator('[data-to]').fill('9');await page.getByRole('checkbox',{name:'Sửa pose',exact:true}).check();await page.getByRole('combobox',{name:'Giá trị pose',exact:true}).selectOption('sitting');
 await page.getByRole('checkbox',{name:'Sửa ride_state',exact:true}).check();await page.getByRole('button',{name:'Xem trước',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('pose = sitting');await expect(page.getByRole('status')).toContainText('ride_state = false');await page.screenshot({path:'dist/batch-edit-attributes.local.png'});
 expect(await page.evaluate(()=>requests.at(-1).payload)).toMatchObject({mode:'attributes',from:7,to:9,attributes:{2:'sitting',3:'false'}});
 await expect(page.getByRole('button',{name:'Xác nhận áp dụng',exact:true})).toBeEnabled();
 await page.getByRole('checkbox',{name:'Giá trị ride_state',exact:true}).check();await expect(page.getByRole('button',{name:'Xác nhận áp dụng',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Xem trước',exact:true}).click();await page.getByRole('button',{name:'Xác nhận áp dụng',exact:true}).click();await expect(page.getByRole('status')).toContainText('Đã sửa 3 frame');
});
test('age is visibly whole-track and requires explicit scope confirmation',async({page})=>{
 await open(page);await expect(page.locator('[data-attributes]')).toContainText('age · TOÀN TRACK');
 await page.getByRole('checkbox',{name:'Sửa age',exact:true}).check();await page.getByRole('combobox',{name:'Giá trị age',exact:true}).selectOption('child');
 await page.getByRole('button',{name:'Xem trước',exact:true}).click();await expect(page.getByRole('status')).toContainText('cần xác nhận');await expect(page.getByRole('button',{name:'Xác nhận áp dụng',exact:true})).toBeDisabled();
 await page.getByRole('checkbox',{name:'Xác nhận thuộc tính toàn track',exact:true}).check();await page.getByRole('button',{name:'Xem trước',exact:true}).click();await expect(page.getByRole('status')).toContainText('age = child (TOÀN TRACK)');
 expect(await page.evaluate(()=>requests.at(-1).payload.confirmTrackAttributes)).toBe(true);
});
