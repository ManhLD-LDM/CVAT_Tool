const {test,expect}=require('@playwright/test');
test('Ground Snap remains usable without local ground and identifies the LiDAR fallback',async({page})=>{
 await page.setContent('<html data-c3d-demo="true"><body></body></html>');
 await page.evaluate(()=>{
  window.snapCalls=0;
  const snapshot={sessionId:'ground-test',mode:'demo',connected:true,jobId:1,frame:0,revision:1,activeBoxId:1,
   boxes:[{id:1,labelId:1,label_name:'vehicles',points:[30,0,.1,0,0,0,4,2,2,0,0,0,0,0,0,0]}],labels:[{id:1,name:'vehicles'}],capabilities:{read:true,edit:true,ground:true,selection:true},saveState:'local'};
  window.addEventListener('c3d:request:v2',e=>{
   const q=JSON.parse(e.detail);let result={};
   if(q.type==='GET_SNAPSHOT')result=snapshot;
   if(q.type==='GET_GROUNDS')result={1:{accepted:false,reason:'No local road points',source:'point-cloud'}};
   if(q.type==='SNAP_GROUND'){snapCalls++;snapshot.boxes[0].points[2]=-.7;result={deltaZ:-.8,groundSource:'lidar-origin-ground',groundFallback:true};}
   window.dispatchEvent(new CustomEvent('c3d:response:v2',{detail:JSON.stringify({requestId:q.requestId,ok:true,result})}));
  });
 });
 await page.addScriptTag({path:'extension/copilot_panel.js'});
 await expect(page.locator('#c3d-road-info')).toContainText('No local road points');
 await expect(page.locator('#c3d-btn-ground')).toBeEnabled();await page.locator('#c3d-btn-ground').click();
 await expect(page.locator('#c3d-toast')).toContainText('LiDAR XY origin (fallback');expect(await page.evaluate(()=>snapCalls)).toBe(1);
});
