const {test,expect}=require('@playwright/test');
const fs=require('node:fs');

async function fixture(page){
    await page.goto('http://127.0.0.1:4173/demo/index.html');
    // Exercise the extension storage API, including reload persistence.
    await page.evaluate(()=>window.__CVAT_COPILOT_PANEL.dispose());
    await page.evaluate(()=>{
        window.chrome={storage:{local:{
            async get(key){return {[key]:JSON.parse(localStorage.getItem(key)||'null')};},
            async set(values){for(const [key,value] of Object.entries(values))localStorage.setItem(key,JSON.stringify(value));}
        }}};
        window.requests=[];
        window.addEventListener('c3d:request:v2',e=>requests.push(JSON.parse(e.detail)));
    });
    await page.addScriptTag({content:fs.readFileSync('extension/content_script.js','utf8')});
    await expect(page.locator('#c3d-btn-settings')).toBeEnabled();
}

test('settings record single keys, reject duplicates, persist direction and refresh hints',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await fixture(page);
    await page.locator('#c3d-keep-direction').check();
    await expect(page.locator('#c3d-adjust-direction')).not.toBeChecked();
    await page.locator('#c3d-adjust-direction').check();
    await page.locator('#c3d-btn-settings').click();
    await page.getByRole('button',{name:'Record Ground Snap shortcut',exact:true}).click();
    await page.keyboard.press('Alt+Shift+A');
    await expect(page.locator('#c3d-shortcut-message')).toContainText('Already assigned');
    await page.keyboard.press('Escape');
    await expect(page.locator('#c3d-shortcut-message')).toHaveText('Recording cancelled');
    await page.getByRole('button',{name:'Record Ground Snap shortcut',exact:true}).click();
    await page.keyboard.press('Shift');
    await expect(page.locator('#c3d-shortcut-message')).toContainText('supported key');
    await page.keyboard.press('z');
    await expect(page.locator('#c3d-shortcut-message')).toHaveText('Saved');
    await page.screenshot({path:'docs/verification/shortcuts-1.10.0.png'});
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await expect(page.locator('#c3d-btn-ground')).toHaveAttribute('title','Ground Snap · Z');
    await page.screenshot({path:'docs/verification/direction-controls-1.10.0.png'});
    await page.keyboard.press('Alt+Shift+A');
    await expect.poll(()=>page.evaluate(()=>requests.filter(r=>r.type==='AUTO_FIT').length)).toBe(1);
    expect(await page.evaluate(()=>requests.find(r=>r.type==='AUTO_FIT').payload.keepDirection)).toBe(true);
    await page.reload();
    await expect(page.locator('#c3d-keep-direction')).toBeChecked();
    await expect(page.locator('#c3d-adjust-direction')).toBeChecked();
    await expect(page.locator('#c3d-btn-ground')).toHaveAttribute('title','Ground Snap · Z');
    expect(errors).toEqual([]);
});

test('settings suppress actions, support clear/reset and ignore typing, extra modifiers and repeats',async({page})=>{
    await fixture(page);
    await page.locator('#c3d-btn-settings').click();
    await page.keyboard.press('Alt+Shift+A');
    expect(await page.evaluate(()=>requests.filter(r=>r.type==='AUTO_FIT').length)).toBe(0);
    await page.getByRole('button',{name:'Clear Ground Snap shortcut',exact:true}).click();
    await expect(page.getByRole('button',{name:'Record Ground Snap shortcut',exact:true})).toHaveText('Unassigned');
    await page.getByRole('button',{name:'Reset Ground Snap shortcut',exact:true}).click();
    await expect(page.getByRole('button',{name:'Record Ground Snap shortcut',exact:true})).toHaveText('Alt+Shift+G');
    await page.getByRole('button',{name:'Record Auto-Fit shortcut',exact:true}).click();
    await page.keyboard.press('x');
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.evaluate(()=>{
        const field=document.createElement('input');document.body.append(field);field.focus();
    });
    await page.keyboard.press('x');
    await page.evaluate(()=>document.activeElement.blur());
    await page.keyboard.press('Control+x');
    await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyX',repeat:true,bubbles:true})));
    expect(await page.evaluate(()=>requests.filter(r=>r.type==='AUTO_FIT').length)).toBe(0);
    await page.keyboard.press('x');
    await expect.poll(()=>page.evaluate(()=>requests.filter(r=>r.type==='AUTO_FIT').length)).toBe(1);
    await expect(page.locator('#c3d-btn-autofit')).toBeEnabled();
    await page.locator('#c3d-btn-settings').click();
    await page.getByRole('button',{name:'Reset all shortcuts',exact:true}).click();
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await expect(page.locator('#c3d-btn-autofit kbd')).toHaveText('Alt+Shift+A');
    await expect(page.locator('#c3d-btn-move')).toBeDisabled();
});
