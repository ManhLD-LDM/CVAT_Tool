const {test,expect}=require('@playwright/test');
async function setup(page){
 await page.setContent('<html><body><div id="root"><button id="c3d-batch-size">Batch Size Update</button></div></body></html>');
 await page.addStyleTag({path:'extension/styles.css'});
 await page.addScriptTag({path:'extension/geometry_math.js'});await page.addScriptTag({path:'extension/batch_size.js'});await page.addScriptTag({path:'extension/batch_size_ui.js'});
 await page.evaluate(()=>{
  window.historyFrames=[];window.shapes=new Map([0,59].map(frame=>[frame,{frame,points:[frame,.1*frame,1,0,0,.2,4,2,2,0,0,0,0,0,0,0],type:'cuboid',outside:false}]));
  const stateAt=frame=>{
   const a=[...shapes.keys()].sort((a,b)=>a-b),left=a.filter(x=>x<=frame).at(-1),right=a.find(x=>x>=frame),p=shapes.get(left).points.map((v,i)=>right===left?v:v+(shapes.get(right).points[i]-v)*(frame-left)/(right-left));
   return {frame,clientID:5,objectType:'track',shapeType:'cuboid',keyframe:shapes.has(frame),outside:false,points:p,save:async function(){historyFrames.push(frame);shapes.set(frame,{frame,points:this.points.slice(),type:'cuboid',outside:false});}};
  };
  window.nativeJob={startFrame:0,stopFrame:59,annotations:{get:async frame=>[stateAt(frame)],export:async()=>({tracks:[{clientID:5,id:777,shapes:[...shapes.values()].sort((a,b)=>a.frame-b.frame)}]})}};
  window.snap={jobId:601,sessionId:'browser',frame:20,activeBoxId:5,boxes:[{id:5,objectType:'track',points:stateAt(20).points}]};
  const controller=__C3D_CREATE_BATCH_SIZE_CONTROLLER({math:__CVAT_COPILOT_MATH,job:()=>nativeJob,snapshot:()=>snap,assertEditable(){},lock(){},refresh:async()=>{}});
  const map={BATCH_SIZE_OPEN:'open',BATCH_SIZE_PREVIEW:'preview',BATCH_SIZE_APPLY:'apply',BATCH_SIZE_CANCEL:'cancel'};
  window.requests=[];window.ui=__C3D_BATCH_SIZE_UI.mount({root:document.querySelector('#root'),snapshot:()=>snap,reference:()=>({clientId:5}),toast:message=>{throw new Error(message);},request:async(type,payload)=>{requests.push(type);return controller[map[type]](type==='BATCH_SIZE_OPEN'?payload.ref.clientId:payload);}});
 });
 await page.getByRole('button',{name:'Batch Size Update',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Batch Size Update'})).toBeVisible();
}
test('20-frame size update previews and confirms native writes with preserved ID and boundaries',async({page})=>{
 await setup(page);await page.locator('[data-from]').fill('20');await page.locator('[data-to]').fill('39');
 await page.locator('[data-l]').fill('4.5');await page.locator('[data-w]').fill('1.8');await page.locator('[data-h]').fill('1.5');
 await page.getByRole('button',{name:'Xem trước',exact:true}).click();await expect(page.getByRole('status')).toContainText('Sẽ sửa 20 frame');
 expect(await page.evaluate(()=>historyFrames.length)).toBe(0);
 await page.getByRole('button',{name:'Xác nhận áp dụng'}).click();await expect(page.getByRole('status')).toContainText('Đã sửa 20 frame; thêm 2 keyframe biên');
 expect(await page.evaluate(async()=>({size:shapes.get(20).points.slice(6,9),z:shapes.get(20).points[2],id:(await nativeJob.annotations.export()).tracks[0].id,frames:historyFrames}))).toEqual({size:[4.5,1.8,1.5],z:.75,id:777,frames:[19,40,...Array.from({length:20},(_,i)=>i+20)]});
});
test('editing inputs invalidates confirmation and invalid ranges make no native writes',async({page})=>{
 await setup(page);await page.locator('[data-l]').fill('4.5');await page.getByRole('button',{name:'Xem trước',exact:true}).click();
 await expect(page.getByRole('button',{name:'Xác nhận áp dụng'})).toBeEnabled();await page.locator('[data-h]').fill('1.6');await expect(page.getByRole('button',{name:'Xác nhận áp dụng'})).toBeDisabled();
 await page.locator('[data-from]').fill('40');await page.locator('[data-to]').fill('20');await page.getByRole('button',{name:'Xem trước',exact:true}).click();await expect(page.getByRole('status')).toContainText('1–1000 frame');expect(await page.evaluate(()=>historyFrames.length)).toBe(0);
});
test('whole job center mode deliberately updates existing keyframes and keeps center XYZ',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Toàn job',exact:true}).click();await page.locator('[data-anchor]').selectOption('center');await page.locator('[data-h]').fill('1.5');
 await page.getByRole('button',{name:'Xem trước',exact:true}).click();await expect(page.getByRole('status')).toContainText('Sẽ sửa 60 frame (gồm 2 keyframe hiện có)');
 await page.getByRole('button',{name:'Xác nhận áp dụng'}).click();await expect(page.getByRole('status')).toContainText('Đã sửa 60 frame');expect(await page.evaluate(()=>shapes.get(30).points.slice(0,3))).toEqual([30,3,1]);
});
test('closing preview does not mutate annotation',async({page})=>{
 await setup(page);await page.locator('[data-h]').fill('1.5');await page.getByRole('button',{name:'Xem trước',exact:true}).click();await page.getByRole('button',{name:'Đóng',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>historyFrames.length)).toBe(0);
});
