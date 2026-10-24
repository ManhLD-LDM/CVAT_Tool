const {test,expect}=require('@playwright/test'),{fixture}=require('./manual-fixture.cjs'),{reveal}=require('./ui-helpers.cjs');
test('unchecked origin mode refuses missing local road; explicit origin mode works',async({page})=>{
 await fixture(page,{ground:false,object:false,origin:-.5});await page.locator('#c3d-btn-ground').click();await expect(page.locator('#c3d-toast')).toContainText('Reliable local ground unavailable');expect(await page.evaluate(()=>savedEdits.length)).toBe(0);
 await reveal(page,'c3d-origin-ground');await page.locator('#c3d-origin-ground').check();await page.locator('#c3d-btn-ground').click();await expect.poll(()=>page.evaluate(()=>savedEdits.length)).toBe(1);expect((await page.evaluate(()=>savedEdits[0]))[2]).toBeCloseTo(.5);
});
