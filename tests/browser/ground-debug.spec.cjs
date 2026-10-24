const {test,expect}=require('@playwright/test');

test('Inspect ground shows a copyable read-only report and invalidates it when settings or selection change',async({page})=>{
 await page.setContent('<html data-c3d-demo="true"><body></body></html>');
 await page.evaluate(()=>{
  window.commands=[];
  const snapshot={sessionId:'debug-test',mode:'demo',connected:true,jobId:1,frame:0,revision:1,activeBoxId:1,
   boxes:[1,2].map(id=>({id,labelId:1,label_name:'vehicles',points:[30,0,.1,0,0,0,4,2,2,0,0,0,0,0,0,0]})),
   labels:[{id:1,name:'vehicles'}],capabilities:{read:true,edit:true,ground:true,selection:true},saveState:'local'};
  window.addEventListener('c3d:request:v2',e=>{
   const q=JSON.parse(e.detail);commands.push(q);let result={};
   if(q.type==='GET_SNAPSHOT')result=snapshot;
   if(q.type==='GET_GROUNDS')result={1:{accepted:false,reason:'No local road points',source:'point-cloud'}};
   if(q.type==='SELECT_OBJECT'){snapshot.activeBoxId=q.payload.ref.clientId;}
   if(q.type==='INSPECT_GROUND')result={clientId:1,frame:0,mode:'origin',offset:-.2,box:{bottomZ:-.9},
    originReference:{point:[0,0,-1.7]},selectedGround:{source:'lidar-reference',heightAtBoxCenter:-1.3,
     bottomCorners:[{gap:.4},{gap:.5},{gap:.4},{gap:.5}],orientationWarning:'Road tilt unavailable'},
    localRoadError:'No local road points',preview:{deltaZ:-.4,bottomZ:-1.3,blockedByLargeAdjustment:false}};
   window.dispatchEvent(new CustomEvent('c3d:response:v2',{detail:JSON.stringify({requestId:q.requestId,ok:true,result})}));
  });
 });
 await page.addScriptTag({path:'extension/copilot_panel.js'});
 await expect(page.locator('#c3d-btn-ground-debug')).toBeEnabled();
 await page.locator('#c3d-origin-ground').check();
 await page.locator('#c3d-ground-height').fill('-.2');await page.locator('#c3d-ground-height').dispatchEvent('change');
 await page.locator('#c3d-btn-ground-debug').click();
 const summary=page.locator('#c3d-ground-debug-summary');
 await expect(summary).toContainText('Ground Z at box center: -1.300 m');
 await expect(summary).toContainText('Box lowest Z: -0.900 m');
 await expect(summary).toContainText('Proposed ΔZ (+ up / − down): -0.400 m');
 await expect(summary).toContainText('Road tilt unavailable');
 const report=page.locator('#c3d-ground-debug-report');
 await expect(report).toHaveValue(/"selectedGround"/);await expect(report).toHaveAttribute('readonly','');
 const requests=await page.evaluate(()=>commands.filter(q=>q.type==='INSPECT_GROUND'));
 expect(requests).toHaveLength(1);expect(requests[0].payload).toMatchObject({useOriginGround:true,fallbackGroundHeight:-.2});
 expect(await page.evaluate(()=>commands.some(q=>['SNAP_GROUND','AUTO_ADJUST','AUTO_FIT'].includes(q.type)))).toBe(false);
 await page.locator('#c3d-origin-ground').uncheck();await expect(page.locator('#c3d-ground-debug-result')).toBeHidden();
 await page.locator('#c3d-btn-ground-debug').click();await expect(summary).toBeVisible();
 await page.locator('#c3d-select-box').selectOption('2');await expect(page.locator('#c3d-ground-debug-result')).toBeHidden();
});
