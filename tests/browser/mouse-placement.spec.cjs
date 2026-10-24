const {test,expect}=require('@playwright/test'),{fixture}=require('./manual-fixture.cjs'),{reveal}=require('./ui-helpers.cjs');
test('M places exact Top cursor XY without refinement, ground snap or rotation',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
 await page.mouse.move(390,510);await page.keyboard.press('m');await expect.poll(()=>page.evaluate(()=>savedEdits.length)).toBe(1);
 const p=await page.evaluate(()=>savedEdits[0]);expect(p[0]).toBeCloseTo(2);expect(p[1]).toBeCloseTo(1);expect(p.slice(2)).toEqual([1,0,0,0,4,2,2,0,0,0,0,0,0,0]);expect(errors).toEqual([]);
});
test('E moves nearest Top corner using native opposite-corner anchoring',async({page})=>{
 await fixture(page);await page.mouse.move(405,495);await page.keyboard.press('e');await expect.poll(()=>page.evaluate(()=>savedEdits.length)).toBe(1);
 const p=await page.evaluate(()=>savedEdits[0]);expect(p[0]).toBeCloseTo(.25);expect(p[1]).toBeCloseTo(.25);expect(p[6]).toBeCloseTo(4.5);expect(p[7]).toBeCloseTo(2.5);expect(p[2]).toBe(1);expect(p[8]).toBe(2);
});
test('circular R + left-drag previews then creates one native save and Escape cancels',async({page})=>{
 await fixture(page);await page.mouse.move(420,190);await page.keyboard.down('r');await page.mouse.down();await page.mouse.move(330,280,{steps:8});
 expect(await page.evaluate(()=>savedEdits.length)).toBe(0);await page.mouse.up();await page.keyboard.up('r');await expect.poll(()=>page.evaluate(()=>savedEdits.length)).toBe(1);
 expect((await page.evaluate(()=>savedEdits[0]))[5]).toBeCloseTo(-Math.PI/2);await page.mouse.move(420,190);await page.keyboard.down('r');await page.mouse.down();await page.mouse.move(330,280);await page.keyboard.press('Escape');await page.mouse.up();await page.keyboard.up('r');expect(await page.evaluate(()=>savedEdits.length)).toBe(1);expect(await page.evaluate(()=>testViews.perspective.controls.enabled)).toBe(true);
});
test('M in 3D aims Top camera without editing, then M in Top places the box',async({page})=>{
 await fixture(page);const before=await page.evaluate(()=>testViews.top.camera.position.toArray());await page.mouse.move(330,190);await page.keyboard.press('m');await expect(page.locator('#c3d-toast')).toContainText('Top view aimed');expect(await page.evaluate(()=>savedEdits.length)).toBe(0);expect(await page.evaluate(()=>testViews.top.camera.position.toArray())).not.toEqual(before);
 await page.mouse.move(330,540);await page.keyboard.press('m');await expect.poll(()=>page.evaluate(()=>savedEdits.length)).toBe(1);
});
test('replacement Auto Adjust preserves dimensions and yaw while closing both gaps',async({page})=>{
 await fixture(page);for(const [id,value] of [['c3d-auto-move',false],['c3d-move-longitudinal','forward'],['c3d-move-lateral','left']]){await reveal(page,id);if(typeof value==='boolean')await page.locator('#'+id).setChecked(value);else await page.locator('#'+id).selectOption(value);}
 await page.locator('.c3d-title').click();await page.mouse.move(330,540);await page.keyboard.press('Alt+Shift+b');await expect.poll(()=>page.evaluate(()=>savedEdits.length)).toBe(1);const p=await page.evaluate(()=>savedEdits[0]);expect(p[0]).toBeCloseTo(1.2,1);expect(p[1]).toBeCloseTo(.6,1);expect(p.slice(3,9)).toEqual([0,0,0,4,2,2]);
});
test('Auto Adjust failed contact commits none of the preceding planned changes',async({page})=>{
 await fixture(page,{object:false});await page.evaluate(()=>{testState.annotation.annotations.states[0].points[2]=1.3;});await reveal(page,'c3d-move-longitudinal');await page.locator('#c3d-move-longitudinal').selectOption('forward');await page.locator('.c3d-title').click();await page.mouse.move(390,510);await page.keyboard.press('Alt+Shift+b');await expect(page.locator('#c3d-toast')).toContainText('No supported');expect(await page.evaluate(()=>savedEdits.length)).toBe(0);expect(await page.evaluate(()=>testState.annotation.annotations.states[0].points[2])).toBe(1.3);
});
