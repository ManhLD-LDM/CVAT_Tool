const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {reveal}=require('./ui-helpers.cjs');
async function open(page){await page.goto('http://127.0.0.1:4173/demo/index.html');await page.locator('[data-case="2"]').click();await expect(page.locator('#c3d-btn-autofit')).toBeEnabled();}
test('floating tasks retain one instance of controls and navigation never edits annotations',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
 const before=await page.locator('#demo-edit-count').textContent();
 await expect(page.locator('#c3d-task-box')).toBeVisible();await expect(page.locator('#c3d-task-data')).toBeHidden();
 for(const name of ['qc','camera','data','settings','box']){await page.getByRole('tab',{name:{qc:'QC',camera:'Camera',data:'Dữ liệu',settings:'Cài đặt',box:'Box'}[name],exact:true}).click();await expect(page.locator('#c3d-task-'+name)).toBeVisible();await expect(page.locator('[role=tabpanel]:visible')).toHaveCount(1);}
 await page.locator('#c3d-tab-data').click();await expect(page.locator('#c3d-btn-import-recreate')).toBeHidden();await page.locator('.c3d-danger-zone summary').click();await expect(page.locator('#c3d-btn-import-recreate')).toBeVisible();
 const duplicates=await page.evaluate(()=>{const ids=[...document.querySelectorAll('#cvat-3d-copilot-root [id]')].map(n=>n.id);return ids.filter((x,i)=>ids.indexOf(x)!==i);});expect(duplicates).toEqual([]);
 expect(await page.locator('#demo-edit-count').textContent()).toBe(before);expect(errors).toEqual([]);
 await page.locator('#c3d-tab-box').click();await page.screenshot({path:'docs/verification/ui-tasks-1.20.0.png',fullPage:true});
});
test('expand, keyboard tabs and collapse retain selection and editable input values',async({page})=>{
 await open(page);const selected=await page.locator('#c3d-select-box').inputValue();
 await reveal(page,'c3d-preset-l');await page.locator('#c3d-preset-l').fill('4.75');
 await page.locator('#c3d-btn-expand').click();await expect(page.locator('#cvat-3d-copilot-root')).toHaveClass(/c3d-expanded/);
 await page.evaluate(()=>{window.tabArrowLeaks=0;document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')tabArrowLeaks++;});});await page.locator('#c3d-tab-box').focus();await page.keyboard.press('ArrowRight');expect(await page.evaluate(()=>tabArrowLeaks)).toBe(0);await expect(page.locator('#c3d-tab-qc')).toHaveAttribute('aria-selected','true');
 await page.locator('#c3d-tab-box').click();await expect(page.locator('#c3d-preset-l')).toHaveValue('4.75');await expect(page.locator('#c3d-select-box')).toHaveValue(selected);
 await page.locator('#c3d-btn-expand').click();await expect(page.locator('#cvat-3d-copilot-root')).not.toHaveClass(/c3d-expanded/);
 await page.locator('#c3d-btn-toggle').click();await expect(page.locator('#c3d-content-body')).toBeHidden();await expect(page.locator('.c3d-footer')).toBeHidden();
 await page.locator('#c3d-btn-toggle').click();await expect(page.locator('#c3d-preset-l')).toHaveValue('4.75');
});
test('panel stays inside narrow viewport and reinjection cleans up its prior UI',async({page})=>{
 await open(page);await page.setViewportSize({width:390,height:850});await page.locator('#c3d-btn-expand').click();
 const rect=await page.locator('#cvat-3d-copilot-root').boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(391);
 await page.addScriptTag({content:fs.readFileSync('extension/content_script.js','utf8')});await expect(page.locator('#cvat-3d-copilot-root')).toHaveCount(1);await expect(page.locator('[role=tab]')).toHaveCount(6);
 await page.screenshot({path:'docs/verification/ui-mobile-1.20.0.png',fullPage:true});
});
