const {test,expect}=require('@playwright/test'),{fixture}=require('./manual-fixture.cjs'),{reveal}=require('./ui-helpers.cjs');
async function settings(page){await reveal(page,'c3d-btn-settings');await page.locator('#c3d-btn-settings').click();await expect(page.getByRole('dialog',{name:'Shortcuts & controls',exact:true})).toBeVisible();}
test('mouse and held-key wheel controls record, persist, and execute in the viewport',async({page})=>{
 await fixture(page);await settings(page);await expect(page.getByText('Maximum shrink distance (cm)',{exact:true})).toHaveCount(0);
 await page.locator('[data-action="MOVE_TO_MOUSE"]').click();await page.locator('.c3d-control-capture').dispatchEvent('pointerdown',{button:1});await expect(page.locator('[data-action="MOVE_TO_MOUSE"]')).toHaveText('Middle mouse');
 await page.locator('[data-action="SNAP_GROUND"]').click();await page.locator('.c3d-control-capture').hover();await page.keyboard.down('t');await page.mouse.wheel(0,-100);await expect(page.locator('[data-action="SNAP_GROUND"]')).toHaveText('T+Wheel up');await page.keyboard.up('t');
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.mouse.move(390,510);await page.mouse.click(390,510,{button:'middle'});await expect.poll(()=>page.evaluate(()=>savedEdits.length)).toBe(1);
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('c3d.settings.v1')));expect(stored.bindings.MOVE_TO_MOUSE.code).toBe('Mouse1');expect(stored.bindings.SNAP_GROUND.hold).toBe('KeyT');
 await settings(page);await expect(page.locator('[data-action="MOVE_TO_MOUSE"]')).toHaveText('Middle mouse');await page.getByRole('button',{name:'Close',exact:true}).click();await page.mouse.move(330,540);await page.keyboard.down('t');await page.mouse.wheel(0,-80);await page.keyboard.up('t');await expect.poll(()=>page.evaluate(()=>savedEdits.length)).toBe(2);
});
test('rotation accepts mouse-only rebindings, duplicate controls fail, and keyboard recording still works',async({page})=>{
 await fixture(page);await settings(page);await page.locator('[data-action="ROTATE_DRAG"]').click();await page.locator('.c3d-control-capture').dispatchEvent('pointerdown',{button:2});await expect(page.locator('[data-action="ROTATE_DRAG"]')).toHaveText('Right mouse');
 await page.locator('[data-action="MOVE_TO_MOUSE"]').click();await page.locator('.c3d-control-capture').dispatchEvent('pointerdown',{button:2});await expect(page.locator('#c3d-shortcut-message')).toContainText('Already assigned');await page.keyboard.press('Escape');
 await page.locator('[data-action="MOVE_TO_MOUSE"]').click();await page.keyboard.press('z');await expect(page.locator('[data-action="MOVE_TO_MOUSE"]')).toHaveText('Z');await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.mouse.move(420,190);await page.mouse.down({button:'right'});await page.mouse.move(330,280);await page.mouse.up({button:'right'});await expect.poll(()=>page.evaluate(()=>savedEdits.length)).toBe(1);expect((await page.evaluate(()=>savedEdits[0]))[5]).toBeCloseTo(-Math.PI/2);
});
test('Camera Appearance changes projections independently and survives viewport refresh',async({page})=>{
 await fixture(page);await page.locator('#c3d-tab-camera').click();await page.locator('#c3d-background-hex').fill('#243447');await page.locator('#c3d-projection-follow').uncheck();await page.locator('#c3d-projection-number').fill('28');await page.locator('#c3d-projection-number').press('Tab');
 await expect.poll(()=>page.evaluate(()=>testViews.top.scene.children.find(o=>o.isPoints).material.size)).toBe(28);expect(await page.evaluate(()=>testViews.perspective.scene.children.find(o=>o.isPoints).material.size)).toBe(2);expect(await page.evaluate(()=>testViews.front.scene.background.getHexString())).toBe('243447');
 await page.locator('#c3d-projection-reset').click();await expect.poll(()=>page.evaluate(()=>testViews.top.scene.children.find(o=>o.isPoints).material.size)).toBe(2);expect(await page.evaluate(()=>savedEdits.length)).toBe(0);
 await page.screenshot({path:'docs/verification/appearance-1.22.0.png',fullPage:true});
});
